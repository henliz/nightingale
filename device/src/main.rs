// nightingale capture daemon, pi zero 2 w target
//
// two buttons, final spec (17 oct 2026, ARCHITECTURE.md section 5):
//   POWER/RECORD (gpio 3): wakes the pi (hardware). once this daemon is up it records
//     straight away. a press stops, saves, queues (fsync) and runs systemctl poweroff,
//     so does hitting max_clip_seconds.
//   PHOTO (gpio 17): while recording, one photo (sharpest of a burst). ignored otherwise.
// nothing records without that button-initiated boot, no photo without a press. the
// state machine is machine.rs, the buttons are button.rs, hardware is hw.rs.
//
// uploads run on their own threads and drain the on-disk queue (queue.rs) whenever
// there's a connection, so chunks upload and transcribe while recording carries on.
// power off never waits for the network: whatever's still queued uploads next boot.
//
// NIGHTINGALE_MOCK=1 runs it anywhere with no hardware: keyboard "r" / "p" + enter
// are the two buttons, a test wav/jpg stand in for the mic and camera

use nightingale_device::button;
use nightingale_device::devlog::{self, error, info, warn};
use nightingale_device::hw::{self, MockHardware, PiHardware};
use nightingale_device::livestream;
use nightingale_device::machine::{Config, Event, Hardware, Machine, State};
use nightingale_device::queue::Queue;
use nightingale_device::upload::UploadClient;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

// big enough that a photo (~2.5 MB) or a 30s chunk (~1 MB) always goes up as one part.
// the vault is s3, and s3 rejects a multipart upload whose non-final parts are under
// 5 MB (EntityTooSmall), which is what broke 2 MB-chunked photos
const CHUNK_BYTES: usize = 8 * 1024 * 1024;

#[derive(Default)]
struct Counters {
    uploads_ok: AtomicU64,
    uploads_failed: AtomicU64,
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

fn env_u32(key: &str, default: u32) -> u32 {
    std::env::var(key)
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(default)
}

fn env_pin(key: &str) -> Option<u8> {
    std::env::var(key).ok().and_then(|s| s.parse().ok())
}

fn file_kb(path: &std::path::Path) -> u64 {
    std::fs::metadata(path).map(|m| m.len() / 1024).unwrap_or(0)
}

fn main() {
    let base_url = std::env::var("NIGHTINGALE_API_URL")
        .unwrap_or_else(|_| "http://localhost:8787".to_string());
    let mock = std::env::var("NIGHTINGALE_MOCK").is_ok_and(|v| v == "1");
    let device_token = std::env::var("NIGHTINGALE_DEVICE_TOKEN").ok();
    if !mock && !base_url.starts_with("https://") {
        eprintln!("refusing non-HTTPS API URL outside mock mode");
        return;
    }
    if !mock && device_token.as_deref().is_none_or(|token| token.len() < 32) {
        eprintln!(
            "NIGHTINGALE_DEVICE_TOKEN of at least 32 characters is required outside mock mode"
        );
        return;
    }
    // a safety net for a forgotten device, not the normal way to stop: the POWER/RECORD
    // press is. 90 s (the section 2 default) kept cutting drills off mid-scenario
    let max_clip_seconds = env_u32("NIGHTINGALE_MAX_CLIP_SECONDS", 1800);
    // 15 s: each saved chunk gets speaker labels, shorter chunks = labels sooner
    let chunk_seconds = env_u32("NIGHTINGALE_AUDIO_CHUNK_SECONDS", 15);
    let power_pin = env_u32("NIGHTINGALE_POWER_PIN", 3) as u8;
    let photo_pin = env_u32("NIGHTINGALE_PHOTO_PIN", 17) as u8;
    let dev = std::env::var("NIGHTINGALE_DEV").is_ok_and(|v| v == "1");
    let device_id = std::env::var("NIGHTINGALE_DEVICE_ID").unwrap_or_else(|_| {
        std::fs::read_to_string("/etc/hostname")
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|_| "nightingale".to_string())
    });
    let queue_dir = std::env::var("NIGHTINGALE_QUEUE_DIR").unwrap_or_else(|_| {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        format!("{home}/nightingale-queue")
    });

    let capture_id = format!("session_{}", now_secs());
    devlog::init(
        base_url.clone(),
        device_id.clone(),
        capture_id.clone(),
        device_token.clone(),
        dev,
    );

