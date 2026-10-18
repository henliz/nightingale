// the two Hardware implementations the state machine runs on:
//
//   PiHardware    real mic (arecord), camera (rpicam), optional led/buzzer gpio pins,
//                 an optional notice wav played with aplay, `systemctl poweroff`
//   MockHardware  NIGHTINGALE_MOCK=1, runs anywhere: copies a test wav/jpg instead of
//                 recording, buttons come from the keyboard (see mock_buttons), and
//                 "power off" just exits the process

use crate::capture::{self, AudioRecording};
use crate::devlog::{info, warn};
use crate::machine::{Event, Hardware, Result};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc::{Sender, SyncSender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

// what the responder should say once recording starts (ARCHITECTURE.md section 2)
const NOTICE: &str = "I'm recording for the medical record";

pub struct PiHardware {
    started: Instant,
    recording: Option<AudioRecording>,
    notice_wav: Option<PathBuf>,
    live: Option<SyncSender<Vec<u8>>>,
    #[cfg(target_os = "linux")]
    led: Option<rppal::gpio::OutputPin>,
    #[cfg(target_os = "linux")]
    buzzer: Option<rppal::gpio::OutputPin>,
}

impl PiHardware {
    /// led_pin / buzzer_pin are optional bcm numbers, nothing's wired for them yet
    pub fn new(
        led_pin: Option<u8>,
        buzzer_pin: Option<u8>,
        notice_wav: Option<PathBuf>,
        live: Option<SyncSender<Vec<u8>>>,
    ) -> Self {
        #[cfg(target_os = "linux")]
        let output = |pin: Option<u8>, what: &str| {
            let pin = pin?;
            match rppal::gpio::Gpio::new().and_then(|g| g.get(pin)) {
                Ok(p) => Some(p.into_output_low()),
                Err(e) => {
                    warn(format!("[hw] no {what} on gpio {pin}: {e}"));
                    None
                }
            }
        };
        #[cfg(not(target_os = "linux"))]
        let _ = (led_pin, buzzer_pin);
        Self {
            started: Instant::now(),
            recording: None,
            notice_wav,
            live,
            #[cfg(target_os = "linux")]
            led: output(led_pin, "led"),
            #[cfg(target_os = "linux")]
            buzzer: output(buzzer_pin, "buzzer"),
        }
    }

    fn set_led(&mut self, on: bool) {
        #[cfg(target_os = "linux")]
        if let Some(led) = self.led.as_mut() {
            if on {
                led.set_high()
            } else {
                led.set_low()
            }
        }
        let _ = on;
    }

    fn beep(&mut self, pattern_ms: &[u64]) {
        #[cfg(target_os = "linux")]
        if let Some(buzzer) = self.buzzer.as_mut() {
            for (i, ms) in pattern_ms.iter().enumerate() {
                if i % 2 == 0 {
                    buzzer.set_high()
                } else {
                    buzzer.set_low()
                }
                thread::sleep(Duration::from_millis(*ms));
            }
            buzzer.set_low();
        }
        let _ = pattern_ms;
    }

    fn has_buzzer(&self) -> bool {
        #[cfg(target_os = "linux")]
        return self.buzzer.is_some();
        #[cfg(not(target_os = "linux"))]
        false
    }
}

impl Hardware for PiHardware {
    fn now(&self) -> Duration {
        self.started.elapsed()
    }

    fn start_audio(&mut self, path: &Path) -> Result<()> {
        self.recording = Some(capture::start_audio(path, self.live.clone())?);
        Ok(())
    }

    fn stop_audio(&mut self) -> Result<()> {
        match self.recording.take() {
            Some(rec) => rec.stop(),
            None => Err("nothing was recording".into()),
        }
    }

    fn take_photo(&mut self, path: &Path) -> Result<f64> {
        capture::capture_photo(path)
    }

    fn signal_ready(&mut self) {
        self.set_led(true);
        self.beep(&[120, 80, 120]);
        let notice = self
            .notice_wav
            .as_ref()
            .map(|wav| Command::new("aplay").arg("-q").arg(wav).status());
        match notice {
            Some(Ok(s)) if s.success() => info("[notice] played the verbal-notice reminder"),
            Some(_) => warn("[notice] couldn't play the notice wav, say it out loud"),
            None => {}
        }
        if !self.has_buzzer() {
            info("[hw] no buzzer configured (NIGHTINGALE_BUZZER_PIN), ready tone skipped");
        }
        info(format!(
            "[notice] reminder for the responder: say \"{NOTICE}\""
        ));
    }

    fn signal_shutdown(&mut self) {
        self.beep(&[400]);
        self.set_led(false);
    }

    fn poweroff(&mut self) {
        info("[power] systemctl poweroff");
        if let Err(e) = Command::new("systemctl").arg("poweroff").status() {
            warn(format!("[power] systemctl poweroff failed: {e}"));
        }
    }
}

// ---- mock mode ----

pub struct MockHardware {
    started: Instant,
    source_wav: Option<PathBuf>,
    source_jpg: Option<PathBuf>,
    recording: Option<MockRecording>,
    live: Option<SyncSender<Vec<u8>>>,
    /// how far into the test wav "the mic" has got, carries across chunks like real time
    playhead: Arc<AtomicUsize>,
}

struct MockRecording {
    path: PathBuf,
    since: Instant,
    stop: Arc<AtomicBool>,
    /// exactly what was "heard" during this chunk, like arecord's file
    heard: Arc<Mutex<Vec<u8>>>,
    player: Option<thread::JoinHandle<()>>,
}

impl MockHardware {
    pub fn new(
        source_wav: Option<PathBuf>,
        source_jpg: Option<PathBuf>,
        live: Option<SyncSender<Vec<u8>>>,
    ) -> Self {
        Self {
            started: Instant::now(),
            source_wav,
            source_jpg,
            recording: None,
            live,
            playhead: Arc::new(AtomicUsize::new(0)),
        }
    }
}

// a silent 16khz mono 16-bit wav of the given length, stands in for the mic
pub fn silent_wav(seconds: f32) -> Vec<u8> {
    let data_len = (16000.0 * seconds.max(0.1)) as u32 * 2;
    let mut out = capture::wav_header(data_len).to_vec();
    out.resize(44 + data_len as usize, 0);
    out
}

impl Hardware for MockHardware {
    fn now(&self) -> Duration {
        self.started.elapsed()
    }

    fn start_audio(&mut self, path: &Path) -> Result<()> {
        std::fs::write(path, silent_wav(0.1))?; // exists while "recording", like arecord's file
        let stop = Arc::new(AtomicBool::new(false));
        let heard = Arc::new(Mutex::new(Vec::new()));
        // "plays" the test wav in real time from wherever the last chunk stopped: each
        // 100 ms goes into this chunk's file and to the live stream, like a real mic
        let player = match &self.source_wav {
            Some(src) => {
                let bytes = std::fs::read(src)?;
                let pcm = bytes.get(44..).unwrap_or_default().to_vec();
                let (stop, heard, playhead, live) = (
                    stop.clone(),
                    heard.clone(),
                    self.playhead.clone(),
                    self.live.clone(),
                );
                Some(thread::spawn(move || {
                    while !stop.load(Ordering::Relaxed) {
                        let at = playhead.load(Ordering::Relaxed);
                        // past the end of the test audio the "mic" just hears silence
                        let frame = pcm
                            .get(at..(at + 3200).min(pcm.len()))
                            .filter(|f| !f.is_empty());
                        let frame = frame.map(|f| f.to_vec()).unwrap_or_else(|| vec![0; 3200]);
                        playhead.store(at + 3200, Ordering::Relaxed);
                        heard.lock().unwrap().extend_from_slice(&frame);
                        if let Some(live) = &live {
                            live.try_send(frame).ok();
                        }
                        thread::sleep(Duration::from_millis(100));
                    }
                }))
            }
            None => None,
        };
        self.recording = Some(MockRecording {
            path: path.to_path_buf(),
            since: Instant::now(),
            stop,
            heard,
            player,
        });
        Ok(())
    }

    fn stop_audio(&mut self) -> Result<()> {
        let rec = self.recording.take().ok_or("nothing was recording")?;
        rec.stop.store(true, Ordering::Relaxed);
        match rec.player {
            Some(player) => {
                player.join().ok();
                let pcm = rec.heard.lock().unwrap();
                let mut wav = capture::wav_header(pcm.len() as u32).to_vec();
                wav.extend_from_slice(&pcm);
                std::fs::write(&rec.path, wav)?;
            }
            None => std::fs::write(&rec.path, silent_wav(rec.since.elapsed().as_secs_f32()))?,
        }
        Ok(())
    }

    fn take_photo(&mut self, path: &Path) -> Result<f64> {
        match &self.source_jpg {
            Some(src) => {
                std::fs::copy(src, path)?;
                Ok(capture::score_file(path).unwrap_or(0.0))
            }
            // smallest valid-ish jpeg markers, enough for the upload path
            None => {
                std::fs::write(path, [0xFF, 0xD8, 0xFF, 0xD9])?;
                Ok(0.0)
            }
        }
    }

    fn signal_ready(&mut self) {
        info(format!("[mock] *ready tone*, led on. say \"{NOTICE}\""));
    }

    fn signal_shutdown(&mut self) {
        info("[mock] *shutdown tone*, led off");
    }

    fn poweroff(&mut self) {
        info("[mock] would run systemctl poweroff now, exiting instead");
        thread::sleep(Duration::from_millis(1500)); // let the log line ship
        std::process::exit(0);
    }
}

/// mock mode's buttons: type a letter + enter. "r" = POWER/RECORD, "p" = PHOTO
pub fn parse_mock_key(line: &str) -> Option<Event> {
    match line.trim().to_lowercase().as_str() {
        "r" | "power" | "record" => Some(Event::PowerPress),
        "p" | "photo" => Some(Event::PhotoPress),
        _ => None,
    }
}

pub fn mock_buttons(tx: Sender<Event>) {
    thread::spawn(move || {
        let stdin = std::io::stdin();
        let mut line = String::new();
        while stdin.read_line(&mut line).map(|n| n > 0).unwrap_or(false) {
            match parse_mock_key(&line) {
                Some(ev) if tx.send(ev).is_err() => return,
                Some(_) => {}
                None => info("[mock] keys: r + enter = POWER/RECORD, p + enter = PHOTO"),
            }
            line.clear();
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mock_mode_simulates_both_buttons() {
        assert_eq!(parse_mock_key("r\n"), Some(Event::PowerPress));
        assert_eq!(parse_mock_key("P"), Some(Event::PhotoPress));
        assert_eq!(parse_mock_key("x"), None);
    }

    #[test]
    fn mock_hardware_writes_a_real_wav_on_stop() {
        let dir = std::env::temp_dir().join("nightingale_mock_hw_test");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.wav");
        let mut hw = MockHardware::new(None, None, None);
        hw.start_audio(&path).unwrap();
        hw.stop_audio().unwrap();
        let bytes = std::fs::read(&path).unwrap();
        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(&bytes[36..40], b"data");
        assert!(hw.stop_audio().is_err(), "can't stop twice");
        std::fs::remove_dir_all(dir).ok();
    }
}
