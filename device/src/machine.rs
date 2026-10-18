// the capture state machine, button spec of 17 oct 2026 (final, see ARCHITECTURE.md
// section 5):
//
//   OFF --press--> BOOTING --daemon up--> RECORDING
//   RECORDING --press PHOTO--> RECORDING (one photo saved)
//   RECORDING --press POWER/RECORD or max_clip_seconds--> SAVING --> QUEUED --> POWERING OFF
//
// presses during BOOTING, SAVING and POWERING OFF are ignored. a photo press while not
// recording is ignored. nothing records without the button-initiated boot, no photo is
// taken without a press.
//
// under the hood the recording is cut into back-to-back chunks (chunk_seconds) so each
// piece can upload and transcribe while recording carries on, and a crash loses at most
// one chunk. that's invisible to the buttons: one press stops the whole recording.
//
// hardware sits behind the Hardware trait so the tests and mock mode drive the exact
// same logic the pi runs

use crate::devlog::{error, info, warn};
use crate::queue::Queue;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Event {
    PowerPress,
    PhotoPress,
    /// periodic, drives chunk rotation and the max_clip_seconds auto-stop
    Tick,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum State {
    Booting,
    Recording,
    Saving,
    PoweringOff,
}

pub trait Hardware {
    /// time since the daemon started, injectable so tests can fast-forward
    fn now(&self) -> Duration;
    fn start_audio(&mut self, path: &Path) -> Result<()>;
    /// stops the current recording and returns once the file is fully written
    fn stop_audio(&mut self) -> Result<()>;
    /// one photo into path, returns its sharpness score
    fn take_photo(&mut self, path: &Path) -> Result<f64>;
    /// ready tone, led on, verbal-notice reminder
    fn signal_ready(&mut self);
    /// led off etc, right before power off
    fn signal_shutdown(&mut self);
    fn poweroff(&mut self);
}

pub struct Config {
    pub max_clip: Duration,
    pub chunk: Duration,
    /// photos below this sharpness score get flagged low_quality in the log
    pub min_sharpness: f64,
}

pub struct Machine<H: Hardware> {
    pub hw: H,
    queue: Arc<Queue>,
    capture_id: String,
    cfg: Config,
    state: State,
    recording_started: Duration,
    chunk_started: Duration,
    chunk_path: Option<PathBuf>,
    last_stamp: u64,
    pub chunks_saved: u64,
    pub photos_saved: u64,
}

impl<H: Hardware> Machine<H> {
    pub fn new(hw: H, queue: Arc<Queue>, capture_id: String, cfg: Config) -> Self {
        Self {
            hw,
            queue,
            capture_id,
            cfg,
            state: State::Booting,
            recording_started: Duration::ZERO,
            chunk_started: Duration::ZERO,
            chunk_path: None,
            last_stamp: 0,
            chunks_saved: 0,
            photos_saved: 0,
        }
    }

    pub fn state(&self) -> State {
        self.state
    }

    /// daemon is up (record_on_boot): start recording right away, then tone + led + notice
    pub fn boot_complete(&mut self) {
        if self.state != State::Booting {
            return;
        }
        self.recording_started = self.hw.now();
        if let Err(e) = self.start_chunk() {
            error(format!(
                "[record] couldn't start recording: {e}, will keep retrying"
            ));
        }
        self.state = State::Recording;
        self.hw.signal_ready();
        info(format!(
            "[record] RECORDING (max {}s). press POWER/RECORD to stop and power off, PHOTO for a photo",
            self.cfg.max_clip.as_secs()
        ));
    }

    pub fn handle(&mut self, event: Event) {
        match (self.state, event) {
            (State::Recording, Event::PowerPress) => {
                self.stop_and_power_off("POWER/RECORD pressed")
            }
            (State::Recording, Event::PhotoPress) => self.photo(),
            (State::Recording, Event::Tick) => {
                let now = self.hw.now();
                if now.saturating_sub(self.recording_started) >= self.cfg.max_clip {
                    self.stop_and_power_off("max_clip_seconds reached");
                } else if self.chunk_path.is_none() {
                    // a start failed earlier (mic unplugged?), keep trying
                    if self.start_chunk().is_ok() {
                        info("[record] recording resumed");
                    }
                } else if now.saturating_sub(self.chunk_started) >= self.cfg.chunk {
                    self.rotate_chunk();
                }
            }
            (_, Event::Tick) => {}
            (state, press) => info(format!("[button] {press:?} ignored while {state:?}")),
        }
    }

    // unique, increasing file stamps even if two chunks start in the same millisecond
    fn next_stamp(&mut self) -> u64 {
        let ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        self.last_stamp = ms.max(self.last_stamp + 1);
        self.last_stamp
    }

    fn start_chunk(&mut self) -> Result<()> {
        let stamp = self.next_stamp();
        let path = self.queue.incoming_path(&self.capture_id, stamp, "wav");
        self.hw.start_audio(&path)?;
        self.chunk_path = Some(path);
        self.chunk_started = self.hw.now();
        Ok(())
    }

    // stop + fsync + queue. if anything fails the file is still in incoming/ on disk,
    // and Queue::recover_incoming picks it up on the next boot, so it's never lost
    fn finish_chunk(&mut self) {
        let Some(path) = self.chunk_path.take() else {
            return;
        };
        let secs = self.hw.now().saturating_sub(self.chunk_started).as_secs();
        if let Err(e) = self.hw.stop_audio() {
            warn(format!("[record] stopping the recorder: {e}"));
        }
        match self.queue.commit_durable(&path) {
            Ok(_) => {
                self.chunks_saved += 1;
                info(format!(
                    "[audio] chunk #{} saved ({secs}s), queued",
                    self.chunks_saved
                ));
            }
            Err(e) => error(format!(
                "[audio] couldn't queue chunk ({e}), it stays on disk and gets recovered next boot"
            )),
        }
    }

    fn rotate_chunk(&mut self) {
        self.finish_chunk();
        if let Err(e) = self.start_chunk() {
            error(format!(
                "[record] couldn't start the next chunk: {e}, retrying"
            ));
        }
    }

    fn photo(&mut self) {
        info("[photo] PHOTO pressed, taking a burst");
        let stamp = self.next_stamp();
        let path = self.queue.incoming_path(&self.capture_id, stamp, "jpg");
        let started = self.hw.now();
        match self.hw.take_photo(&path) {
            Ok(score) => match self.queue.commit_durable(&path) {
                Ok(_) => {
                    self.photos_saved += 1;
                    let quality = if score < self.cfg.min_sharpness {
                        ", LOW QUALITY (blurry)"
                    } else {
                        ""
                    };
                    info(format!(
                        "[photo] photo #{} saved (sharpness {score:.0}{quality}, {:.1}s), queued",
                        self.photos_saved,
                        self.hw.now().saturating_sub(started).as_secs_f32()
                    ));
                }
                Err(e) => error(format!("[photo] couldn't queue photo: {e}")),
            },
            Err(e) => {
                error(format!("[photo] capture failed: {e}"));
                std::fs::remove_file(&path).ok();
            }
        }
    }

    // SAVING -> QUEUED -> POWERING OFF. never waits for the network, the queue is on disk
    // and uploads resume at the next power-on
    fn stop_and_power_off(&mut self, reason: &str) {
        info(format!("[record] {reason}, SAVING"));
        self.state = State::Saving;
        self.finish_chunk();
        info(format!(
            "[record] QUEUED ({} chunk(s), {} photo(s) this session), POWERING OFF",
            self.chunks_saved, self.photos_saved
        ));
        self.state = State::PoweringOff;
        self.hw.signal_shutdown();
        self.hw.poweroff();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::fs;
    use std::rc::Rc;

    // records every hardware call and lets the test move the clock
    #[derive(Clone, Default)]
    struct FakeHw {
        clock: Rc<RefCell<Duration>>,
        calls: Rc<RefCell<Vec<String>>>,
        recording: Rc<RefCell<Option<PathBuf>>>,
    }

    impl FakeHw {
        fn advance(&self, secs: u64) {
            *self.clock.borrow_mut() += Duration::from_secs(secs);
        }
        fn calls(&self) -> Vec<String> {
            self.calls.borrow().clone()
        }
        fn count(&self, name: &str) -> usize {
            self.calls().iter().filter(|c| *c == name).count()
        }
    }

    impl Hardware for FakeHw {
        fn now(&self) -> Duration {
            *self.clock.borrow()
        }
        fn start_audio(&mut self, path: &Path) -> Result<()> {
            fs::write(path, b"RIFF....partial")?; // like arecord: file exists while recording
            *self.recording.borrow_mut() = Some(path.to_path_buf());
            self.calls.borrow_mut().push("start_audio".into());
            Ok(())
        }
        fn stop_audio(&mut self) -> Result<()> {
            let path = self.recording.borrow_mut().take().ok_or("not recording")?;
            fs::write(path, b"RIFF....complete wav")?;
            self.calls.borrow_mut().push("stop_audio".into());
            Ok(())
        }
        fn take_photo(&mut self, path: &Path) -> Result<f64> {
            fs::write(path, b"jpeg")?;
            self.calls.borrow_mut().push("take_photo".into());
            Ok(500.0)
        }
        fn signal_ready(&mut self) {
            self.calls.borrow_mut().push("signal_ready".into());
        }
        fn signal_shutdown(&mut self) {
            self.calls.borrow_mut().push("signal_shutdown".into());
        }
        fn poweroff(&mut self) {
            self.calls.borrow_mut().push("poweroff".into());
        }
    }

    fn setup(name: &str) -> (Machine<FakeHw>, FakeHw, Arc<Queue>, PathBuf) {
        let dir = std::env::temp_dir().join(format!("nightingale_machine_test_{name}"));
        fs::remove_dir_all(&dir).ok();
        let queue = Arc::new(Queue::open(&dir).unwrap());
        let hw = FakeHw::default();
        let cfg = Config {
            max_clip: Duration::from_secs(90),
            chunk: Duration::from_secs(30),
            min_sharpness: 100.0,
        };
        let machine = Machine::new(hw.clone(), queue.clone(), "session_1".into(), cfg);
        (machine, hw, queue, dir)
    }

    fn incoming_is_empty(dir: &Path) -> bool {
        fs::read_dir(dir.join("incoming")).unwrap().next().is_none()
    }

    #[test]
    fn presses_during_boot_are_ignored() {
        let (mut m, hw, _q, dir) = setup("boot");
        m.handle(Event::PowerPress);
        m.handle(Event::PhotoPress);
        assert_eq!(m.state(), State::Booting);
        assert!(
            hw.calls().is_empty(),
            "nothing should happen before boot: {:?}",
            hw.calls()
        );

        m.boot_complete();
        assert_eq!(m.state(), State::Recording);
        assert_eq!(hw.calls(), vec!["start_audio", "signal_ready"]);
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_power_press_while_recording_stops_saves_queues_and_powers_off() {
        let (mut m, hw, q, dir) = setup("stop");
        m.boot_complete();
        hw.advance(12);
        m.handle(Event::PowerPress);

        assert_eq!(m.state(), State::PoweringOff);
        assert_eq!(
            hw.calls(),
            vec![
                "start_audio",
                "signal_ready",
                "stop_audio",
                "signal_shutdown",
                "poweroff"
            ]
        );
        let queued = q.pending("wav").unwrap();
        assert_eq!(queued.len(), 1);
        assert_eq!(fs::read(&queued[0].path).unwrap(), b"RIFF....complete wav");
        assert!(incoming_is_empty(&dir));
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn max_clip_seconds_auto_stops_saves_queues_and_powers_off() {
        let (mut m, hw, q, dir) = setup("maxclip");
        m.boot_complete();
        for _ in 0..9 {
            hw.advance(10);
            m.handle(Event::Tick);
        }
        assert_eq!(m.state(), State::PoweringOff);
        assert_eq!(hw.count("poweroff"), 1);
        // 90s in 30s chunks: two rotations plus the final stop
        assert_eq!(q.pending("wav").unwrap().len(), 3);
        assert!(incoming_is_empty(&dir));
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_photo_press_while_not_recording_is_ignored() {
        let (mut m, hw, q, dir) = setup("photo_ignored");
        m.handle(Event::PhotoPress); // booting
        m.boot_complete();
        m.handle(Event::PowerPress); // now powering off
        m.handle(Event::PhotoPress);
        assert_eq!(hw.count("take_photo"), 0);
        assert!(q.pending("jpg").unwrap().is_empty());
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_photo_press_while_recording_saves_one_photo_and_keeps_recording() {
        let (mut m, hw, q, dir) = setup("photo");
        m.boot_complete();
        m.handle(Event::PhotoPress);
        assert_eq!(m.state(), State::Recording);
        assert_eq!(hw.count("take_photo"), 1);
        assert_eq!(hw.count("stop_audio"), 0);
        assert_eq!(q.pending("jpg").unwrap().len(), 1);
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn presses_while_saving_or_powering_off_are_ignored() {
        let (mut m, hw, _q, dir) = setup("double");
        m.boot_complete();
        m.handle(Event::PowerPress);
        m.handle(Event::PowerPress);
        m.handle(Event::PowerPress);
        assert_eq!(hw.count("poweroff"), 1);
        assert_eq!(hw.count("stop_audio"), 1);
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn no_recording_is_lost_on_shutdown() {
        let (mut m, hw, q, dir) = setup("nothing_lost");
        m.boot_complete();
        // 75s: two full chunks, then a press partway through the third
        for _ in 0..15 {
            hw.advance(5);
            m.handle(Event::Tick);
        }
        m.handle(Event::PowerPress);
        assert_eq!(hw.count("start_audio"), 3);
        assert_eq!(hw.count("stop_audio"), 3);
        let queued = q.pending("wav").unwrap();
        assert_eq!(queued.len(), 3, "every started chunk ends up queued");
        assert!(queued
            .iter()
            .all(|f| fs::read(&f.path).unwrap() == b"RIFF....complete wav"));
        assert!(incoming_is_empty(&dir));
        // and power off only comes after the last chunk is saved
        let calls = hw.calls();
        let last_stop = calls.iter().rposition(|c| c == "stop_audio").unwrap();
        let off = calls.iter().position(|c| c == "poweroff").unwrap();
        assert!(last_stop < off);
        fs::remove_dir_all(dir).ok();
    }
}
