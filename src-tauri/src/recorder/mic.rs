//! The microphone ("me") through cpal: the chosen input device (Settings › General › Microphone), else the
//! system default, rebuilt when devices change. A chosen device that isn't connected falls back to the default.
//!
//! cpal streams are not `Send` on every platform, so the stream lives on its own thread and is
//! controlled through a channel.

use super::source::{AudioSource, SharedFeed};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{ErrorKind, SampleFormat, Stream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Arc;
use std::thread::JoinHandle;

enum Cmd {
    Open(Sender<Result<String, String>>),
    Stop,
}

#[derive(Default)]
pub struct MicSource {
    control: Option<(Sender<Cmd>, JoinHandle<()>)>,
    /// A device name from `input_devices`; None = the system default.
    preferred: Option<String>,
    /// Set by the stream's error callback when the device is gone for good (unplugged, or the stream can't go on).
    failed: Arc<AtomicBool>,
}

/// What went wrong opening or running the microphone, in the terms the person can act on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MicProblem {
    AccessDenied,
    Busy,
    UnsupportedFormat,
    Gone,
    Unknown,
}

/// The words for a problem, with where to fix it. `windows` picks the system's name for the privacy page.
pub fn problem_words(p: MicProblem, windows: bool) -> &'static str {
    match p {
        MicProblem::AccessDenied if windows => "Windows is blocking the microphone. Turn on microphone access in Settings › Privacy & security › Microphone.",
        MicProblem::AccessDenied => "Ensayo isn't allowed to use the microphone. Turn it on in System Settings › Privacy & Security › Microphone.",
        MicProblem::Busy => "Another app is using the microphone. Close it and try again.",
        MicProblem::UnsupportedFormat => "This microphone uses a format Ensayo can't record. Choose another microphone in Settings › Speech.",
        MicProblem::Gone => "The microphone isn't connected. Plug it in or choose another in Settings › Speech.",
        MicProblem::Unknown => "The microphone couldn't start. Try again, or choose another in Settings › Speech.",
    }
}

/// Sorts a cpal error by its kind, and when the kind says nothing (`Other`, `BackendError`), by its text.
pub fn classify(e: &cpal::Error) -> MicProblem {
    match e.kind() {
        ErrorKind::PermissionDenied => MicProblem::AccessDenied,
        ErrorKind::DeviceBusy => MicProblem::Busy,
        ErrorKind::UnsupportedConfig | ErrorKind::InvalidInput => MicProblem::UnsupportedFormat,
        ErrorKind::DeviceNotAvailable | ErrorKind::StreamInvalidated | ErrorKind::HostUnavailable => MicProblem::Gone,
        _ => classify_text(&e.to_string()),
    }
}

/// Sorts an error message by what it says. The words differ by system, so this is a list of the common phrasings.
pub fn classify_text(text: &str) -> MicProblem {
    let t = text.to_lowercase();
    let has = |words: &[&str]| words.iter().any(|w| t.contains(w));
    if has(&["access is denied", "access denied", "permission", "not permitted", "not authorized", "not authorised", "privacy"]) {
        MicProblem::AccessDenied
    } else if has(&["busy", "in use", "exclusive", "already being used"]) {
        MicProblem::Busy
    } else if has(&["unsupported", "not supported", "sample format", "stream configuration", "invalid format", "format"]) {
        MicProblem::UnsupportedFormat
    } else if has(&["disconnected", "not available", "no longer", "not found", "no such device", "unplugged"]) {
        MicProblem::Gone
    } else {
        MicProblem::Unknown
    }
}

/// The plain sentence for a raw open error. The raw text goes to the log (at warn level) and nowhere else; it holds no user data.
fn plain_open_error(stage: &str, e: &cpal::Error) -> String {
    log::warn!("mic open failed at {stage}: kind {:?}: {e}", e.kind());
    problem_words(classify(e), cfg!(windows)).to_string()
}

/// True when a stream error means the microphone is gone for good rather than a glitch.
/// How a stream error is logged: the Xrun a capture reports as it opens is noise (once per capture, at info, then
/// silent); anything else stays a warning.
#[derive(Debug, PartialEq)]
enum LogAs {
    Warn,
    Info,
    Skip,
}

