//! The speech model stays loaded between answers. Loading it again for every answer cost about a second each time
//! (more from a cold disk), and the voice detection model the same again. It is loaded while the answer is being
//! recorded (`warm`), so even the first answer of a session doesn't wait for it, and let go after a while unused so
//! about a gigabyte of memory isn't held all day by an app left open.

use super::engine::{self, Engine};
use super::models::{self, ModelInfo};
use super::transcribe::{self, Transcript};
use super::vad::{self, Vad};
use crate::paths;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, Once};
use std::time::{Duration, Instant};

/// Unused this long, the model is let go; the next answer loads it again (about a second).
const IDLE: Duration = Duration::from_secs(10 * 60);

/// Holds one loaded thing for a key, and remembers when it was last used.
pub struct Kept<T> {
    slot: Option<(String, T, Instant)>,
}

impl<T> Kept<T> {
    pub const fn new() -> Self {
        Kept { slot: None }
    }

    /// Runs `f` with what is loaded for `key`, loading it first when nothing is or something else is.
    pub fn with<R>(&mut self, key: &str, now: Instant, load: impl FnOnce() -> Result<T, String>, f: impl FnOnce(&mut T) -> R) -> Result<R, String> {
        if !matches!(&self.slot, Some((k, _, _)) if k == key) {
            // Let the old one go before loading the new one, so two models are never in memory at once.
            self.slot = None;
            self.slot = Some((key.to_string(), load()?, now));
        }
        let (_, value, used) = self.slot.as_mut().expect("just loaded");
        *used = now;
        Ok(f(value))
    }

    /// Lets go of it when it hasn't been used for `idle`.
    pub fn release_if_idle(&mut self, now: Instant, idle: Duration) {
        if matches!(&self.slot, Some((_, _, used)) if now.duration_since(*used) >= idle) {
            self.slot = None;
        }
    }

    pub fn clear(&mut self) {
        self.slot = None;
    }

    #[cfg(test)]
    pub fn key(&self) -> Option<&str> {
        self.slot.as_ref().map(|(k, _, _)| k.as_str())
    }
}

struct Speech {
    engine: Box<dyn Engine>,
    vad: Vad,
}

static LOADED: Mutex<Kept<Speech>> = Mutex::new(Kept::new());
static WATCH: Once = Once::new();

fn lock() -> std::sync::MutexGuard<'static, Kept<Speech>> {
    LOADED.lock().unwrap_or_else(|e| e.into_inner())
}

/// Where the model and the voice detection model are; the key includes the folder, so a model that moved (downloaded
/// after Talaan's copy was used, say) is loaded from its new place.
fn locate(model_id: &str) -> Result<(&'static ModelInfo, PathBuf, PathBuf), String> {
    let m = models::find(model_id).ok_or("Unknown model")?;
    let store = models::ModelStore::new(paths::models_dir(), true);
    let dir = store.locate(m).dir().ok_or("That speech model isn't downloaded yet")?.to_path_buf();
    let vad_dir = store.locate(&models::VAD).dir().ok_or("The voice detection model isn't downloaded yet")?.to_path_buf();
    Ok((m, dir, vad_dir.join(models::VAD.files[0].name)))
}

fn load(m: &ModelInfo, dir: &Path, vad: &Path) -> Result<Speech, String> {
    let _t = crate::logging::Timer::new("load_speech_model");
    Ok(Speech { engine: engine::load(m, dir, cfg!(target_os = "macos"))?, vad: Vad::load(vad)? })
}

/// Checks once a minute whether the model has been unused for `IDLE`.
fn watch_idle() {
    WATCH.call_once(|| {
        let _ = std::thread::Builder::new().name("speech-idle".into()).spawn(|| loop {
            std::thread::sleep(Duration::from_secs(60));
            lock().release_if_idle(Instant::now(), IDLE);
        });
    });
}

fn with_speech<R>(model_id: &str, f: impl FnOnce(&mut Speech) -> R) -> Result<R, String> {
    let (m, dir, vad) = locate(model_id)?;
    let key = format!("{}|{}", m.id, dir.display());
    watch_idle();
    lock().with(&key, Instant::now(), || load(m, &dir, &vad), f)
}

