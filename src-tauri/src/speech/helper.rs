//! Whisper on the Windows graphics card, through the engine's speech helper (`ensayo-stt-vulkan.exe`, the engine's
//! `voice-engine-stt` built with its `vulkan` feature, its own process because whisper.cpp's Vulkan build must never
//! be linked into the app). The engine's `SttClient` starts the helper, loads the model into it and sends it audio.
//!
//! The processor is the way out at every step, and it is in this process (the same in-process Whisper the Mac and a
//! computer with no card use), not a second helper:
//! * no helper file next to the app, or the card failed before for this app version and driver: Whisper loads in
//!   process on the processor, quietly (nothing failed now, `Route` never asks for the helper);
//! * the helper can't start or load the model: Whisper loads in process on the processor, and the backend says the card
//!   failed, so the person is told once (`graphics::fell_back`) and the card isn't asked again until it is turned off
//!   and on;
//! * the helper dies or errors on a later chunk: the model loads in process and that chunk is done there.
//!
//! The deciding is plain functions, so it is tested on every OS; only the helper file and the card are Windows.

use crate::paths;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use voice_engine_client::{EngineError, Fallback, Limits, SttClient, SttConfig};
use voice_engine_models::catalog::ModelInfo;
use voice_engine_protocol::stt::{SttLoad, SttModelKind};
use voice_engine_stt::{ChunkOptions, LoadOptions, SpeechBackend, SpeechError, Transcriber, Transcript};

/// The graphics card helper's file name, without the extension.
pub const VULKAN_HELPER: &str = "ensayo-stt-vulkan";
/// The processor helper's name. Ensayo doesn't ship it (the processor path is this process), so the engine's own
/// fallback to it finds nothing and fails fast, which is what sends the work to the in-process model.
pub const CPU_HELPER: &str = "ensayo-stt";
/// The engine's one-line file in the app's data folder where a failed card is remembered, per app version and driver.
pub const FAILURES_FILE: &str = "gpu-stt-failures";

/// A helper `name` next to the app binary at `exe` (in the install folder on Windows; `target/<profile>/` while
/// developing). `cargo test` runs from `target/<profile>/deps`, so the folder above is tried too.
fn find_beside(exe: &Path, name: &str) -> Option<PathBuf> {
    let dir = exe.parent();
    let beside = dir.map(|d| d.join(name)).filter(|b| b.exists());
    if beside.is_some() {
        return beside;
    }
    dir.filter(|d| d.file_name().is_some_and(|n| n == "deps")).and_then(|d| d.parent()).map(|up| up.join(name)).filter(|c| c.exists())
}

/// The Vulkan speech helper beside the app at `exe`, or None: `windows` false (there is none on the Mac) or the file isn't there.
pub fn vulkan_helper_from(exe: &Path, windows: bool) -> Option<PathBuf> {
    if !windows {
        return None;
    }
    find_beside(exe, &format!("{VULKAN_HELPER}{}", std::env::consts::EXE_SUFFIX))
}

/// The Vulkan speech helper beside this app, on Windows, when the file is there.
pub fn vulkan_helper_path() -> Option<PathBuf> {
    std::env::current_exe().ok().and_then(|e| vulkan_helper_from(&e, cfg!(windows)))
}

/// What a remembered card failure is keyed by, so an update or a new card or driver gets a fresh try.
pub fn gpu_key(version: &str, card: Option<&str>, driver: Option<&str>) -> String {
    let base = format!("{version}-{}", card.unwrap_or("none"));
    match (card, driver) {
        (Some(_), Some(driver)) => format!("{base}-{driver}"),
        _ => base,
    }
}

pub fn failures_file() -> PathBuf {
    paths::app_local().join(FAILURES_FILE)
}

/// Whether `file` remembers that the card failed for `key`.
pub fn failure_remembered(file: &Path, key: &str) -> bool {
    std::fs::read_to_string(file).is_ok_and(|text| text.trim() == key)
}

