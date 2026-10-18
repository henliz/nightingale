// shells out to the same tools already proven from the shell on the real pi
// (ARCHITECTURE.md section 5 / 7a status): rpicam-vid / rpicam-still for photos,
// arecord for audio.

use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::SyncSender;
use std::thread;
use std::time::{Duration, Instant};

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

// ---- audio ----

// same mic settings as before (16khz mono 16-bit, NIGHTINGALE_AUDIO_DEVICE if set,
// arecord's default input otherwise, e.g. "plughw:1,0" from `arecord -l`). arecord
// writes raw pcm to a pipe instead of a file, and a thread here does two things with
// every 100 ms of it: appends it to the chunk's wav file, and hands a copy to the live
// stream (livestream.rs) so the laptop can transcribe it while it's being said. the
// live copy is best-effort, if the stream's backed up that frame is just skipped there,
// the wav always gets everything
pub struct AudioRecording {
    child: Child,
    writer: Option<thread::JoinHandle<std::io::Result<()>>>,
}

pub fn wav_header(data_len: u32) -> [u8; 44] {
    let mut h = [0u8; 44];
    h[0..4].copy_from_slice(b"RIFF");
    h[4..8].copy_from_slice(&(36 + data_len).to_le_bytes());
    h[8..16].copy_from_slice(b"WAVEfmt ");
    h[16..20].copy_from_slice(&16u32.to_le_bytes());
    h[20..22].copy_from_slice(&1u16.to_le_bytes()); // pcm
    h[22..24].copy_from_slice(&1u16.to_le_bytes()); // mono
    h[24..28].copy_from_slice(&16000u32.to_le_bytes());
    h[28..32].copy_from_slice(&32000u32.to_le_bytes()); // byte rate
    h[32..34].copy_from_slice(&2u16.to_le_bytes()); // block align
    h[34..36].copy_from_slice(&16u16.to_le_bytes()); // bits per sample
    h[36..40].copy_from_slice(b"data");
    h[40..44].copy_from_slice(&data_len.to_le_bytes());
    h
}

pub fn start_audio(out_path: &Path, live: Option<SyncSender<Vec<u8>>>) -> Result<AudioRecording> {
    let mut cmd = Command::new("arecord");
    if let Ok(device) = std::env::var("NIGHTINGALE_AUDIO_DEVICE") {
        cmd.arg("-D").arg(device);
    }
    let mut child = cmd
        .arg("-q")
        .arg("-t")
        .arg("raw")
        .arg("-f")
        .arg("S16_LE")
        .arg("-r")
        .arg("16000")
        .arg("-c")
        .arg("1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|e| format!("couldn't run arecord: {e}"))?;
    let stdout = child.stdout.take().ok_or("no arecord stdout")?;
    let file = fs::File::create(out_path)?;
    let writer = thread::spawn(move || pump(stdout, file, live));
    Ok(AudioRecording {
        child,
        writer: Some(writer),
    })
}

// pcm in -> wav file (+ live copy). patches the wav header sizes once arecord stops
pub fn pump(
    mut input: impl Read,
    mut file: fs::File,
    live: Option<SyncSender<Vec<u8>>>,
) -> std::io::Result<()> {
    file.write_all(&wav_header(0))?;
    let mut total: u32 = 0;
    let mut buf = vec![0u8; 3200]; // 100 ms
    loop {
        let n = input.read(&mut buf)?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n])?;
        total = total.saturating_add(n as u32);
        if let Some(tx) = &live {
            tx.try_send(buf[..n].to_vec()).ok();
        }
    }
    file.seek(SeekFrom::Start(0))?;
    file.write_all(&wav_header(total))?;
    file.flush()
}