    let queue = match Queue::open(&queue_dir) {
        Ok(q) => Arc::new(q),
        Err(e) => {
            error(format!("can't open queue dir {queue_dir}: {e}"));
            std::process::exit(1);
        }
    };
    match queue.recover_incoming() {
        Ok(0) => {}
        Ok(n) => warn(format!(
            "recovered {n} file(s) cut off by the last shutdown, queued for upload"
        )),
        Err(e) => warn(format!("couldn't check for cut-off files: {e}")),
    }

    info(format!(
        "device {device_id} is ON{}, v{}, session {capture_id}, talking to {base_url}",
        if mock { " (MOCK MODE)" } else { "" },
        env!("CARGO_PKG_VERSION")
    ));
    let (queued, bytes) = queue.stats();
    if queued > 0 {
        info(format!(
            "{queued} file(s) ({} KB) waiting in the queue from before, uploading those first",
            bytes / 1024
        ));
    }

    let counters = Arc::new(Counters::default());
    spawn_uploader(&queue, &base_url, &counters, "wav", "audio");
    spawn_uploader(&queue, &base_url, &counters, "jpg", "photo");
    spawn_heartbeat(&queue, &counters);

    // live word-by-word transcription on the laptop, NIGHTINGALE_LIVE=0 to turn it off
    let live = (std::env::var("NIGHTINGALE_LIVE").as_deref() != Ok("0"))
        .then(|| livestream::start(base_url.clone(), capture_id.clone(), device_token.clone()));

    let cfg = Config {
        max_clip: Duration::from_secs(max_clip_seconds as u64),
        chunk: Duration::from_secs(chunk_seconds.max(5) as u64),
        min_sharpness: env_u32("NIGHTINGALE_MIN_SHARPNESS", 50) as f64,
    };
    let (tx, rx) = channel::<Event>();

    if mock {
        hw::mock_buttons(tx);
        info("[mock] buttons: r + enter = POWER/RECORD, p + enter = PHOTO");
        let hardware = MockHardware::new(
            std::env::var("NIGHTINGALE_MOCK_WAV")
                .ok()
                .map(PathBuf::from),
            std::env::var("NIGHTINGALE_MOCK_JPG")
                .ok()
                .map(PathBuf::from),
            live,
        );
        run(Machine::new(hardware, queue, capture_id, cfg), rx);
    } else {
        for (pin, event, name) in [
            (power_pin, Event::PowerPress, "POWER/RECORD"),
            (photo_pin, Event::PhotoPress, "PHOTO"),
        ] {
            match button::watch(pin, event, tx.clone()) {
                Ok(()) => info(format!("[button] {name} on gpio {pin}")),
                Err(e) => error(format!("[button] {name} on gpio {pin} not available: {e}")),
            }
        }
        let hardware = PiHardware::new(
            env_pin("NIGHTINGALE_LED_PIN"),
            env_pin("NIGHTINGALE_BUZZER_PIN"),
            std::env::var("NIGHTINGALE_NOTICE_WAV")
                .ok()
                .map(PathBuf::from),
            live,
        );
        run(Machine::new(hardware, queue, capture_id, cfg), rx);
    }
}

fn run<H: Hardware>(mut machine: Machine<H>, rx: Receiver<Event>) {
    machine.boot_complete();
    // anything pressed while we were booting doesn't count (button spec)
    while rx.try_recv().is_ok() {}

    loop {
        let event = match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(event) => event,
            Err(RecvTimeoutError::Timeout) => Event::Tick,
            Err(RecvTimeoutError::Disconnected) => {
                thread::sleep(Duration::from_millis(100));
                Event::Tick
            }
        };
        machine.handle(event);
        if machine.state() == State::PoweringOff {
            // poweroff's been asked for, systemd stops us from here. just stay out of the way
            loop {
                thread::sleep(Duration::from_secs(60));
            }
        }
    }
}