/// The helper Whisper may use: the file, unless the card failed before for this key.
pub fn helper_to_use(helper: Option<PathBuf>, remembered_failure: bool) -> Option<PathBuf> {
    helper.filter(|_| !remembered_failure)
}

/// The Whisper helper to use now (None: Whisper runs in process). Blocks the first time on Windows, while the card is
/// asked about, so call it from a worker thread.
pub fn whisper_helper_now() -> Option<PathBuf> {
    let helper = vulkan_helper_path()?;
    let key = gpu_key(env!("CARGO_PKG_VERSION"), crate::graphics::card(), crate::graphics::driver_version());
    helper_to_use(Some(helper), failure_remembered(&failures_file(), &key))
}

/// The engine's client settings: only the card helper exists, and the failure memory file is the engine's.
pub fn config(helper: PathBuf, exe_dir: &Path, key: String) -> SttConfig {
    SttConfig {
        cpu_helper: exe_dir.join(format!("{CPU_HELPER}{}", std::env::consts::EXE_SUFFIX)),
        gpu_helper: Some(helper),
        env: vec![],
        // Implicit Vulkan layers (overlays that hook every Vulkan app) are off for the helper, as for Talaan's.
        gpu_env: vec![("VK_LOADER_LAYERS_DISABLE".into(), "~implicit~".into())],
        gpu_failures: Some(failures_file()),
        gpu_key: key,
        // Nothing arrives while Whisper decodes a chunk (up to Whisper's window), and a cold first start waits on the
        // system checking the file, so the stall limit sits well above any decode.
        limits: Limits { stall: Duration::from_secs(5 * 60), ..Limits::default() },
    }
}

/// Forgets a remembered card failure (the person turned the card off and on again): the next load tries the card.
pub fn forget_card_failure() {
    voice_engine_client::clear_gpu_failure(&failures_file());
}

/// The helper's error as a `SpeechError`: a kind only, never the engine's text.
pub fn speech_error(e: &EngineError) -> SpeechError {
    match e {
        EngineError::ModelMissing { .. } => SpeechError::ModelMissing,
        EngineError::BadModel => SpeechError::BadModel,
        EngineError::OutOfMemory => SpeechError::OutOfMemory,
        EngineError::TooLong { max_secs } => SpeechError::TooLong { max_secs: *max_secs },
        EngineError::Unsupported { .. } => SpeechError::Unsupported("the speech helper".into()),
        EngineError::Cancelled => SpeechError::Internal("cancelled".into()),
        EngineError::TimedOut => SpeechError::Internal("speech helper timed out".into()),
        EngineError::Crashed { .. } => SpeechError::Internal("speech helper stopped".into()),
        EngineError::CouldNotStart { .. } => SpeechError::Internal("speech helper did not start".into()),
        EngineError::GpuFailed { .. } => SpeechError::Internal("graphics card failed".into()),
        _ => SpeechError::Internal("speech helper error".into()),
    }
}

/// Why the card is given up on after `e`: out of memory, or a failure.
pub fn why_the_card_failed(e: &SpeechError) -> Fallback {
    if *e == SpeechError::OutOfMemory { Fallback::CardOutOfMemory } else { Fallback::CardFailed }
}

fn placed(b: &voice_engine_protocol::Backend, fallback: Option<Fallback>) -> SpeechBackend {
    SpeechBackend { backend: b.backend.clone(), device: b.device.clone(), fallback }
}

/// Whisper in the helper, as a `Transcriber`.
pub struct HelperTranscriber {
    client: Arc<SttClient>,
    last: SpeechBackend,
}