impl AudioRecording {
    // SIGINT makes arecord stop cleanly and close the pipe, then the writer thread
    // finishes the wav. only falls back to a hard kill if arecord ignores it for 3s
    pub fn stop(mut self) -> Result<()> {
        let mut problem = None;
        if self.child.try_wait()?.is_none() {
            Command::new("kill")
                .arg("-INT")
                .arg(self.child.id().to_string())
                .status()?;
            let deadline = Instant::now() + Duration::from_secs(3);
            while Instant::now() < deadline && self.child.try_wait()?.is_none() {
                thread::sleep(Duration::from_millis(20));
            }
            if self.child.try_wait()?.is_none() {
                self.child.kill().ok();
                self.child.wait().ok();
                problem = Some("arecord ignored SIGINT, killed it");
            }
        } else {
            problem = Some("arecord had already exited (mic unplugged?)");
        }
        if let Some(writer) = self.writer.take() {
            writer
                .join()
                .map_err(|_| "wav writer thread panicked")?
                .map_err(|e| format!("writing the wav: {e}"))?;
        }
        match problem {
            Some(p) => Err(p.into()),
            None => Ok(()),
        }
    }
}

// ---- photos ----

// "live photo" burst, keep the sharpest (ARCHITECTURE.md section 5): one rpicam-vid run
// with continuous autofocus writes a short mjpeg burst, one file per frame, each frame
// gets a variance-of-laplacian score on a 1/8 scale greyscale decode, the sharpest is
// kept and every other frame is deleted immediately. falls back to a single
// rpicam-still shot if the burst produced nothing. returns the winning frame's score
pub fn capture_photo(out_path: &Path) -> Result<f64> {
    let burst_dir = out_path.with_extension("burst");
    fs::create_dir_all(&burst_dir)?;
    let result = burst_and_pick(&burst_dir, out_path);
    fs::remove_dir_all(&burst_dir).ok();
    match result {
        Ok(score) => Ok(score),
        Err(burst_err) => {
            single_still(out_path)
                .map_err(|e| format!("burst failed ({burst_err}), still failed too ({e})"))?;
            Ok(score_file(out_path).unwrap_or(0.0))
        }
    }
}

fn burst_and_pick(burst_dir: &Path, out_path: &Path) -> Result<f64> {
    let frames = std::env::var("NIGHTINGALE_BURST_FRAMES")
        .ok()
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(20); // ~0.7s at 30fps, enough for continuous af to settle
    let status = Command::new("rpicam-vid")
        .args(["-n", "--codec", "mjpeg", "--segment", "1", "-q", "93"])
        // 30 fps caps exposure at ~1/30s while still letting auto-exposure choose,
        // section 5: a forced fast shutter (1/120) came out far too dark indoors
        .args(["--width", "2328", "--height", "1748", "--framerate", "30"])
        .args(["--autofocus-mode", "continuous"])
        .args(["--frames", &frames.to_string(), "-t", "0"])
        .arg("-o")
        .arg(burst_dir.join("f%04d.jpg"))
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| format!("couldn't run rpicam-vid: {e}"))?;
    if !status.success() {
        return Err(format!("rpicam-vid exited with {status}").into());
    }

    let mut best: Option<(f64, PathBuf)> = None;
    for entry in fs::read_dir(burst_dir)? {
        let path = entry?.path();
        let Ok(score) = score_file(&path) else {
            continue;
        };
        if best.as_ref().is_none_or(|(s, _)| score > *s) {
            best = Some((score, path));
        }
    }
    let (score, path) = best.ok_or("burst produced no readable frames")?;
    fs::rename(&path, out_path)?;
    Ok(score)
}

fn single_still(out_path: &Path) -> Result<()> {
    let status = Command::new("rpicam-still")
        .arg("--autofocus-mode")
        .arg("auto")
        .arg("--autofocus-on-capture")
        .arg("-n")
        .arg("-t")
        .arg("1000")
        .arg("-o")
        .arg(out_path)
        .status()
        .map_err(|e| format!("couldn't run rpicam-still: {e}"))?;
    if !status.success() {
        return Err(format!("rpicam-still exited with {status}").into());
    }
    Ok(())
}