fn log_level(kind: ErrorKind, xrun_logged: &AtomicBool) -> LogAs {
    if kind != ErrorKind::Xrun {
        LogAs::Warn
    } else if xrun_logged.swap(true, Ordering::Relaxed) {
        LogAs::Skip
    } else {
        LogAs::Info
    }
}

fn is_fatal(kind: ErrorKind) -> bool {
    !matches!(kind, ErrorKind::Xrun | ErrorKind::DeviceChanged | ErrorKind::RealtimeDenied | ErrorKind::DeviceBusy | ErrorKind::ResourceExhausted)
}

/// Names of the connected input devices, for Settings.
pub fn input_devices() -> Vec<String> {
    let mut names: Vec<String> = cpal::default_host().input_devices().map(|d| d.map(|d| d.to_string()).collect()).unwrap_or_default();
    names.sort();
    names.dedup();
    names
}

fn open(feed: &SharedFeed, preferred: Option<&str>, failed: &Arc<AtomicBool>) -> Result<(Stream, String), String> {
    let host = cpal::default_host();
    let chosen = preferred.and_then(|want| host.input_devices().ok()?.find(|d| d.to_string() == want));
    let device = chosen.or_else(|| host.default_input_device()).ok_or_else(|| "No microphone found. Plug one in or turn one on, then test it in Settings › Check setup.".to_string())?;
    let name = device.to_string();
    failed.store(false, Ordering::Release);
    let supported = device.default_input_config().map_err(|e| plain_open_error("config", &e))?;
    let format = supported.sample_format();
    let config = supported.config();
    let rate = config.sample_rate;
    let channels = config.channels;
    let failed_cb = failed.clone();
    let xrun_logged = Arc::new(AtomicBool::new(false));
    let err = move |e: cpal::Error| {
        match log_level(e.kind(), &xrun_logged) {
            LogAs::Warn => log::warn!("mic stream error: kind {:?}: {e}", e.kind()),
            LogAs::Info => log::info!("mic stream error: kind {:?}: {e} (once per capture)", e.kind()),
            LogAs::Skip => {}
        }
        if is_fatal(e.kind()) {
            failed_cb.store(true, Ordering::Release);
        }
    };

    macro_rules! build {
        ($t:ty, $conv:expr) => {{
            let feed = feed.clone();
            let err = err.clone();
            let mut scratch: Vec<f32> = Vec::with_capacity(8192);
            device.build_input_stream::<$t, _, _>(
                config.clone(),
                move |data: &[$t], info| {
                    let host_ns = info.timestamp().capture.as_nanos() as u64;
                    scratch.clear();
                    scratch.extend(data.iter().map($conv));
                    if let Ok(mut f) = feed.try_lock() {
                        f.push(host_ns, rate, channels, &scratch);
                    }
                },
                err,
                None,
            )
        }};
    }

    let stream = match format {
        SampleFormat::F32 => build!(f32, |s: &f32| *s),
        SampleFormat::I16 => build!(i16, |s: &i16| *s as f32 / i16::MAX as f32),
        SampleFormat::I32 => build!(i32, |s: &i32| *s as f32 / i32::MAX as f32),
        SampleFormat::U16 => build!(u16, |s: &u16| (*s as f32 - 32768.0) / 32768.0),
        other => {
            log::warn!("mic open failed: unsupported sample format {other:?}");
            return Err(problem_words(MicProblem::UnsupportedFormat, cfg!(windows)).to_string());
        }
    }
    .map_err(|e| plain_open_error("build", &e))?;
    stream.play().map_err(|e| plain_open_error("play", &e))?;
    Ok((stream, name))
}

fn run(feed: SharedFeed, rx: Receiver<Cmd>, preferred: Option<String>, failed: Arc<AtomicBool>) {
    let mut stream: Option<Stream> = None;
    while let Ok(cmd) = rx.recv() {
        match cmd {
            Cmd::Open(reply) => {
                stream = None; // drop the old stream before opening the new device
                let _ = reply.send(match open(&feed, preferred.as_deref(), &failed) {
                    Ok((s, name)) => {
                        stream = Some(s);
                        Ok(name)
                    }
                    Err(e) => Err(e),
                });
            }
            Cmd::Stop => break,
        }
    }
    drop(stream);
}

impl MicSource {
    /// The given device ("default" or empty means the system default).
    pub fn with_device(name: &str) -> Self {
        let name = name.trim();
        MicSource { control: None, preferred: (!name.is_empty() && name != "default").then(|| name.to_string()), failed: Arc::default() }
    }