impl HelperTranscriber {
    /// Loads the model into the helper. The engine falls back to the processor helper by itself; there is none here,
    /// so a card that can't start the helper is an error, and the caller loads in process.
    pub fn load(client: Arc<SttClient>, model: &ModelInfo, dir: &Path) -> Result<Self, SpeechError> {
        let out = client
            .load(SttLoad { model_id: model.id.into(), model_dir: dir.to_string_lossy().into_owned(), kind: SttModelKind::Whisper, gpu: true, threads: None })
            .map_err(|e| {
                log::warn!("speech helper: could not load {}: {e:?}", model.id);
                speech_error(&e)
            })?;
        let last = placed(&out.backend, out.fallback);
        Ok(HelperTranscriber { client, last })
    }
}

impl Transcriber for HelperTranscriber {
    fn transcribe(&mut self, audio: &[f32], opts: &ChunkOptions) -> Result<Transcript, SpeechError> {
        let out = self.client.transcribe(audio, opts).map_err(|e| {
            log::warn!("speech helper: transcribing failed: {e:?}");
            speech_error(&e)
        })?;
        // A card failure at load stays until a request says something else (the requests that follow, on the
        // processor, say the card was not tried).
        let fallback = match (out.fallback, self.last.fallback) {
            (Some(Fallback::RememberedFailure), Some(before @ (Fallback::CardFailed | Fallback::CardOutOfMemory))) => Some(before),
            (now, _) => now,
        };
        self.last = placed(&out.backend, fallback);
        Ok(out.value)
    }

    fn backend(&self) -> SpeechBackend {
        self.last.clone()
    }
}

impl Drop for HelperTranscriber {
    /// The model is let go (idle, another model, the card turned off): the helper stops with it, so it holds no memory
    /// and no file between answers. The next load starts it again, which takes about a second.
    fn drop(&mut self) {
        self.client.shutdown();
    }
}

/// Builds the in-process processor model, for when the helper can't be used.
pub type Spare = Box<dyn FnOnce() -> Result<Box<dyn Transcriber>, SpeechError> + Send>;

/// A model that has a way out: it runs `primary`, and when that fails it loads `spare` (the processor, in process),
/// does that chunk there and stays there. The backend says the card failed.
pub struct WithFallback {
    primary: Option<Box<dyn Transcriber>>,
    spare: Option<Spare>,
    active: Option<Box<dyn Transcriber>>,
    fallback: Option<Fallback>,
}

impl WithFallback {
    pub fn new(primary: Box<dyn Transcriber>, spare: Spare) -> Self {
        WithFallback { primary: Some(primary), spare: Some(spare), active: None, fallback: None }
    }

    /// The card has already failed (the helper didn't load): `processor` runs, and the backend says why.
    pub fn already_failed(processor: Box<dyn Transcriber>, why: Fallback) -> Self {
        WithFallback { primary: None, spare: None, active: Some(processor), fallback: Some(why) }
    }
}

impl Transcriber for WithFallback {
    fn transcribe(&mut self, audio: &[f32], opts: &ChunkOptions) -> Result<Transcript, SpeechError> {
        if let Some(active) = self.active.as_mut() {
            return active.transcribe(audio, opts);
        }
        let primary = self.primary.as_mut().expect("a model with neither a primary nor a fallback is never built");
        match primary.transcribe(audio, opts) {
            // Audio that is too long for the model is the app's to cut, not a failure of the card.
            Err(e @ SpeechError::TooLong { .. }) => Err(e),
            Err(e) => {
                let why = why_the_card_failed(&e);
                log::warn!("graphics card: the speech helper failed ({why:?}), Whisper moves to the processor");
                let spare = self.spare.take().ok_or(e)?;
                self.primary = None;
                let mut processor = spare()?;
                let out = processor.transcribe(audio, opts);
                self.active = Some(processor);
                self.fallback = Some(why);
                out
            }
            ok => ok,
        }
    }

    fn backend(&self) -> SpeechBackend {
        match (&self.active, &self.primary) {
            (Some(active), _) => SpeechBackend { fallback: self.fallback, ..active.backend() },
            (None, Some(primary)) => primary.backend(),
            (None, None) => SpeechBackend { backend: "cpu".into(), device: None, fallback: self.fallback },
        }
    }
}

