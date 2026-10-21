//! The microphone ("me") through cpal: the chosen input device (Settings › General › Microphone), else the
//! system default, rebuilt when devices change. A chosen device that isn't connected falls back to the default.
//!
//! cpal streams are not `Send` on every platform, so the stream lives on its own thread and is
//! controlled through a channel.

use super::source::{AudioSource, SharedFeed};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream};
use std::sync::mpsc::{channel, Receiver, Sender};
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
}

/// Names of the connected input devices, for Settings.
pub fn input_devices() -> Vec<String> {
    let mut names: Vec<String> = cpal::default_host().input_devices().map(|d| d.map(|d| d.to_string()).collect()).unwrap_or_default();
    names.sort();
    names.dedup();
    names
}

fn open(feed: &SharedFeed, preferred: Option<&str>) -> Result<(Stream, String), String> {
    let host = cpal::default_host();
    let chosen = preferred.and_then(|want| host.input_devices().ok()?.find(|d| d.to_string() == want));
    let device = chosen.or_else(|| host.default_input_device()).ok_or_else(|| "No microphone found".to_string())?;
    let name = device.to_string();
    let supported = device.default_input_config().map_err(|e| e.to_string())?;
    let format = supported.sample_format();
    let config = supported.config();
    let rate = config.sample_rate;
    let channels = config.channels;
    let err = |e: cpal::Error| log::warn!("mic stream error: {e}");

    macro_rules! build {
        ($t:ty, $conv:expr) => {{
            let feed = feed.clone();
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
        other => return Err(format!("Unsupported microphone format {other:?}")),
    }
    .map_err(|e| e.to_string())?;
    stream.play().map_err(|e| e.to_string())?;
    Ok((stream, name))
}

fn run(feed: SharedFeed, rx: Receiver<Cmd>, preferred: Option<String>) {
    let mut stream: Option<Stream> = None;
    while let Ok(cmd) = rx.recv() {
        match cmd {
            Cmd::Open(reply) => {
                stream = None; // drop the old stream before opening the new device
                let _ = reply.send(match open(&feed, preferred.as_deref()) {
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
        MicSource { control: None, preferred: (!name.is_empty() && name != "default").then(|| name.to_string()) }
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
        let handle = std::thread::Builder::new().name("ensayo-mic".into()).spawn(move || run(feed, rx, preferred)).map_err(|e| e.to_string())?;
        self.control = Some((tx, handle));
        let result = self.request_open();
        if result.is_err() {
            self.stop();
        }
        result
    }

    fn restart(&mut self) -> Result<String, String> {
        self.request_open()
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