pub fn score_file(path: &Path) -> Result<f64> {
    let mut bytes = Vec::new();
    fs::File::open(path)?.read_to_end(&mut bytes)?;
    let mut decoder = jpeg_decoder::Decoder::new(&bytes[..]);
    decoder.read_info()?;
    let info = decoder.info().ok_or("no jpeg info")?;
    // dct scaling, decodes straight to ~1/8 size, cheap enough for a zero 2 w
    decoder.scale(info.width / 8, info.height / 8)?;
    let pixels = decoder.decode()?;
    let info = decoder.info().ok_or("no jpeg info")?;
    let (w, h) = (info.width as usize, info.height as usize);
    let grey: Vec<f64> = match info.pixel_format {
        jpeg_decoder::PixelFormat::L8 => pixels.iter().map(|&p| p as f64).collect(),
        jpeg_decoder::PixelFormat::RGB24 => pixels
            .as_chunks::<3>()
            .0
            .iter()
            .map(|p| 0.299 * p[0] as f64 + 0.587 * p[1] as f64 + 0.114 * p[2] as f64)
            .collect(),
        other => return Err(format!("unsupported jpeg pixel format {other:?}").into()),
    };
    Ok(laplacian_variance(&grey, w, h))
}

// sharpness score: variance of the 4-neighbour laplacian. blur flattens edges, so a
// blurrier frame has a smaller spread of laplacian values
pub fn laplacian_variance(grey: &[f64], w: usize, h: usize) -> f64 {
    if w < 3 || h < 3 || grey.len() < w * h {
        return 0.0;
    }
    let mut values = Vec::with_capacity((w - 2) * (h - 2));
    for y in 1..h - 1 {
        for x in 1..w - 1 {
            let i = y * w + x;
            values.push(grey[i - w] + grey[i + w] + grey[i - 1] + grey[i + 1] - 4.0 * grey[i]);
        }
    }
    let mean = values.iter().sum::<f64>() / values.len() as f64;
    values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / values.len() as f64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pump_writes_a_valid_wav_and_copies_frames_to_the_live_stream() {
        let path = std::env::temp_dir().join("nightingale_pump_test.wav");
        let pcm: Vec<u8> = (0..8000u32).map(|i| (i % 251) as u8).collect();
        let (tx, rx) = std::sync::mpsc::sync_channel(100);
        pump(&pcm[..], fs::File::create(&path).unwrap(), Some(tx)).unwrap();

        let wav = fs::read(&path).unwrap();
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(u32::from_le_bytes(wav[40..44].try_into().unwrap()), 8000);
        assert_eq!(&wav[44..], &pcm[..]);
        let live: Vec<u8> = rx.try_iter().flatten().collect();
        assert_eq!(live, pcm);
        fs::remove_file(path).ok();
    }

    #[test]
    fn a_full_live_stream_never_blocks_or_loses_the_wav() {
        let path = std::env::temp_dir().join("nightingale_pump_full_test.wav");
        let pcm = vec![7u8; 32000];
        let (tx, _rx) = std::sync::mpsc::sync_channel(1); // backed up after one frame
        pump(&pcm[..], fs::File::create(&path).unwrap(), Some(tx)).unwrap();
        assert_eq!(fs::read(&path).unwrap().len(), 44 + 32000);
        fs::remove_file(path).ok();
    }

    #[test]
    fn sharp_edges_score_higher_than_a_smooth_gradient() {
        let (w, h) = (16, 16);
        let checker: Vec<f64> = (0..w * h)
            .map(|i| if (i % w + i / w) % 2 == 0 { 255.0 } else { 0.0 })
            .collect();
        let gradient: Vec<f64> = (0..w * h).map(|i| (i % w) as f64 * 4.0).collect();
        assert!(laplacian_variance(&checker, w, h) > laplacian_variance(&gradient, w, h) * 100.0);
        assert_eq!(laplacian_variance(&[1.0; 4], 2, 2), 0.0);
    }
}