/// Loads the model now (while an answer is being recorded), so the transcript doesn't wait for it.
pub fn warm(model_id: &str) -> Result<(), String> {
    with_speech(model_id, |_| ())
}

/// One recorded answer to a transcript, with the model kept loaded for the next one.
pub fn transcribe_wav(wav: &Path, model_id: &str) -> Result<Transcript, String> {
    let samples = vad::read_track(wav).map_err(|e| format!("Couldn't read the recording: {e}"))?;
    with_speech(model_id, |s| {
        let spans = s.vad.detect(&samples)?;
        transcribe::transcribe_with(s.engine.as_mut(), &samples, &spans)
    })?
}

/// Lets go of the model now, before its files are deleted (Windows won't delete a file a model holds open).
pub fn unload() {
    lock().clear();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_same_model_is_loaded_once_and_reused() {
        let mut kept = Kept::new();
        let t0 = Instant::now();
        let mut loads = 0;
        for i in 0..3 {
            let got = kept.with("turbo", t0 + Duration::from_secs(i), || {
                loads += 1;
                Ok(7)
            }, |v| *v);
            assert_eq!(got, Ok(7));
        }
        assert_eq!(loads, 1);
    }

    #[test]
    fn another_model_replaces_the_one_loaded() {
        let mut kept = Kept::new();
        let t0 = Instant::now();
        kept.with("turbo", t0, || Ok("whisper"), |_| ()).unwrap();
        let got = kept.with("parakeet", t0, || Ok("parakeet"), |v| *v).unwrap();
        assert_eq!(got, "parakeet");
        assert_eq!(kept.key(), Some("parakeet"));
    }

    #[test]
    fn a_failed_load_keeps_nothing_and_says_why() {
        let mut kept: Kept<i32> = Kept::new();
        let t0 = Instant::now();
        kept.with("turbo", t0, || Ok(1), |_| ()).unwrap();
        let err = kept.with("missing", t0, || Err("That speech model isn't downloaded yet".into()), |_| ()).unwrap_err();
        assert_eq!(err, "That speech model isn't downloaded yet");
        assert_eq!(kept.key(), None);
    }

    #[test]
    fn it_is_let_go_after_being_unused_for_a_while_and_not_before() {
        let mut kept = Kept::new();
        let t0 = Instant::now();
        kept.with("turbo", t0, || Ok(1), |_| ()).unwrap();
        // Used again at 9 minutes: the clock starts over.
        kept.with("turbo", t0 + Duration::from_secs(9 * 60), || Ok(1), |_| ()).unwrap();
        kept.release_if_idle(t0 + Duration::from_secs(15 * 60), IDLE);
        assert_eq!(kept.key(), Some("turbo"));
        kept.release_if_idle(t0 + Duration::from_secs(19 * 60), IDLE);
        assert_eq!(kept.key(), None);
    }

    /// The app's own path on a real model: the first answer loads, the second reuses.
    /// ENSAYO_SMOKE_WAV=<16 kHz mono wav> ENSAYO_SMOKE_MODEL=whisper-turbo \
    /// cargo test --release --manifest-path src-tauri/Cargo.toml kept_real_model -- --ignored --nocapture
    #[test]
    #[ignore]
    fn kept_real_model() {
        let wav = std::env::var("ENSAYO_SMOKE_WAV").expect("set ENSAYO_SMOKE_WAV");
        let id = std::env::var("ENSAYO_SMOKE_MODEL").unwrap_or_else(|_| "whisper-tiny".into());
        for answer in ["first", "second"] {
            let t = Instant::now();
            let out = transcribe_wav(Path::new(&wav), &id).unwrap();
            println!("{answer} answer: {} words in {:.2}s ({})", out.words.len(), t.elapsed().as_secs_f64(), out.engine);
        }
        unload();
    }

    #[test]
    fn clear_lets_go_at_once() {
        let mut kept = Kept::new();
        kept.with("turbo", Instant::now(), || Ok(1), |_| ()).unwrap();
        kept.clear();
        assert_eq!(kept.key(), None);
    }
}
