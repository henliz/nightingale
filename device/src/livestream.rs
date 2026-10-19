// streams the mic to the laptop while recording, so it can be transcribed word by word
// (packages/api/src/live-transcribe.ts). one long chunked POST of raw 16 khz mono pcm16
// to /live/<session>/audio, reopened whenever it drops.
//
// best-effort on purpose: the wav chunks in the queue are the real record and still
// upload no matter what. if the laptop's unreachable, frames just get dropped here
// instead of piling up, and the server batch-transcribes the chunks it missed

use crate::devlog::{info, warn};
use std::io::Read;
use std::sync::mpsc::{sync_channel, Receiver, SyncSender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

// ~10 s of 100 ms frames, beyond that we're not "live" anymore anyway
const BACKLOG_FRAMES: usize = 100;

pub fn start(base_url: String, session_id: String) -> SyncSender<Vec<u8>> {
    let (tx, rx) = sync_channel::<Vec<u8>>(BACKLOG_FRAMES);
    let rx = Arc::new(Mutex::new(rx));
    thread::spawn(move || {
        let client = reqwest::blocking::Client::builder()
            .timeout(None) // the request lasts as long as the recording
            .build()
            .expect("reqwest client");
        let url = format!("{base_url}/live/{session_id}/audio");
        let mut last_warning: Option<Instant> = None;
        let mut warn_limited = |msg: String| {
            if last_warning.is_none_or(|t| t.elapsed() > Duration::from_secs(60)) {
                warn(msg);
                last_warning = Some(Instant::now());
            }
        };

        loop {
            // keep the last ~3 s that queued up while reconnecting (so a word said during a
            // blip isn't lost) but drop anything older, or we'd be streaming behind
            let mut carried: Vec<Vec<u8>> = Vec::new();
            if let Ok(r) = rx.lock() {
                while let Ok(frame) = r.try_recv() {
                    carried.push(frame);
                }
            }
            let keep_from = carried.len().saturating_sub(30);
            let reader = ChannelReader {
                rx: rx.clone(),
                pending: carried[keep_from..].concat(),
                pos: 0,
                ended: Arc::new(Mutex::new(false)),
            };
            let ended = reader.ended.clone();
            let result = client
                .post(&url)
                .header("content-type", "audio/L16; rate=16000; channels=1")
                .body(reqwest::blocking::Body::new(reader))
                .send();
            if *ended.lock().unwrap() {
                return; // recording's over, the daemon is shutting down
            }
            match result {
                Ok(res) if res.status().as_u16() == 503 => {
                    warn_limited("[live] the laptop has no live transcription set up (no GEMINI_API_KEY or OPENAI_API_KEY), only the saved chunks will be transcribed".into());
                    thread::sleep(Duration::from_secs(30));
                }
                Ok(res) if res.status().is_success() => {
                    info("[live] live audio stream closed by the laptop, reconnecting");
                }
                Ok(res) => {
                    warn_limited(format!("[live] laptop answered {}, retrying", res.status()));
                    thread::sleep(Duration::from_secs(3));
                }
                Err(e) => {
                    warn_limited(format!("[live] can't stream live audio ({e}), retrying. the saved chunks still upload"));
                    thread::sleep(Duration::from_secs(3));
                }
            }
        }
    });
    tx
}

// turns the frame channel into a Read for reqwest's streaming body. blocks until audio
// arrives, EOF once every sender's gone (recording stopped for good)
struct ChannelReader {
    rx: Arc<Mutex<Receiver<Vec<u8>>>>,
    pending: Vec<u8>,
    pos: usize,
    ended: Arc<Mutex<bool>>,
}

impl Read for ChannelReader {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if self.pos >= self.pending.len() {
            let next = self
                .rx
                .lock()
                .map_err(|_| std::io::Error::other("poisoned"))?
                .recv();
            match next {
                Ok(frame) => {
                    self.pending = frame;
                    self.pos = 0;
                }
                Err(_) => {
                    *self.ended.lock().unwrap() = true;
                    return Ok(0);
                }
            }
        }
        let n = buf.len().min(self.pending.len() - self.pos);
        buf[..n].copy_from_slice(&self.pending[self.pos..self.pos + n]);
        self.pos += n;
        Ok(n)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;

    #[test]
    fn streams_frames_to_the_server_as_one_chunked_request() {
        // tiny http server: reads one request, collects the decoded chunked body
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut line = String::new();
            let mut path = String::new();
            loop {
                line.clear();
                reader.read_line(&mut line).unwrap();
                if path.is_empty() {
                    path = line.clone();
                }
                if line == "\r\n" {
                    break;
                }
            }
            let mut body = Vec::new();
            loop {
                line.clear();
                reader.read_line(&mut line).unwrap();
                let size = usize::from_str_radix(line.trim(), 16).unwrap();
                let mut chunk = vec![0u8; size + 2];
                reader.read_exact(&mut chunk).unwrap();
                if size == 0 {
                    break;
                }
                body.extend_from_slice(&chunk[..size]);
            }
            let mut s = stream;
            s.write_all(b"HTTP/1.1 200 OK\r\ncontent-length: 2\r\n\r\nok")
                .unwrap();
            (path, body)
        });

        let tx = start(format!("http://{addr}"), "session_1".into());
        thread::sleep(Duration::from_millis(200));
        tx.send(vec![1, 2, 3]).unwrap();
        tx.send(vec![4, 5]).unwrap();
        drop(tx); // recording over

        let (path, body) = server.join().unwrap();
        assert!(path.starts_with("POST /live/session_1/audio"));
        assert_eq!(body, vec![1, 2, 3, 4, 5]);
    }
}