/// Whisper through the helper with the processor behind it. `helper` loads the model into the helper; `processor`
/// loads it in process on the processor and may be called once more later, so it is `Fn`.
pub fn load_whisper_with(
    helper: impl FnOnce() -> Result<Box<dyn Transcriber>, SpeechError>,
    processor: impl Fn() -> Result<Box<dyn Transcriber>, SpeechError> + Send + Clone + 'static,
) -> Result<Box<dyn Transcriber>, SpeechError> {
    match helper() {
        Ok(primary) => {
            let spare = processor.clone();
            Ok(Box::new(WithFallback::new(primary, Box::new(move || spare()))))
        }
        Err(e) => {
            let why = why_the_card_failed(&e);
            log::warn!("graphics card: the speech helper did not load the model ({why:?}), Whisper runs on the processor");
            Ok(Box::new(WithFallback::already_failed(processor()?, why)))
        }
    }
}

/// Whisper `model` from `dir` on the card through the helper at `helper`, falling back to the processor in this process.
pub fn load_whisper(model: &'static ModelInfo, dir: &Path, helper: PathBuf) -> Result<Box<dyn Transcriber>, SpeechError> {
    let exe_dir = helper.parent().map(Path::to_path_buf).unwrap_or_default();
    let key = gpu_key(env!("CARGO_PKG_VERSION"), crate::graphics::card(), crate::graphics::driver_version());
    let client = Arc::new(SttClient::new(config(helper, &exe_dir, key)));
    let dir_for_processor = dir.to_path_buf();
    let dir_for_helper = dir.to_path_buf();
    load_whisper_with(
        move || HelperTranscriber::load(client, model, &dir_for_helper).map(|t| Box::new(t) as Box<dyn Transcriber>),
        move || voice_engine_stt::load(model, &dir_for_processor, LoadOptions { gpu: false, threads: None }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Mutex;

    /// A model that says what it is, fails when told to, and counts its calls.
    struct Fake {
        name: &'static str,
        fail: Option<SpeechError>,
        calls: Arc<AtomicUsize>,
    }

    fn transcript(name: &str) -> Transcript {
        serde_json::from_value(serde_json::json!({ "segments": [], "language": name })).expect("a transcript")
    }

    impl Transcriber for Fake {
        fn transcribe(&mut self, _: &[f32], _: &ChunkOptions) -> Result<Transcript, SpeechError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            match &self.fail {
                Some(e) => Err(e.clone()),
                None => Ok(transcript(self.name)),
            }
        }
        fn backend(&self) -> SpeechBackend {
            SpeechBackend { backend: if self.name == "card" { "vulkan".into() } else { "cpu".into() }, device: None, fallback: None }
        }
    }

    fn fake(name: &'static str, fail: Option<SpeechError>) -> (Box<dyn Transcriber>, Arc<AtomicUsize>) {
        let calls = Arc::new(AtomicUsize::new(0));
        (Box::new(Fake { name, fail, calls: calls.clone() }), calls)
    }

    fn lang(t: &Transcript) -> &str {
        t.language.as_deref().unwrap_or("")
    }

    #[test]
    fn the_card_runs_the_chunks_while_it_works_and_the_processor_is_never_loaded() {
        let (card, card_calls) = fake("card", None);
        let loaded = Arc::new(AtomicUsize::new(0));
        let l = loaded.clone();
        let mut t = load_whisper_with(move || Ok(card), move || { l.fetch_add(1, Ordering::SeqCst); Ok(fake("cpu", None).0) }).unwrap();
        for _ in 0..3 {
            assert_eq!(lang(&t.transcribe(&[0.0], &ChunkOptions::default()).unwrap()), "card");
        }
        assert_eq!(card_calls.load(Ordering::SeqCst), 3);
        assert_eq!(loaded.load(Ordering::SeqCst), 0, "the processor model is loaded only when needed");
        let b = t.backend();
        assert_eq!((b.backend.as_str(), b.fallback), ("vulkan", None));
    }

    #[test]
    fn a_helper_that_will_not_load_leaves_whisper_on_the_processor_and_says_the_card_failed() {
        let mut t = load_whisper_with(|| Err(SpeechError::Internal("speech helper did not start".into())), || Ok(fake("cpu", None).0)).unwrap();
        let b = t.backend();
        assert_eq!((b.backend.as_str(), b.fallback), ("cpu", Some(Fallback::CardFailed)));
        assert_eq!(lang(&t.transcribe(&[0.0], &ChunkOptions::default()).unwrap()), "cpu");
        // A helper that ran out of memory says so.
        let t = load_whisper_with(|| Err(SpeechError::OutOfMemory), || Ok(fake("cpu", None).0)).unwrap();
        assert_eq!(t.backend().fallback, Some(Fallback::CardOutOfMemory));
    }

    #[test]
    fn when_the_processor_cannot_load_either_the_error_is_the_processors() {
        let e = load_whisper_with(|| Err(SpeechError::Internal("x".into())), || Err(SpeechError::ModelMissing)).err().unwrap();
        assert_eq!(e, SpeechError::ModelMissing);
    }

    #[test]
    fn a_helper_that_dies_mid_answer_hands_that_chunk_and_the_rest_to_the_processor() {
        let (card, card_calls) = fake("card", Some(SpeechError::Internal("speech helper stopped".into())));
        let cpu_calls = Arc::new(Mutex::new(0usize));
        let c = cpu_calls.clone();
        let mut t = load_whisper_with(move || Ok(card), move || { *c.lock().unwrap() += 1; Ok(fake("cpu", None).0) }).unwrap();
        assert_eq!(t.backend().fallback, None, "nothing failed yet");
        assert_eq!(lang(&t.transcribe(&[0.0], &ChunkOptions::default()).unwrap()), "cpu", "the chunk that failed is done on the processor");
        let b = t.backend();
        assert_eq!((b.backend.as_str(), b.fallback), ("cpu", Some(Fallback::CardFailed)));
        assert_eq!(lang(&t.transcribe(&[0.0], &ChunkOptions::default()).unwrap()), "cpu");
        assert_eq!(card_calls.load(Ordering::SeqCst), 1, "the helper is not asked again");
        assert_eq!(*cpu_calls.lock().unwrap(), 1, "the processor model is loaded once");
    }

    #[test]
    fn out_of_memory_in_the_helper_is_reported_as_the_card_running_out_of_memory() {
        let (card, _) = fake("card", Some(SpeechError::OutOfMemory));
        let mut t = load_whisper_with(move || Ok(card), || Ok(fake("cpu", None).0)).unwrap();
        t.transcribe(&[0.0], &ChunkOptions::default()).unwrap();
        assert_eq!(t.backend().fallback, Some(Fallback::CardOutOfMemory));
    }

    #[test]
    fn audio_that_is_too_long_is_not_a_card_failure() {
        let (card, _) = fake("card", Some(SpeechError::TooLong { max_secs: 30 }));
        let mut t = load_whisper_with(move || Ok(card), || Ok(fake("cpu", None).0)).unwrap();
        assert_eq!(t.transcribe(&[0.0], &ChunkOptions::default()).unwrap_err(), SpeechError::TooLong { max_secs: 30 });
        assert_eq!(t.backend().fallback, None);
    }

    #[test]
    fn the_helpers_errors_are_kinds_with_none_of_the_engines_text() {
        assert_eq!(speech_error(&EngineError::OutOfMemory), SpeechError::OutOfMemory);
        assert_eq!(speech_error(&EngineError::BadModel), SpeechError::BadModel);
        assert_eq!(speech_error(&EngineError::ModelMissing { path: "C:\\Users\\someone\\m.bin".into() }), SpeechError::ModelMissing);
        assert_eq!(speech_error(&EngineError::TooLong { max_secs: 30 }), SpeechError::TooLong { max_secs: 30 });
        for e in [
            EngineError::CouldNotStart { message: "C:\\Users\\someone\\ensayo-stt-vulkan.exe".into() },
            EngineError::Crashed { exit_code: Some(1), signal: None, detail: "abort() in C:\\Users\\someone".into() },
            EngineError::TimedOut,
            EngineError::GpuFailed { fell_back: false },
            EngineError::Internal { message: "C:\\Users\\someone".into() },
        ] {
            let text = format!("{:?}", speech_error(&e));
            assert!(!text.contains("Users") && !text.contains("abort"), "{text}");
        }
    }

    #[test]
    fn the_helper_is_looked_for_beside_the_app_on_windows_only() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("Ensayo.exe");
        assert_eq!(vulkan_helper_from(&exe, true), None, "no file, no helper");
        let file = dir.path().join(format!("{VULKAN_HELPER}{}", std::env::consts::EXE_SUFFIX));
        std::fs::write(&file, b"").unwrap();
        assert_eq!(vulkan_helper_from(&exe, true), Some(file.clone()));
        assert_eq!(vulkan_helper_from(&exe, false), None, "the Mac never has one");
        // `cargo test` runs from target/<profile>/deps: the folder above is searched too.
        let deps = dir.path().join("deps");
        std::fs::create_dir(&deps).unwrap();
        assert_eq!(vulkan_helper_from(&deps.join("ensayo-abc.exe"), true), Some(file));
    }

    #[test]
    fn a_remembered_failure_keeps_the_helper_out_until_the_version_or_driver_changes() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join(FAILURES_FILE);
        let key = gpu_key("0.6.0", Some("NVIDIA GeForce RTX 4060"), Some("32.0.15.6614"));
        assert!(!failure_remembered(&file, &key));
        std::fs::write(&file, &key).unwrap();
        assert!(failure_remembered(&file, &key));
        assert!(!failure_remembered(&file, &gpu_key("0.6.1", Some("NVIDIA GeForce RTX 4060"), Some("32.0.15.6614"))), "an update tries again");
        assert!(!failure_remembered(&file, &gpu_key("0.6.0", Some("NVIDIA GeForce RTX 4060"), Some("32.0.15.7000"))), "a new driver tries again");
        let helper = Some(PathBuf::from("ensayo-stt-vulkan.exe"));
        assert_eq!(helper_to_use(helper.clone(), false), helper);
        assert_eq!(helper_to_use(helper, true), None);
        assert_eq!(helper_to_use(None, false), None);
    }

    #[test]
    fn the_key_has_the_driver_only_with_a_card() {
        assert_eq!(gpu_key("1.0", None, Some("1.2")), "1.0-none");
        assert_eq!(gpu_key("1.0", Some("RTX"), None), "1.0-RTX");
        assert_eq!(gpu_key("1.0", Some("RTX"), Some("1.2")), "1.0-RTX-1.2");
    }

    #[test]
    fn the_client_is_set_up_with_the_card_helper_only() {
        let c = config(PathBuf::from("/app/ensayo-stt-vulkan.exe"), Path::new("/app"), "k".into());
        assert_eq!(c.gpu_helper, Some(PathBuf::from("/app/ensayo-stt-vulkan.exe")));
        assert!(!c.cpu_helper.exists(), "no processor helper is shipped");
        assert_eq!(c.gpu_key, "k");
        assert_eq!(c.gpu_env, vec![("VK_LOADER_LAYERS_DISABLE".to_string(), "~implicit~".to_string())]);
        assert_eq!(c.limits.stall, Duration::from_secs(300));
        assert!(c.gpu_failures.as_deref().is_some_and(|p| p.ends_with(FAILURES_FILE)));
    }
}