    fn request_open(&self) -> Result<String, String> {
        let (tx, _) = self.control.as_ref().ok_or("Microphone not started")?;
        let (reply, answer) = channel();
        tx.send(Cmd::Open(reply)).map_err(|e| e.to_string())?;
        answer.recv().map_err(|e| e.to_string())?
    }
}

impl AudioSource for MicSource {
    fn start(&mut self, feed: SharedFeed) -> Result<String, String> {
        let (tx, rx) = channel();
        let preferred = self.preferred.clone();
        let failed = self.failed.clone();
        let handle = std::thread::Builder::new().name("ensayo-mic".into()).spawn(move || run(feed, rx, preferred, failed)).map_err(|e| e.to_string())?;
        self.control = Some((tx, handle));
        let result = self.request_open();
        if result.is_err() {
            self.stop();
        }
        result
    }

    fn failed(&self) -> bool {
        self.failed.load(Ordering::Acquire)
    }

    fn stop(&mut self) {
        if let Some((tx, handle)) = self.control.take() {
            let _ = tx.send(Cmd::Stop);
            let _ = handle.join();
        }
    }
}

impl Drop for MicSource {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use cpal::Error;

    fn words(kind: ErrorKind) -> &'static str {
        problem_words(classify(&Error::new(kind)), false)
    }

    #[test]
    fn kinds_map_to_plain_words_with_where_to_fix_it() {
        assert!(words(ErrorKind::PermissionDenied).contains("System Settings › Privacy & Security › Microphone"));
        assert!(words(ErrorKind::DeviceBusy).starts_with("Another app is using the microphone"));
        assert!(words(ErrorKind::UnsupportedConfig).contains("a format Ensayo can't record"));
        assert!(words(ErrorKind::DeviceNotAvailable).starts_with("The microphone isn't connected"));
        assert_eq!(problem_words(MicProblem::AccessDenied, true), "Windows is blocking the microphone. Turn on microphone access in Settings › Privacy & security › Microphone.");
    }

    #[test]
    fn an_unclassified_error_is_sorted_by_its_text() {
        let e = |m: &'static str| classify(&Error::with_message(ErrorKind::BackendError, m));
        assert_eq!(e("Access is denied. (0x80070005)"), MicProblem::AccessDenied);
        assert_eq!(e("The device is already in exclusive use"), MicProblem::Busy);
        assert_eq!(e("The requested stream configuration is not supported"), MicProblem::UnsupportedFormat);
        assert_eq!(e("device was unplugged"), MicProblem::Gone);
        assert_eq!(e("something odd"), MicProblem::Unknown);
        assert_eq!(classify_text("Permission denied"), MicProblem::AccessDenied);
    }

    #[test]
    fn every_sentence_is_plain_and_has_no_em_dash() {
        for p in [MicProblem::AccessDenied, MicProblem::Busy, MicProblem::UnsupportedFormat, MicProblem::Gone, MicProblem::Unknown] {
            for w in [false, true] {
                assert!(!problem_words(p, w).contains('\u{2014}'));
            }
        }
    }

    #[test]
    fn a_glitch_does_not_fail_the_recording_but_a_lost_device_does() {
        assert!(!is_fatal(ErrorKind::Xrun));
        assert!(!is_fatal(ErrorKind::DeviceChanged));
        assert!(is_fatal(ErrorKind::DeviceNotAvailable));
        assert!(is_fatal(ErrorKind::StreamInvalidated));
    }

    #[test]
    fn an_xrun_is_logged_once_per_capture_at_info_and_real_errors_stay_warnings() {
        let seen = AtomicBool::new(false);
        assert_eq!(log_level(ErrorKind::Xrun, &seen), LogAs::Info);
        assert_eq!(log_level(ErrorKind::Xrun, &seen), LogAs::Skip);
        assert_eq!(log_level(ErrorKind::DeviceNotAvailable, &seen), LogAs::Warn);
        assert_eq!(log_level(ErrorKind::DeviceBusy, &AtomicBool::new(true)), LogAs::Warn);
        // A new capture has its own flag.
        assert_eq!(log_level(ErrorKind::Xrun, &AtomicBool::new(false)), LogAs::Info);
    }
}