// drains one kind of file from the queue, oldest first. deletes a file only after the
// server says it arrived intact, otherwise backs off and retries the same file
fn spawn_uploader(
    queue: &Arc<Queue>,
    base_url: &str,
    counters: &Arc<Counters>,
    ext: &'static str,
    kind: &'static str,
) {
    let queue = queue.clone();
    let counters = counters.clone();
    let client = UploadClient::new_with_token(base_url.to_string(), device_token);
    thread::spawn(move || {
        let mut backoff = 2u64;
        // same file + server said no this many times in a row = it's the file, not the wifi
        let mut rejections: (PathBuf, u32) = (PathBuf::new(), 0);
        loop {
            let next = queue.pending(ext).ok().and_then(|p| p.into_iter().next());
            let Some(file) = next else {
                thread::sleep(Duration::from_millis(500));
                continue;
            };
            let name = file
                .path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            let kb = file_kb(&file.path);

            // empty, or a wav that's only a header: nothing in it to upload
            let size = std::fs::metadata(&file.path).map(|m| m.len()).unwrap_or(0);
            if size == 0 || (ext == "wav" && size <= 44) {
                warn(format!(
                    "[{kind}] {name} is empty ({size} bytes), nothing to upload, moved to stuck/"
                ));
                queue.set_aside(&file.path).ok();
                continue;
            }
            let started = Instant::now();

            let failure = match client.upload_file_at(
                &file.capture_id,
                kind,
                &file.path,
                CHUNK_BYTES,
                file.captured_at_ms,
            ) {
                Ok(res) if res.verified => {
                    std::fs::remove_file(&file.path).ok();
                    counters.uploads_ok.fetch_add(1, Ordering::Relaxed);
                    info(format!(
                        "[{kind}] uploaded {name} ({kb} KB) in {:.1}s, asset {}",
                        started.elapsed().as_secs_f32(),
                        res.asset_id
                    ));
                    backoff = 2;
                    None
                }
                Ok(_) => Some("server says the sha256 didn't match".to_string()),
                Err(e) => Some(e.to_string()),
            };

            if let Some(reason) = failure {
                counters.uploads_failed.fetch_add(1, Ordering::Relaxed);
                if reason.contains("rejected") {
                    rejections = if rejections.0 == file.path {
                        (file.path.clone(), rejections.1 + 1)
                    } else {
                        (file.path.clone(), 1)
                    };
                    if rejections.1 >= 3 {
                        warn(format!(
                            "[{kind}] the laptop rejected {name} 3 times ({reason}), moved it to stuck/ so the rest of the queue keeps uploading"
                        ));
                        queue.set_aside(&file.path).ok();
                        backoff = 2;
                        continue;
                    }
                }
                warn(format!(
                    "[{kind}] upload of {name} failed, keeping it queued, retry in {backoff}s: {reason}"
                ));
                thread::sleep(Duration::from_secs(backoff));
                backoff = (backoff * 2).min(30);
            }
        }
    });
}

// every 30s: are we alive, how backed up is the queue, is the pi cooking itself
fn spawn_heartbeat(queue: &Arc<Queue>, counters: &Arc<Counters>) {
    let queue = queue.clone();
    let counters = counters.clone();
    let started = Instant::now();
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(30));
        let (queued, bytes) = queue.stats();
        let mut parts = vec![
            format!("up {}m", started.elapsed().as_secs() / 60),
            format!("queue {queued} file(s) / {} KB", bytes / 1024),
            format!(
                "{} uploaded, {} failed attempts",
                counters.uploads_ok.load(Ordering::Relaxed),
                counters.uploads_failed.load(Ordering::Relaxed),
            ),
        ];
        if let Some(c) = cpu_temp_c() {
            parts.push(format!("cpu {c:.1}C"));
        }
        if let Some(dbm) = wifi_dbm() {
            parts.push(format!("wifi {dbm} dBm"));
        }
        info(format!("[heartbeat] {}", parts.join(", ")));
    });
}

fn cpu_temp_c() -> Option<f32> {
    let raw = std::fs::read_to_string("/sys/class/thermal/thermal_zone0/temp").ok()?;
    Some(raw.trim().parse::<f32>().ok()? / 1000.0)
}

// /proc/net/wireless: two header lines, then "wlan0: 0000   45.  -65.  -256 ..."
fn wifi_dbm() -> Option<i32> {
    let raw = std::fs::read_to_string("/proc/net/wireless").ok()?;
    let line = raw.lines().nth(2)?;
    let level = line.split_whitespace().nth(3)?;
    level.trim_end_matches('.').parse().ok()
}
