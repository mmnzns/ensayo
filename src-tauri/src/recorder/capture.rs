//! One answer: mic -> feed -> 16 kHz mono pipeline -> WAV. The writer thread is Talaan's `spawn_writer` for one
//! track: no pauses, no meeting storage. The recording clock starts at the first buffer, so positions start at 0.

use super::clock::{Clock, RATE};
use super::feed::feed;
use super::pipeline::TrackPipeline;
use super::source::{AudioSource, SharedFeed};
use super::wav::WavSink;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

/// No answer is recorded for longer than this, whatever the screen does (it stops itself at 4 minutes).
pub const MAX_RECORDED_SECS: u64 = 6 * 60;

pub struct Capture {
    /// Shared with the writer, which stops the microphone itself when the limit is reached.
    mic: Arc<Mutex<Box<dyn AudioSource>>>,
    mic_name: String,
    path: PathBuf,
    stop: Arc<AtomicBool>,
    level: Arc<AtomicU32>,
    /// Pause is asked for here; the writer applies it to the recording clock at the next buffer it reads.
    paused: Arc<AtomicBool>,
    /// 16 kHz samples written so far: recorded time only, so paused time is never in it.
    recorded: Arc<AtomicU64>,
    writer: JoinHandle<io::Result<u64>>,
}

/// Why `start_within` gave nothing.
#[derive(Debug, Clone, PartialEq)]
pub enum StartError {
    /// The device opened with an error, in plain words.
    Failed(String),
    /// The device didn't answer in time.
    TimedOut,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Recorded {
    pub path: PathBuf,
    pub duration_ms: u64,
}

impl Capture {
    pub fn start(mic: Box<dyn AudioSource>, path: &Path) -> Result<Capture, String> {
        Capture::start_capped(mic, path, MAX_RECORDED_SECS * RATE as u64)
    }

    /// `start`, with the recorded-time limit given in 16 kHz samples (tests use a short one).
    pub fn start_capped(mic: Box<dyn AudioSource>, path: &Path, max_samples: u64) -> Result<Capture, String> {
        let mic = Arc::new(Mutex::new(mic));
        let (producer, mut consumer) = feed();
        let shared: SharedFeed = Arc::new(Mutex::new(producer));
        let stop = Arc::new(AtomicBool::new(false));
        let level = Arc::new(AtomicU32::new(0));
        let mut pipeline = TrackPipeline::new(WavSink::create(path).map_err(|e| format!("Couldn't create the recording: {e}"))?);

        let paused = Arc::new(AtomicBool::new(false));
        let recorded = Arc::new(AtomicU64::new(0));
        let (stop_w, level_w, paused_w, recorded_w, mic_w) = (stop.clone(), level.clone(), paused.clone(), recorded.clone(), mic.clone());
        let writer = std::thread::Builder::new()
            .name("ensayo-writer".into())
            .spawn(move || {
                let mut buf = Vec::new();
                let mut clock: Option<Clock> = None;
                let mut last_level = Instant::now();
                'run: loop {
                    let mut got = false;
                    while let Some(h) = consumer.pop(&mut buf) {
                        got = true;
                        let clock = clock.get_or_insert_with(|| Clock::new(h.host_ns));
                        // Pause and resume take effect at this buffer's own capture time, so the clock (and the
                        // file) never count the time in between.
                        match (paused_w.load(Ordering::Acquire), clock.is_paused()) {
                            (true, false) => drop(clock.pause(h.host_ns)),
                            (false, true) => drop(clock.resume(h.host_ns)),
                            _ => {}
                        }
                        pipeline.push(clock.position_samples(h.host_ns), h.rate, h.channels as usize, &buf)?;
                        // The watchdog: Rust ends any recording at the limit, so it never depends on the screen. The
                        // file is finished here, the microphone is let go, and a later stop returns the file.
                        if pipeline.written() >= max_samples {
                            recorded_w.store(pipeline.written(), Ordering::Relaxed);
                            break 'run;
                        }
                    }
                    recorded_w.store(pipeline.written(), Ordering::Relaxed);
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
                log::warn!("recording reached the {} second limit and was stopped", max_samples / RATE as u64);
                mic_w.lock().unwrap_or_else(|e| e.into_inner()).stop();
                let end = pipeline.written();
                pipeline.finish(end)?;
                let written = pipeline.written();
                pipeline.into_sink().finalize()?;
                Ok(written)
            })
            .map_err(|e| e.to_string())?;

        let started = mic.lock().unwrap_or_else(|e| e.into_inner()).start(shared);
        let mic_name = match started {
            Ok(name) => name,
            Err(e) => {
                stop.store(true, Ordering::Release);
                let _ = writer.join();
                let _ = std::fs::remove_file(path);
                return Err(e);
            }
        };
        Ok(Capture { mic, mic_name, path: path.to_path_buf(), stop, level, paused, recorded, writer })
    }

