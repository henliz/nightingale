// on-disk store-and-forward queue, ARCHITECTURE.md section 5: files survive power loss
// and flaky wifi, and only get deleted once the server acks a complete upload.
//
// layout:
//   <dir>/incoming/   capture writes here first (half-written files live here)
//   <dir>/            finished files, ready to upload
// a capture only becomes uploadable once it's renamed out of incoming/, so the uploader
// never grabs a half-written wav. file names are "<captureId>__<unix secs>.<ext>" so the
// capture id survives a reboot

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub struct Queue {
    dir: PathBuf,
}

pub struct QueuedFile {
    pub path: PathBuf,
    pub capture_id: String,
    /// when the capture started, unix ms, from the file name (older files used seconds)
    pub captured_at_ms: Option<u64>,
}

impl Queue {
    pub fn open(dir: impl Into<PathBuf>) -> io::Result<Self> {
        let dir = dir.into();
        fs::create_dir_all(dir.join("incoming"))?;
        Ok(Self { dir })
    }

    // anything still in incoming/ at startup was cut off by a crash or power loss.
    // keep it rather than lose the audio: arecord's wav is still readable, just short
    pub fn recover_incoming(&self) -> io::Result<usize> {
        let mut moved = 0;
        for entry in fs::read_dir(self.dir.join("incoming"))? {
            let path = entry?.path();
            if let Some(name) = path.file_name() {
                fs::rename(&path, self.dir.join(name))?;
                moved += 1;
            }
        }
        Ok(moved)
    }

    pub fn incoming_path(&self, capture_id: &str, stamp: u64, ext: &str) -> PathBuf {
        self.dir
            .join("incoming")
            .join(format!("{capture_id}__{stamp}.{ext}"))
    }

    // capture finished cleanly, hand it to the uploader
    pub fn commit(&self, incoming: &Path) -> io::Result<PathBuf> {
        let name = incoming
            .file_name()
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "no file name"))?;
        let ready = self.dir.join(name);
        fs::rename(incoming, &ready)?;
        Ok(ready)
    }

    // same as commit, but fsyncs the file and the queue dir first, so a power-off right
    // after this can't lose the recording (button spec: never power off unsaved)
    pub fn commit_durable(&self, incoming: &Path) -> io::Result<PathBuf> {
        fs::File::open(incoming)?.sync_all()?;
        let ready = self.commit(incoming)?;
        fs::File::open(&self.dir)?.sync_all()?;
        Ok(ready)
    }

    // oldest first, only files with this extension, so audio and photos can each
    // have their own uploader without stepping on each other
    pub fn pending(&self, ext: &str) -> io::Result<Vec<QueuedFile>> {
        let mut files: Vec<QueuedFile> = fs::read_dir(&self.dir)?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.is_file() && p.extension().is_some_and(|x| x == ext))
            .filter_map(|path| {
                let stem = path.file_stem()?.to_str()?.to_string();
                let (capture_id, stamp) = stem.split_once("__")?;
                let captured_at_ms =
                    stamp
                        .parse::<u64>()
                        .ok()
                        .map(|n| if n < 100_000_000_000 { n * 1000 } else { n });
                Some(QueuedFile {
                    capture_id: capture_id.to_string(),
                    captured_at_ms,
                    path,
                })
            })
            .collect();
        files.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(files)
    }

    pub fn stats(&self) -> (usize, u64) {
        let Ok(entries) = fs::read_dir(&self.dir) else {
            return (0, 0);
        };
        entries
            .filter_map(|e| e.ok())
            .filter_map(|e| e.metadata().ok())
            .filter(|m| m.is_file())
            .fold((0, 0), |(n, bytes), m| (n + 1, bytes + m.len()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_queue(name: &str) -> (Queue, PathBuf) {
        let dir = std::env::temp_dir().join(format!("nightingale_queue_test_{name}"));
        fs::remove_dir_all(&dir).ok();
        (Queue::open(&dir).unwrap(), dir)
    }

    #[test]
    fn half_written_files_are_not_pending_until_committed() {
        let (q, dir) = temp_queue("commit");
        let incoming = q.incoming_path("session_1", 100, "wav");
        fs::write(&incoming, b"partial").unwrap();
        assert!(q.pending("wav").unwrap().is_empty());

        q.commit(&incoming).unwrap();
        let pending = q.pending("wav").unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].capture_id, "session_1");
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn recovers_files_left_in_incoming_after_a_crash() {
        let (q, dir) = temp_queue("recover");
        fs::write(q.incoming_path("session_1", 100, "wav"), b"cut off").unwrap();
        assert_eq!(q.recover_incoming().unwrap(), 1);
        assert_eq!(q.pending("wav").unwrap().len(), 1);
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn pending_is_oldest_first_and_filtered_by_extension() {
        let (q, dir) = temp_queue("order");
        for (stamp, ext) in [(300, "wav"), (100, "wav"), (200, "jpg")] {
            let p = q.incoming_path("s", stamp, ext);
            fs::write(&p, b"x").unwrap();
            q.commit(&p).unwrap();
        }
        let wavs = q.pending("wav").unwrap();
        assert_eq!(wavs.len(), 2);
        assert!(wavs[0].path.ends_with("s__100.wav"));
        fs::remove_dir_all(dir).ok();
    }
}
