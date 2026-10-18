// dev logging: every line prints locally (so journalctl still has it) and, when
// NIGHTINGALE_DEV=1, also gets shipped to the laptop api at POST /dev/logs so the
// localhost page shows "yep we're on", "photo taken" etc as it happens.
//
// rule from ARCHITECTURE.md section 5: logs never carry content. ids, sizes, timings,
// errors only, no transcript text, no audio, no image bytes.
//
// shipping never blocks capture. lines go into a bounded buffer, a background thread
// posts them about once a second, and if the laptop's unreachable the oldest lines
// get dropped once the buffer's full instead of piling up forever

use serde::Serialize;
use std::collections::VecDeque;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::OnceLock;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const MAX_BUFFERED: usize = 1000;

#[derive(Serialize, Clone)]
pub struct Line {
    pub ts: u64, // unix millis
    pub level: &'static str,
    pub msg: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Batch<'a> {
    device_id: &'a str,
    // every device run is its own drill session (its own folder on the laptop)
    session_id: &'a str,
    lines: Vec<Line>,
}

static SHIPPER: OnceLock<Sender<Line>> = OnceLock::new();

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// call once at startup. without this (or with shipping off) the log functions
// still print, they just don't leave the pi
pub fn init(base_url: String, device_id: String, session_id: String, ship: bool) {
    if !ship {
        return;
    }
    let (tx, rx) = channel();
    if SHIPPER.set(tx).is_ok() {
        thread::spawn(move || ship_loop(rx, base_url, device_id, session_id));
    }
}

fn ship_loop(rx: Receiver<Line>, base_url: String, device_id: String, session_id: String) {
    let http = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .expect("reqwest client");
    let url = format!("{base_url}/dev/logs");
    let mut buffer: VecDeque<Line> = VecDeque::new();

    loop {
        // wait up to a second for new lines, then drain whatever else is waiting
        if let Ok(line) = rx.recv_timeout(Duration::from_secs(1)) {
            push_bounded(&mut buffer, line);
        }
        while let Ok(line) = rx.try_recv() {
            push_bounded(&mut buffer, line);
        }
        if buffer.is_empty() {
            continue;
        }

        let batch = Batch {
            device_id: &device_id,
            session_id: &session_id,
            lines: buffer.iter().take(200).cloned().collect(),
        };
        let sent = batch.lines.len();
        let ok = http
            .post(&url)
            .json(&batch)
            .send()
            .map(|r| r.status().is_success())
            .unwrap_or(false);
        if ok {
            buffer.drain(..sent);
        }
        // on failure the lines stay buffered and go out with the next attempt
    }
}

fn push_bounded(buffer: &mut VecDeque<Line>, line: Line) {
    if buffer.len() >= MAX_BUFFERED {
        buffer.pop_front();
    }
    buffer.push_back(line);
}

fn emit(level: &'static str, msg: String) {
    let line = Line {
        ts: now_millis(),
        level,
        msg,
    };
    if level == "info" {
        println!("[{}] {}", line.level, line.msg);
    } else {
        eprintln!("[{}] {}", line.level, line.msg);
    }
    if let Some(tx) = SHIPPER.get() {
        tx.send(line).ok();
    }
}

pub fn info(msg: impl Into<String>) {
    emit("info", msg.into());
}

pub fn warn(msg: impl Into<String>) {
    emit("warn", msg.into());
}

pub fn error(msg: impl Into<String>) {
    emit("error", msg.into());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn buffer_drops_oldest_when_full() {
        let mut buffer = VecDeque::new();
        for i in 0..(MAX_BUFFERED + 5) {
            push_bounded(
                &mut buffer,
                Line {
                    ts: i as u64,
                    level: "info",
                    msg: String::new(),
                },
            );
        }
        assert_eq!(buffer.len(), MAX_BUFFERED);
        assert_eq!(buffer.front().unwrap().ts, 5);
    }
}