    /// Like `start`, but gives up after `limit` when the device never answers (a mic that hangs while opening). The open
    /// runs on its own thread; if it finishes after the limit, the late capture is stopped and its file removed.
    pub fn start_within(mic: Box<dyn AudioSource>, path: &Path, limit: Duration) -> Result<Capture, StartError> {
        let (tx, rx) = std::sync::mpsc::channel();
        let path = path.to_path_buf();
        let worker_path = path.clone();
        std::thread::Builder::new()
            .name("ensayo-mic-open".into())
            .spawn(move || {
                if let Err(std::sync::mpsc::SendError(Ok(late))) = tx.send(Capture::start(mic, &worker_path)) {
                    late.discard();
                }
            })
            .map_err(|e| StartError::Failed(e.to_string()))?;
        match rx.recv_timeout(limit) {
            Ok(Ok(cap)) => Ok(cap),
            Ok(Err(e)) => Err(StartError::Failed(e)),
            Err(_) => {
                drop(rx);
                // A late open removes its own file; if it already created one and never finishes, this is the cleanup.
                let _ = std::fs::remove_file(&path);
                Err(StartError::TimedOut)
            }
        }
    }

    /// Stops and throws the recording away.
    pub fn discard(self) {
        let path = self.path.clone();
        let _ = self.stop();
        let _ = std::fs::remove_file(path);
    }

    pub fn mic_name(&self) -> &str {
        &self.mic_name
    }

    /// Loudness 0..1 for the level meter.
    pub fn level(&self) -> f32 {
        f32::from_bits(self.level.load(Ordering::Relaxed))
    }

    /// Recorded time in ms: what is in the file so far. It stands still while paused.
    pub fn elapsed_ms(&self) -> u64 {
        self.recorded.load(Ordering::Relaxed) * 1000 / RATE as u64
    }

    /// Stops writing audio. The microphone stays open and its buffers are dropped, so Resume is instant and needs no
    /// new permission or device handshake (the cost is that the system's microphone indicator stays on while paused).
    pub fn pause(&self) {
        self.paused.store(true, Ordering::Release);
    }

    pub fn resume(&self) {
        self.paused.store(false, Ordering::Release);
    }

    pub fn is_paused(&self) -> bool {
        self.paused.load(Ordering::Acquire)
    }

    /// True once the microphone stopped delivering for good on its own (unplugged, or its stream gave up). What was
    /// recorded so far is still in the file and `stop` returns it.
    pub fn failed(&self) -> bool {
        self.mic.lock().unwrap_or_else(|e| e.into_inner()).failed()
    }

    /// Stops the mic, flushes the file and returns where it is. No audio at all is an error, never an empty file.
    pub fn stop(self) -> Result<Recorded, String> {
        self.mic.lock().unwrap_or_else(|e| e.into_inner()).stop();
        self.stop.store(true, Ordering::Release);
        let samples = self.writer.join().map_err(|_| "The recorder stopped unexpectedly".to_string())?.map_err(|e| e.to_string())?;
        if samples == 0 {
            let _ = std::fs::remove_file(&self.path);
            return Err(format!("No audio came from {}. Check that Ensayo may use the microphone in your system's privacy settings, then test it in Settings › Check setup.", if self.mic_name.is_empty() { "the microphone" } else { self.mic_name.as_str() }));
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

    /// A mic the test feeds by hand: buffers are pushed with host times the test chooses.
    struct HandMic(Arc<Mutex<Option<SharedFeed>>>);
    impl AudioSource for HandMic {
        fn start(&mut self, feed: SharedFeed) -> Result<String, String> {
            *self.0.lock().unwrap() = Some(feed);
            Ok("Hand mic".into())
        }
        fn stop(&mut self) {}
    }

    /// Pushes `secs` seconds of tone starting at host time `from_s`, as 10 ms mono buffers at 16 kHz.
    fn push_tone(feed: &SharedFeed, from_s: u64, secs: u64) {
        for n in 0..secs * 100 {
            let buf: Vec<f32> = (0..160).map(|i| ((n * 160 + i) as f32 * 0.1).sin() * 0.5).collect();
            feed.lock().unwrap().push(from_s * 1_000_000_000 + n * 10_000_000, 16_000, 1, &buf);
        }
    }

    fn wait_for(cap: &Capture, ms: u64) {
        for _ in 0..400 {
            if cap.elapsed_ms() >= ms {
                return;
            }
            std::thread::sleep(Duration::from_millis(5));
        }
        panic!("recorded time stayed at {} ms", cap.elapsed_ms());
    }

    #[test]
    fn paused_time_is_not_recorded_and_does_not_count_toward_the_clock() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("paused.wav");
        let slot = Arc::new(Mutex::new(None));
        let cap = Capture::start(Box::new(HandMic(slot.clone())), &path).unwrap();
        let feed = slot.lock().unwrap().clone().unwrap();
        push_tone(&feed, 0, 1);
        wait_for(&cap, 900);
        cap.pause();
        assert!(cap.is_paused());
        push_tone(&feed, 1, 5); // five seconds arrive while paused: they are dropped
        std::thread::sleep(Duration::from_millis(300));
        assert!(cap.elapsed_ms() < 1100, "the clock stood still: {} ms", cap.elapsed_ms());
        cap.resume();
        push_tone(&feed, 6, 1);
        wait_for(&cap, 1900);
        let rec = cap.stop().unwrap();
        assert!((1900..=2100).contains(&rec.duration_ms), "two seconds were recorded, got {} ms", rec.duration_ms);
    }

    #[test]
    fn rust_ends_a_recording_at_the_limit_by_itself_and_keeps_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("capped.wav");
        let slot = Arc::new(Mutex::new(None));
        let stopped = Arc::new(AtomicBool::new(false));
        struct Watched(HandMic, Arc<AtomicBool>);
        impl AudioSource for Watched {
            fn start(&mut self, feed: SharedFeed) -> Result<String, String> {
                self.0.start(feed)
            }
            fn stop(&mut self) {
                self.1.store(true, Ordering::Release);
            }
        }
        // A one second limit instead of six minutes; three seconds of audio arrive.
        let cap = Capture::start_capped(Box::new(Watched(HandMic(slot.clone()), stopped.clone())), &path, RATE as u64).unwrap();
        let feed = slot.lock().unwrap().clone().unwrap();
        push_tone(&feed, 0, 3);
        for _ in 0..400 {
            if stopped.load(Ordering::Acquire) {
                break;
            }
            std::thread::sleep(Duration::from_millis(5));
        }
        assert!(stopped.load(Ordering::Acquire), "the microphone was let go without anyone calling stop");
        let rec = cap.stop().unwrap();
        assert!((1000..=1100).contains(&rec.duration_ms), "kept the first second, got {} ms", rec.duration_ms);
        assert!(rec.path.is_file());
    }

