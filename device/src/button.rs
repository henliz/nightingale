// the two buttons (ARCHITECTURE.md section 5, button spec of 17 oct 2026):
//
//   POWER/RECORD  gpio 3  (physical pin 5, ground pin 6). also wakes the pi from halt,
//                 that part is hardware, no code. do NOT enable dtoverlay=gpio-shutdown,
//                 and keep i2c off (gpio 3 is also i2c sda)
//   PHOTO         gpio 17 (physical pin 11, ground pin 9)
//
// internal pull-ups, active-low (pressed = pin pulled to ground), 30 ms debounce.
// one press, one event. no short/long press logic. a button that's already held down
// when the daemon starts (the wake-up press) has to be released before it counts, so a
// press during boot never fires anything

use crate::machine::Event;
use std::sync::mpsc::Sender;

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

pub const DEBOUNCE_MS: u64 = 30;

/// turns raw pin reads into press events. pure, so it's testable without hardware
pub struct Debouncer {
    stable_low: bool,
    candidate_low: bool,
    candidate_since_ms: u64,
    armed: bool,
}

impl Debouncer {
    pub fn new(initially_low: bool, now_ms: u64) -> Self {
        Self {
            stable_low: initially_low,
            candidate_low: initially_low,
            candidate_since_ms: now_ms,
            // held at startup = must be released first
            armed: !initially_low,
        }
    }

    /// feed one read, true exactly once per real press
    pub fn update(&mut self, low: bool, now_ms: u64) -> bool {
        if low != self.candidate_low {
            self.candidate_low = low;
            self.candidate_since_ms = now_ms;
        }
        if self.candidate_low != self.stable_low
            && now_ms.saturating_sub(self.candidate_since_ms) >= DEBOUNCE_MS
        {
            self.stable_low = self.candidate_low;
            if !self.stable_low {
                self.armed = true; // released
            } else if self.armed {
                return true;
            }
        }
        false
    }
}

#[cfg(target_os = "linux")]
pub fn watch(pin: u8, event: Event, tx: Sender<Event>) -> Result<()> {
    use std::thread;
    use std::time::{Duration, Instant};

    let input = rppal::gpio::Gpio::new()?.get(pin)?.into_input_pullup();
    thread::spawn(move || {
        let start = Instant::now();
        let ms = || start.elapsed().as_millis() as u64;
        let mut debouncer = Debouncer::new(input.is_low(), ms());
        loop {
            if debouncer.update(input.is_low(), ms()) && tx.send(event).is_err() {
                return; // main loop's gone
            }
            thread::sleep(Duration::from_millis(5));
        }
    });
    Ok(())
}

#[cfg(not(target_os = "linux"))]
pub fn watch(_pin: u8, _event: Event, _tx: Sender<Event>) -> Result<()> {
    Err("no gpio on this platform, use mock mode (NIGHTINGALE_MOCK=1)".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_clean_press_fires_once_after_30ms() {
        let mut d = Debouncer::new(false, 0);
        assert!(!d.update(true, 0));
        assert!(!d.update(true, 29));
        assert!(d.update(true, 30));
        assert!(!d.update(true, 500)); // still held, no repeat
        assert!(!d.update(false, 510));
        assert!(!d.update(false, 545)); // released
        assert!(!d.update(true, 600));
        assert!(d.update(true, 630)); // second press
    }

    #[test]
    fn contact_bounce_shorter_than_30ms_is_ignored() {
        let mut d = Debouncer::new(false, 0);
        for t in (0..100).step_by(10) {
            assert!(!d.update(t % 20 == 0, t)); // flapping every 10ms
        }
    }

    #[test]
    fn a_button_held_through_boot_only_counts_after_release() {
        let mut d = Debouncer::new(true, 0); // wake-up press still held
        assert!(!d.update(true, 1000));
        assert!(!d.update(false, 1010));
        assert!(!d.update(false, 1040));
        assert!(!d.update(true, 1100));
        assert!(d.update(true, 1130));
    }
}
