//! 16 kHz mono 16-bit WAV files that stay valid while recording, The header is rewritten as the audio is written, so a crash loses little.

use super::clock::RATE;
use super::timeline::SampleSink;
use std::fs::File;
use std::io::{self, BufWriter};
use std::path::Path;

/// The header is rewritten this often, so a crash loses at most this much audio.
const FLUSH_EVERY: usize = RATE as usize * 2;

pub struct WavSink {
    writer: Option<hound::WavWriter<BufWriter<File>>>,
    since_flush: usize,
}

fn spec() -> hound::WavSpec {
    hound::WavSpec { channels: 1, sample_rate: RATE, bits_per_sample: 16, sample_format: hound::SampleFormat::Int }
}

fn to_io(e: hound::Error) -> io::Error {
    match e {
        hound::Error::IoError(e) => e,
        other => io::Error::other(other.to_string()),
    }
}

impl WavSink {
    pub fn create(path: &Path) -> io::Result<Self> {
        Ok(WavSink { writer: Some(hound::WavWriter::create(path, spec()).map_err(to_io)?), since_flush: 0 })
    }

    pub fn flush(&mut self) -> io::Result<()> {
        self.since_flush = 0;
        match &mut self.writer {
            Some(w) => w.flush().map_err(to_io),
            None => Ok(()),
        }
    }

    pub fn finalize(mut self) -> io::Result<()> {
        match self.writer.take() {
            Some(w) => w.finalize().map_err(to_io),
            None => Ok(()),
        }
    }
}

impl SampleSink for WavSink {
    fn write(&mut self, samples: &[i16]) -> io::Result<()> {
        let w = self.writer.as_mut().ok_or_else(|| io::Error::other("closed"))?;
        let mut i16w = w.get_i16_writer(samples.len() as u32);
        for s in samples {
            i16w.write_sample(*s);
        }
        i16w.flush().map_err(to_io)?;
        self.since_flush += samples.len();
        if self.since_flush >= FLUSH_EVERY {
            self.flush()?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Duration of a 16 kHz mono 16-bit file from its header, in ms.
    fn wav_duration_ms(path: &Path) -> Option<u64> {
        let r = hound::WavReader::open(path).ok()?;
        let spec = r.spec();
        Some(r.duration() as u64 * 1000 / spec.sample_rate as u64)
    }

    #[test]
    fn writes_a_readable_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("me.wav");
        let mut s = WavSink::create(&path).unwrap();
        s.write(&vec![1000i16; 48_000]).unwrap();
        s.finalize().unwrap();
        assert_eq!(wav_duration_ms(&path), Some(3_000));
    }

    #[test]
    fn the_file_is_valid_mid_recording() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("me.wav");
        let mut s = WavSink::create(&path).unwrap();
        s.write(&vec![5i16; 40_000]).unwrap(); // passes the 2 s flush point
        let ms = wav_duration_ms(&path).unwrap();
        assert!(ms >= 2_000, "{ms}");
        drop(s);
    }
}