    #[test]
    fn a_microphone_that_errors_marks_the_capture_failed_and_the_audio_so_far_is_kept() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("lost.wav");
        let slot = Arc::new(Mutex::new(None));
        let lost = Arc::new(AtomicBool::new(false));
        struct Flaky(HandMic, Arc<AtomicBool>);
        impl AudioSource for Flaky {
            fn start(&mut self, feed: SharedFeed) -> Result<String, String> {
                self.0.start(feed)
            }
            fn stop(&mut self) {}
            fn failed(&self) -> bool {
                self.1.load(Ordering::Acquire)
            }
        }
        let cap = Capture::start(Box::new(Flaky(HandMic(slot.clone()), lost.clone())), &path).unwrap();
        assert!(!cap.failed());
        let feed = slot.lock().unwrap().clone().unwrap();
        push_tone(&feed, 0, 2);
        wait_for(&cap, 1900);
        lost.store(true, Ordering::Release); // the device was unplugged
        assert!(cap.failed());
        let rec = cap.stop().unwrap();
        assert!((1900..=2100).contains(&rec.duration_ms), "kept what was said, got {} ms", rec.duration_ms);
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
            fn stop(&mut self) {}
        }
        let cap = Capture::start(Box::new(Silent), &path).unwrap();
        assert!(cap.stop().is_err());
        assert!(!path.exists(), "no empty file left behind");
    }

    #[test]
    fn a_mic_that_never_answers_times_out_and_the_late_capture_is_cleaned_up() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("hang.wav");
        let (release, wait) = std::sync::mpsc::channel::<()>();
        struct Hangs(std::sync::mpsc::Receiver<()>);
        impl AudioSource for Hangs {
            fn start(&mut self, _: SharedFeed) -> Result<String, String> {
                let _ = self.0.recv(); // never answers until released
                Ok("Late mic".into())
            }
            fn stop(&mut self) {}
        }
        let began = Instant::now();
        let err = Capture::start_within(Box::new(Hangs(wait)), &path, Duration::from_millis(150)).err().unwrap();
        assert_eq!(err, StartError::TimedOut);
        assert!(began.elapsed() < Duration::from_secs(2));
        // Let it finish late: nobody is waiting, so the capture is stopped and the file goes.
        drop(release);
        std::thread::sleep(Duration::from_millis(300));
        assert!(!path.exists(), "a late capture leaves no file");
    }

    #[test]
    fn a_mic_that_answers_in_time_is_returned() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ok.wav");
        struct Quick;
        impl AudioSource for Quick {
            fn start(&mut self, _: SharedFeed) -> Result<String, String> {
                Ok("Quick".into())
            }
            fn stop(&mut self) {}
        }
        let cap = Capture::start_within(Box::new(Quick), &path, Duration::from_secs(5)).unwrap();
        assert_eq!(cap.mic_name(), "Quick");
        cap.discard();
        let err = Capture::start_within(Box::new(Broken2), &path, Duration::from_secs(5)).err().unwrap();
        assert_eq!(err, StartError::Failed("No microphone".into()));
    }

    struct Broken2;
    impl AudioSource for Broken2 {
        fn start(&mut self, _: SharedFeed) -> Result<String, String> {
            Err("No microphone".into())
        }
        fn stop(&mut self) {}
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
            fn stop(&mut self) {}
        }
        let err = Capture::start(Box::new(Broken), &path).err().unwrap();
        assert_eq!(err, "No microphone found");
        assert!(!path.exists());
    }
}
