//! One answer: mic -> feed -> 16 kHz mono pipeline -> WAV. The writer thread is Talaan's `spawn_writer` for one
//! track: no pauses, no meeting storage. The recording clock starts at the first buffer, so positions start at 0.

use super::clock::{Clock, RATE};
use super::feed::feed;
use super::pipeline::TrackPipeline;
use super::source::{AudioSource, SharedFeed};
use super::wav::WavSink;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

pub struct Capture {
    mic: Box<dyn AudioSource>,
    mic_name: String,
    path: PathBuf,
    stop: Arc<AtomicBool>,
    level: Arc<AtomicU32>,
    started: Instant,
    writer: JoinHandle<io::Result<u64>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Recorded {
    pub path: PathBuf,
    pub duration_ms: u64,
}

impl Capture {
    pub fn start(mut mic: Box<dyn AudioSource>, path: &Path) -> Result<Capture, String> {
        let (producer, mut consumer) = feed();
        let shared: SharedFeed = Arc::new(Mutex::new(producer));
        let stop = Arc::new(AtomicBool::new(false));
        let level = Arc::new(AtomicU32::new(0));
        let mut pipeline = TrackPipeline::new(WavSink::create(path).map_err(|e| format!("Couldn't create the recording: {e}"))?);

        let (stop_w, level_w) = (stop.clone(), level.clone());
        let writer = std::thread::Builder::new()
            .name("ensayo-writer".into())
            .spawn(move || {
                let mut buf = Vec::new();
                let mut clock: Option<Clock> = None;
                let mut last_level = Instant::now();
                loop {
                    let mut got = false;
                    while let Some(h) = consumer.pop(&mut buf) {
                        got = true;
                        let clock = clock.get_or_insert_with(|| Clock::new(h.host_ns));
                        pipeline.push(clock.position_samples(h.host_ns), h.rate, h.channels as usize, &buf)?;
                    }
                    if last_level.elapsed() >= Duration::from_millis(50) {
                        level_w.store(pipeline.level().to_bits(), Ordering::Relaxed);
                        last_level = Instant::now();
                    }
                    if stop_w.load(Ordering::Acquire) && consumer.is_empty() {
                        let end = pipeline.written();
                        pipeline.finish(end)?;
                        let written = pipeline.written();
                        pipeline.into_sink().finalize()?;
                        return Ok(written);
                    }
                    if !got {
                        std::thread::sleep(Duration::from_millis(5));
                    }
                }
            })
            .map_err(|e| e.to_string())?;

        let mic_name = match mic.start(shared) {
            Ok(name) => name,
            Err(e) => {
                stop.store(true, Ordering::Release);
                let _ = writer.join();
                let _ = std::fs::remove_file(path);
                return Err(e);
            }
        };
        Ok(Capture { mic, mic_name, path: path.to_path_buf(), stop, level, started: Instant::now(), writer })
    }

    pub fn mic_name(&self) -> &str {
        &self.mic_name
    }

    /// Loudness 0..1 for the level meter.
    pub fn level(&self) -> f32 {
        f32::from_bits(self.level.load(Ordering::Relaxed))
    }

    pub fn elapsed_ms(&self) -> u64 {
        self.started.elapsed().as_millis() as u64
    }

    /// Stops the mic, flushes the file and returns where it is. No audio at all is an error, never an empty file.
    pub fn stop(mut self) -> Result<Recorded, String> {
        self.mic.stop();
        self.stop.store(true, Ordering::Release);
        let samples = self.writer.join().map_err(|_| "The recorder stopped unexpectedly".to_string())?.map_err(|e| e.to_string())?;
        if samples == 0 {
            let _ = std::fs::remove_file(&self.path);
            return Err("No audio came from the microphone".into());
        }
        Ok(Recorded { path: self.path, duration_ms: samples * 1000 / RATE as u64 })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::recorder::source::SharedFeed;
    use std::sync::atomic::AtomicBool;

    /// A mic that "speaks" a 440 Hz tone for `secs` seconds as 10 ms stereo buffers at 48 kHz.
    struct ToneMic {
        secs: u32,
        done: Arc<AtomicBool>,
    }

    impl AudioSource for ToneMic {
        fn start(&mut self, feed: SharedFeed) -> Result<String, String> {
            let (secs, done) = (self.secs, self.done.clone());
            std::thread::spawn(move || {
                let frames = 480usize;
                let mut n: u64 = 0;
                for _ in 0..secs * 100 {
                    let mut buf = Vec::with_capacity(frames * 2);
                    for i in 0..frames {
                        let t = (n * frames as u64 + i as u64) as f32 / 48_000.0;
                        let s = (t * 440.0 * std::f32::consts::TAU).sin() * 0.5;
                        buf.push(s);
                        buf.push(s);
                    }
                    feed.lock().unwrap().push(10_000_000 * n, 48_000, 2, &buf);
                    n += 1;
                }
                done.store(true, Ordering::Release);
            });
            Ok("Test mic".into())
        }
        fn restart(&mut self) -> Result<String, String> {
            Ok("Test mic".into())
        }
        fn stop(&mut self) {}
    }

    fn read_samples(path: &Path) -> Vec<f32> {
        let mut r = hound::WavReader::open(path).unwrap();
        r.samples::<i16>().map(|s| s.unwrap() as f32 / 32768.0).collect()
    }

    #[test]
    fn one_second_of_tone_becomes_a_one_second_wav() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("answer.wav");
        let done = Arc::new(AtomicBool::new(false));
        let cap = Capture::start(Box::new(ToneMic { secs: 1, done: done.clone() }), &path).unwrap();
        assert_eq!(cap.mic_name(), "Test mic");
        while !done.load(Ordering::Acquire) {
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        let rec = cap.stop().unwrap();
        assert!((950..=1050).contains(&rec.duration_ms), "duration {} ms", rec.duration_ms);
        assert_eq!(rec.path, path);
        let samples = read_samples(&path);
        let rms = (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt();
        assert!(rms > 0.2, "the tone should be audible, rms {rms}");
    }

    #[test]
    fn stopping_with_no_audio_is_an_error_not_an_empty_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("none.wav");
        struct Silent;
        impl AudioSource for Silent {
            fn start(&mut self, _: SharedFeed) -> Result<String, String> {
                Ok("Silent".into())
            }
            fn restart(&mut self) -> Result<String, String> {
                Ok("Silent".into())
            }
            fn stop(&mut self) {}
        }
        let cap = Capture::start(Box::new(Silent), &path).unwrap();
        assert!(cap.stop().is_err());
        assert!(!path.exists(), "no empty file left behind");
    }

    #[test]
    fn a_mic_that_fails_to_open_leaves_nothing_behind() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("fail.wav");
        struct Broken;
        impl AudioSource for Broken {
            fn start(&mut self, _: SharedFeed) -> Result<String, String> {
                Err("No microphone found".into())
            }
            fn restart(&mut self) -> Result<String, String> {
                Err("no".into())
            }
            fn stop(&mut self) {}
        }
        let err = Capture::start(Box::new(Broken), &path).err().unwrap();
        assert_eq!(err, "No microphone found");
        assert!(!path.exists());
    }
}
