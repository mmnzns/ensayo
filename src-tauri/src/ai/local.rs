//! The built-in local AI as an `Llm`: the app's side of the `ensayo-llm` helper, which is the engine's helper
//! (`voice-engine-llm`) in its own process. The engine's `LlmClient` starts the helper when the first answer needs it,
//! keeps the model loaded between answers, and turns a crash, an out-of-memory or a hang into an error; this file keeps
//! where the helper is, the words the person reads for each of those, and the one shared client. The helper exits by
//! itself after two idle minutes and whenever Ensayo closes (its stdin closes), and `stop_shared` ends it at once.
//!
//! Fast and Strong tasks run on the same loaded model (one model in memory). `json: true` constrains the reply to a
//! JSON object with llama.cpp's grammar, so it always parses; the prompt still carries the schema the keys must follow.

use super::llm::{Llm, LlmReply, LlmRequest};
use super::providers::AiError;
use crate::graphics;
use crate::models_store;
use crate::paths;
use crate::speech::loaded::Kept;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, Once};
use std::time::{Duration, Instant};
use voice_engine_client::{EngineError, Limits, LlmClient, LlmConfig};
use voice_engine_models::ModelHandle;
use voice_engine_protocol::{Completion, JSON_OBJECT_SCHEMA};

pub const HELPER: &str = "ensayo-llm";

/// Context in tokens (prompt plus reply): room for a long job posting or resume and a full answer.
pub const CONTEXT: u32 = 16_384;
/// Greedy decoding: the most repeatable scores, like temperature 0 on the cloud models.
pub const TEMPERATURE: f32 = 0.0;

/// The helper's file name on this OS (`ensayo-llm`, or `ensayo-llm.exe` on Windows).
pub fn helper_file() -> String {
    format!("{HELPER}{}", std::env::consts::EXE_SUFFIX)
}

/// A helper `name` next to the app binary at `exe` (in the app bundle, `Contents/MacOS/`; next to `Ensayo.exe` on
/// Windows; in `target/<profile>/` during development). `cargo test` runs from `target/<profile>/deps`, so the folder
/// above that is tried too.
fn find_beside(exe: &Path, name: &str) -> Option<PathBuf> {
    let dir = exe.parent();
    let beside = dir.map(|d| d.join(name)).filter(|b| b.exists());
    if beside.is_some() {
        return beside;
    }
    dir.filter(|d| d.file_name().is_some_and(|n| n == "deps")).and_then(|d| d.parent()).map(|up| up.join(name)).filter(|c| c.exists())
}

/// Where the helper lives for an app binary at `exe`; when it is nowhere, the plain spot beside the binary.
pub fn helper_path_from(exe: &Path) -> PathBuf {
    let name = helper_file();
    find_beside(exe, &name).unwrap_or_else(|| exe.parent().map(|d| d.join(&name)).unwrap_or_else(|| PathBuf::from(name)))
}

pub fn helper_path() -> PathBuf {
    std::env::current_exe().map(|e| helper_path_from(&e)).unwrap_or_else(|_| PathBuf::from(helper_file()))
}

/// The graphics-card helper's file name (`ensayo-llm-vulkan.exe`): the Windows build of the helper that runs on the
/// card through Vulkan.
pub const VULKAN_HELPER: &str = "ensayo-llm-vulkan";

/// The Vulkan helper beside the app on Windows, or None (not Windows, or the file isn't there): the AI then runs on the
/// processor helper.
pub fn vulkan_helper_from(exe: &Path) -> Option<PathBuf> {
    if !cfg!(windows) {
        return None;
    }
    find_beside(exe, &format!("{VULKAN_HELPER}{}", std::env::consts::EXE_SUFFIX))
}

pub fn vulkan_helper_path() -> Option<PathBuf> {
    std::env::current_exe().ok().and_then(|e| vulkan_helper_from(&e))
}

/// How long one whole answer may take, so nothing waits forever. The engine's own limits for starting the helper (60 s:
/// the first launch after an install waits on the system checking the file) and for a stall (120 s without a word)
/// are kept.
const TOTAL: Duration = Duration::from_secs(10 * 60);

/// The helper exits by itself after this many idle seconds, freeing the model's memory.
const IDLE_SECS: u64 = 120;

/// What the client is told about the graphics card.
#[derive(Debug, Clone, PartialEq)]
pub struct Card {
    /// The setting is on.
    pub on: bool,
    /// The Windows graphics-card helper, when the setting is on and the file is there.
    pub vulkan: Option<PathBuf>,
    /// The card's name, for the key that remembers a failure (a new card or driver gets a fresh try).
    pub name: Option<String>,
}

impl Card {
    /// The state for this computer now: the setting, the helper file and the card. Blocks like `graphics::card`.
    pub fn now() -> Card {
        let on = graphics::is_on();
        Card { on, vulkan: if on { vulkan_helper_path() } else { None }, name: graphics::card().map(str::to_string) }
    }

    /// Whether a request should ask for the card: Metal on a Mac, and on Windows only when there is a helper that has
    /// one. (A Windows build with no card helper asks for nothing, so it never reports a false fallback.)
    pub fn ask(&self) -> bool {
        self.on && (cfg!(target_os = "macos") || self.vulkan.is_some())
    }

    fn key(&self) -> String {
        format!("{}-{}", env!("CARGO_PKG_VERSION"), self.name.as_deref().unwrap_or("none"))
    }
}

/// A file remembering that the graphics card failed, so it isn't tried again on every start.
fn failures_file() -> PathBuf {
    paths::app_local().join("gpu-failures.json")
}

/// Forgets that the card failed (the person turned it on again): the next answer tries it.
pub fn forget_card_failure() {
    voice_engine_client::clear_gpu_failure(&failures_file());
}

fn new_client(exe: &Path, card: &Card) -> LlmClient {
    LlmClient::new(LlmConfig {
        cpu_helper: exe.to_path_buf(),
        gpu_helper: card.vulkan.clone(),
        env: vec![],
        gpu_env: vec![],
        gpu_failures: Some(failures_file()),
        gpu_key: card.key(),
        idle_secs: Some(IDLE_SECS),
        limits: Limits { total: TOTAL, ..Limits::default() },
    })
}

/// A model asked to answer through the shared client.
pub struct LocalLlm {
    client: Arc<LlmClient>,
    exe: PathBuf,
    model_path: PathBuf,
    /// The catalog id, reported as the model that answered.
    model_name: String,
    /// Ask for the graphics card (`Card::ask`).
    gpu: bool,
    /// Hold the model's folder while it is loaded, so no other app erases it mid-use. Off only in tests.
    hold: bool,
}

const MISSING_HELPER: &str = "Ensayo couldn't start the built-in local AI because its helper program is missing or was blocked. Reinstall Ensayo, or choose another feedback engine in Settings › AI.";
const OUT_OF_MEMORY: &str = "The built-in local AI ran out of memory. Close some other apps and try again, or choose a smaller model or another feedback engine in Settings › AI.";
const CRASHED: &str = "The built-in local AI stopped unexpectedly. Try again, or choose another feedback engine in Settings › AI.";
const NO_START: &str = "The built-in local AI didn't start. Try again, or choose another feedback engine in Settings › AI.";
const TOO_SLOW: &str = "The built-in local AI took too long, so Ensayo stopped it. Try again, or choose another feedback engine in Settings › AI.";
const STOPPED: &str = "The built-in local AI was stopped before it finished answering. Try again.";
const NOT_DOWNLOADED: &str = "The built-in local AI's model isn't downloaded yet. Download it in Settings › AI.";
const FAILED: &str = "The built-in local AI couldn't answer. Try again, or choose another feedback engine in Settings › AI.";

/// Words for the person for each way the helper fails. Never the engine's own text, and never anything that was said.
fn message(e: &EngineError) -> AiError {
    match e {
        EngineError::OutOfMemory => AiError::Failed(OUT_OF_MEMORY.into()),
        EngineError::Crashed => AiError::Failed(CRASHED.into()),
        EngineError::CouldNotStart { .. } | EngineError::VersionMismatch { .. } => AiError::Failed(NO_START.into()),
        EngineError::TimedOut => AiError::Failed(TOO_SLOW.into()),
        EngineError::PromptTooLong { prompt_tokens, n_ctx, max_tokens } => {
            AiError::Failed(format!("The text is too long for the built-in local AI ({prompt_tokens} tokens, room for {}).", n_ctx.saturating_sub(*max_tokens)))
        }
        EngineError::Cancelled => AiError::Failed(STOPPED.into()),
        EngineError::ModelMissing { .. } => AiError::Unavailable(NOT_DOWNLOADED.into()),
        _ => AiError::Failed(FAILED.into()),
    }
}

impl Llm for LocalLlm {
    fn complete(&self, req: &LlmRequest) -> Result<LlmReply, AiError> {
        if !self.exe.exists() {
            log::warn!("couldn't start the local AI helper: it is not where it should be");
            return Err(AiError::Unavailable(MISSING_HELPER.into()));
        }
        // The model's folder is held for as long as the helper may have the model loaded.
        let _busy = Busy::start();
        if self.hold {
            hold_model(&self.model_name)?;
        }
        // Fast and Strong share the one loaded model.
        let c = Completion {
            model_path: self.model_path.to_string_lossy().into_owned(),
            n_ctx: CONTEXT,
            system: req.system.clone(),
            user: req.user.clone(),
            json_schema: req.json.then(|| JSON_OBJECT_SCHEMA.to_string()),
            max_tokens: req.max_tokens,
            temperature: TEMPERATURE,
            gpu: self.gpu,
            thinking: false,
            thinking_budget: None,
            seed: None,
        };
        let out = self.client.complete(c, &mut |_| {}).map_err(|e| {
            log::warn!("local AI: {e}");
            message(&e)
        })?;
        if out.fell_back {
            graphics::fell_back(graphics::AI);
        }
        if self.hold {
            // The idle clock runs from the end of the answer, like the helper's.
            let _ = hold_model(&self.model_name);
        }
        let reply = out.value;
        if reply.text.trim().is_empty() {
            return Err(AiError::Failed(if reply.truncated { "The built-in local AI ran out of room before it finished answering." } else { "The built-in local AI sent back an empty answer." }.into()));
        }
        Ok(LlmReply { text: reply.text, input_tokens: reply.prompt_tokens, output_tokens: reply.output_tokens, model: self.model_name.clone() })
    }
}

// ---------- the one shared client ----------

/// The client (and through it the helper and its loaded model) is shared by every answer, so a second answer does not
/// load the model again. It is built for one graphics-card state; changing the setting stops it (`stop_shared`).
static SHARED: Mutex<Option<(PathBuf, Arc<LlmClient>)>> = Mutex::new(None);

/// A handle that answers with `model_path` through the shared client for this helper. Another model replaces the
/// loaded one inside the helper; another helper path (never in practice) replaces the client. Blocks the first time on
/// Windows (the graphics card is asked about), so call it from a worker thread.
pub fn shared(exe: &Path, model_path: &Path, model_name: &str) -> LocalLlm {
    shared_with(exe, model_path, model_name, &Card::now(), true)
}

fn shared_with(exe: &Path, model_path: &Path, model_name: &str, card: &Card, hold: bool) -> LocalLlm {
    let mut slot = SHARED.lock().unwrap_or_else(|e| e.into_inner());
    let client = match slot.as_ref().filter(|(path, _)| path == exe) {
        Some((_, client)) => client.clone(),
        None => {
            if let Some((_, old)) = slot.take() {
                old.shutdown();
            }
            let client = Arc::new(new_client(exe, card));
            *slot = Some((exe.to_path_buf(), client.clone()));
            client
        }
    };
    LocalLlm { client, exe: exe.to_path_buf(), model_path: model_path.to_path_buf(), model_name: model_name.to_string(), gpu: card.ask(), hold }
}

/// Ends the shared helper now (the app is closing, the engine was switched, or the models are being deleted), and lets
/// go of the model's folder.
pub fn stop_shared() {
    let taken = SHARED.lock().unwrap_or_else(|e| e.into_inner()).take();
    if let Some((_, client)) = taken {
        client.shutdown();
    }
    release_hold();
}

/// Frees the loaded model's memory and its file now, but keeps the helper for the next answer (a model is being deleted).
pub fn unload_shared() {
    let client = SHARED.lock().unwrap_or_else(|e| e.into_inner()).as_ref().map(|(_, c)| c.clone());
    if let Some(client) = client {
        if let Err(e) = client.unload() {
            log::warn!("local AI: could not unload the model: {e}");
        }
    }
    release_hold();
}

// ---------- the hold on the model's folder ----------

/// A hold on the folder of the model the helper has loaded: no other Craft Concepts app can erase it meanwhile (and on
/// Windows its file can't be deleted under the helper). Let go when the model is unloaded, the helper stops, or the
/// helper has been idle for as long as it keeps the model.
static HELD: Mutex<Kept<ModelHandle>> = Mutex::new(Kept::new());
/// Answers running now: an answer can take longer than the idle time, and must not lose its hold.
static RUNNING: AtomicUsize = AtomicUsize::new(0);
static WATCH: Once = Once::new();

struct Busy;

impl Busy {
    fn start() -> Busy {
        RUNNING.fetch_add(1, Ordering::SeqCst);
        Busy
    }
}

impl Drop for Busy {
    fn drop(&mut self) {
        RUNNING.fetch_sub(1, Ordering::SeqCst);
    }
}

fn held() -> std::sync::MutexGuard<'static, Kept<ModelHandle>> {
    HELD.lock().unwrap_or_else(|e| e.into_inner())
}

fn release_hold() {
    held().clear();
}

/// Words for a model that can't be held: it isn't completely on this computer, or another app has it locked.
fn hold_text(e: &voice_engine_models::StoreError) -> String {
    match e {
        voice_engine_models::StoreError::NotInstalled(_) => NOT_DOWNLOADED.to_string(),
        _ => "Ensayo couldn't open the built-in local AI's model. Close other apps that use it and try again.".to_string(),
    }
}

fn hold_error(text: String) -> AiError {
    if text == NOT_DOWNLOADED {
        AiError::Unavailable(text)
    } else {
        AiError::Failed(text)
    }
}

/// Holds `id`'s folder (replacing the hold on another model) and starts its idle clock over.
fn hold_model(id: &str) -> Result<(), AiError> {
    watch_idle();
    let store = models_store::store().map_err(AiError::Failed)?;
    held().with(id, Instant::now(), || store.hold(id).map_err(|e| hold_text(&e)), |_| ()).map_err(hold_error)
}

/// Checks twice a minute whether the helper has been idle long enough to have let the model go.
fn watch_idle() {
    WATCH.call_once(|| {
        let _ = std::thread::Builder::new().name("local-ai-idle".into()).spawn(|| loop {
            std::thread::sleep(Duration::from_secs(30));
            release_hold_if_idle(Instant::now());
        });
    });
}

fn release_hold_if_idle(now: Instant) {
    idle_release(&mut held(), now, RUNNING.load(Ordering::SeqCst));
}

/// Lets go of the hold when no answer is running and the helper has been idle for as long as it keeps the model.
fn idle_release(kept: &mut Kept<ModelHandle>, now: Instant, running: usize) {
    if running == 0 {
        kept.release_if_idle(now, Duration::from_secs(IDLE_SECS));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::llm::Tier;

    /// The tests that start, stop or hold the one shared client take turns, since it is one per process.
    static SERIAL: Mutex<()> = Mutex::new(());

    fn serial() -> std::sync::MutexGuard<'static, ()> {
        SERIAL.lock().unwrap_or_else(|e| e.into_inner())
    }

    const NO_CARD: Card = Card { on: false, vulkan: None, name: None };

    fn shared_in_test(exe: &Path, model: &str, name: &str) -> LocalLlm {
        shared_with(exe, Path::new(model), name, &NO_CARD, false)
    }

    fn request(json: bool, tier: Tier) -> LlmRequest {
        LlmRequest { system: "Be brief.".into(), user: "Classify this question.".into(), json, max_tokens: 200, tier }
    }

    fn text_of(e: AiError) -> String {
        match e {
            AiError::Unavailable(m) | AiError::Failed(m) => m,
        }
    }

    #[test]
    fn a_missing_helper_is_one_plain_unavailable_message() {
        let _s = serial();
        let ai = shared_in_test(Path::new("/nonexistent/ensayo-llm"), "/models/qwen.gguf", "qwen3.5-4b");
        let e = ai.complete(&request(true, Tier::Fast)).unwrap_err();
        assert!(matches!(e, AiError::Unavailable(_)), "{e:?}");
        let m = text_of(e);
        assert!(m.contains("helper program is missing") && m.contains("Settings"), "{m}");
        assert!(!m.contains("nonexistent"), "no file paths for the user: {m}");
        stop_shared();
    }

    #[test]
    fn every_kind_of_failure_has_its_own_words_for_the_person() {
        let failed = |e: EngineError| match message(&e) {
            AiError::Failed(m) => m,
            other => panic!("{e:?} should be a failure, not {other:?}"),
        };
        assert_eq!(failed(EngineError::OutOfMemory), OUT_OF_MEMORY);
        assert_eq!(failed(EngineError::Crashed), CRASHED);
        assert_eq!(failed(EngineError::CouldNotStart { message: "no such file".into() }), NO_START);
        assert_eq!(failed(EngineError::VersionMismatch { helper: 1, app: 2 }), NO_START);
        assert_eq!(failed(EngineError::TimedOut), TOO_SLOW);
        assert_eq!(failed(EngineError::Cancelled), STOPPED);
        let long = failed(EngineError::PromptTooLong { prompt_tokens: 17_000, n_ctx: 16_384, max_tokens: 1_000 });
        assert_eq!(long, "The text is too long for the built-in local AI (17000 tokens, room for 15384).");
        for other in [EngineError::BadSchema { detail: "x".into() }, EngineError::NoChatTemplate, EngineError::BadRequest, EngineError::Internal { message: "boom".into() }, EngineError::GpuFailed { fell_back: false }] {
            assert_eq!(failed(other), FAILED);
        }
        assert!(matches!(message(&EngineError::ModelMissing { path: "/m.gguf".into() }), AiError::Unavailable(m) if m == NOT_DOWNLOADED));
    }

    #[test]
    fn no_failure_text_carries_a_path_or_the_engines_own_words() {
        for e in [EngineError::CouldNotStart { message: "/Users/dana/ensayo-llm: permission denied".into() }, EngineError::Internal { message: "I led the Braze migration".into() }, EngineError::ModelMissing { path: "/Users/dana/m.gguf".into() }] {
            let m = text_of(message(&e));
            assert!(!m.contains("dana") && !m.contains("Braze") && !m.contains("denied"), "{m}");
            assert!(m.contains("Settings"), "every message says where to go: {m}");
        }
    }

    #[test]
    fn every_failure_message_says_what_to_do() {
        for m in [OUT_OF_MEMORY, CRASHED, NO_START, TOO_SLOW, FAILED, NOT_DOWNLOADED, MISSING_HELPER] {
            assert!(m.contains("Settings › AI"), "{m}");
        }
        assert!(STOPPED.contains("Try again"));
    }

    /// A helper that speaks the engine's protocol without a model: answers the ping, the idle setting, and every
    /// completion with `text`. Proves the app's side of the conversation (what is sent, what comes back).
    #[cfg(unix)]
    fn fake_helper(dir: &Path, text: &str, truncated: bool) -> PathBuf {
        use std::os::unix::fs::PermissionsExt;
        let path = dir.join("fake-llm");
        let body = format!(
            r#"#!/bin/sh
while read line; do
  case "$line" in
    *'"op":"ping"'*) echo '{{"event":"ready","backend":"cpu","vram_mb":0,"protocol":2}}' ;;
    *'"op":"configure"'*) echo '{{"event":"configured","idle_secs":120}}' ;;
    *'"op":"complete"'*) echo '{{"event":"done","text":"{text}","prompt_tokens":120,"output_tokens":7,"seconds":0.1,"truncated":{truncated}}}' ;;
  esac
done
"#
        );
        std::fs::write(&path, body).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

    #[cfg(unix)]
    #[test]
    fn a_reply_comes_back_with_its_token_counts_and_the_model_name_and_the_helper_is_reused() {
        let _s = serial();
        let dir = tempfile::tempdir().unwrap();
        let exe = fake_helper(dir.path(), "first", false);
        let ai = LocalLlm { client: Arc::new(new_client(&exe, &NO_CARD)), exe: exe.clone(), model_path: PathBuf::from("/models/qwen.gguf"), model_name: "qwen3.5-4b".into(), gpu: false, hold: false };
        let r = ai.complete(&request(true, Tier::Fast)).unwrap();
        assert_eq!((r.text.as_str(), r.input_tokens, r.output_tokens, r.model.as_str()), ("first", 120, 7, "qwen3.5-4b"));
        assert_eq!(ai.complete(&request(false, Tier::Strong)).unwrap().text, "first", "both tiers use the same helper");
        ai.client.shutdown();
    }

    #[cfg(unix)]
    #[test]
    fn an_empty_answer_is_an_error_not_a_blank_note() {
        let _s = serial();
        let dir = tempfile::tempdir().unwrap();
        let exe = fake_helper(dir.path(), "", true);
        let ai = LocalLlm { client: Arc::new(new_client(&exe, &NO_CARD)), exe: exe.clone(), model_path: PathBuf::from("/models/qwen.gguf"), model_name: "qwen3.5-4b".into(), gpu: false, hold: false };
        let m = text_of(ai.complete(&request(true, Tier::Fast)).unwrap_err());
        assert!(m.contains("ran out of room"), "{m}");
        ai.client.shutdown();
    }

    #[test]
    fn the_helper_is_found_next_to_the_app_or_above_cargo_tests_deps_folder() {
        let dir = tempfile::tempdir().unwrap();
        let profile = dir.path().join("target").join("debug");
        let deps = profile.join("deps");
        std::fs::create_dir_all(&deps).unwrap();
        let exe = deps.join("ensayo_lib-abc123");
        assert_eq!(helper_path_from(&exe), deps.join(helper_file()), "not found anywhere: the plain spot");
        std::fs::write(profile.join(helper_file()), b"").unwrap();
        assert_eq!(helper_path_from(&exe), profile.join(helper_file()));
        std::fs::write(deps.join(helper_file()), b"").unwrap();
        assert_eq!(helper_path_from(&exe), deps.join(helper_file()), "next to the binary wins");
        assert_eq!(helper_path_from(&profile.join("ensayo")), profile.join(helper_file()));
    }

    #[test]
    fn the_card_is_asked_for_by_a_mac_when_on_and_by_windows_only_with_a_helper_for_it() {
        let card = |on, vulkan: Option<&str>| Card { on, vulkan: vulkan.map(PathBuf::from), name: None };
        assert_eq!(card(true, None).ask(), cfg!(target_os = "macos"), "no helper: Metal on the Mac, the processor elsewhere");
        assert_eq!(card(true, Some("/app/ensayo-llm-vulkan.exe")).ask(), true, "a card helper to ask");
        assert!(!card(false, Some("/app/ensayo-llm-vulkan.exe")).ask() && !card(false, None).ask(), "off is off");
    }

    #[test]
    fn a_failed_card_is_remembered_per_app_version_and_card() {
        let named = Card { on: true, vulkan: None, name: Some("NVIDIA GeForce RTX 4060".into()) };
        assert_eq!(named.key(), format!("{}-NVIDIA GeForce RTX 4060", env!("CARGO_PKG_VERSION")));
        assert_eq!(NO_CARD.key(), format!("{}-none", env!("CARGO_PKG_VERSION")));
    }

    #[test]
    fn the_client_is_built_with_the_card_helper_and_the_failure_file() {
        let _s = serial();
        let exe = Path::new("/nonexistent/ensayo-llm");
        let card = Card { on: true, vulkan: Some(PathBuf::from("/nonexistent/ensayo-llm-vulkan")), name: Some("RTX".into()) };
        let ai = shared_with(exe, Path::new("/m.gguf"), "m", &card, false);
        assert_eq!(ai.gpu, card.ask());
        stop_shared();
        assert!(failures_file().ends_with("gpu-failures.json"));
    }

    #[test]
    fn the_card_helper_is_the_one_beside_the_app_on_windows_and_nothing_when_it_is_missing() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join(format!("Ensayo{}", std::env::consts::EXE_SUFFIX));
        assert_eq!(vulkan_helper_from(&exe), None, "missing: the processor helper");
        let file = dir.path().join(format!("{VULKAN_HELPER}{}", std::env::consts::EXE_SUFFIX));
        std::fs::write(&file, b"").unwrap();
        assert_eq!(vulkan_helper_from(&exe), if cfg!(windows) { Some(file) } else { None }, "only Windows has one");
    }

    fn install(store: &voice_engine_models::SharedStore, id: &str) {
        for f in voice_engine_models::catalog::find(id).unwrap().files {
            let path = store.model_dir(id).join(f.name);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::File::create(path).unwrap().set_len(f.size).unwrap();
        }
    }

    /// Holds the model the way `hold_model` does, but in a store of the test's own.
    fn hold_in(store: &voice_engine_models::SharedStore, id: &str, now: Instant) {
        held().with(id, now, || store.hold(id).map_err(|e| hold_text(&e)), |_| ()).unwrap();
    }

    #[test]
    fn the_model_is_held_while_the_helper_has_it_and_let_go_on_unload_stop_idle_and_delete() {
        let _s = serial();
        use voice_engine_models::{App, Released, SharedStore};
        let dir = tempfile::tempdir().unwrap();
        let store = SharedStore::open_at(App::Ensayo, dir.path().to_path_buf()).unwrap();
        let id = "granite-4.2-3b";
        install(&store, id);
        store.use_model(id).unwrap();
        let erasable = |store: &SharedStore| {
            let r = store.release(id).unwrap();
            if r != Released::Erased {
                store.use_model(id).unwrap();
            }
            r == Released::Erased
        };
        // Held: another app (or this one's Delete) can't erase it.
        let t0 = Instant::now();
        hold_in(&store, id, t0);
        assert!(!erasable(&store), "held while loaded");
        // Unload (also what Delete does first) lets go.
        unload_shared();
        assert!(held().peek().is_none());
        hold_in(&store, id, t0);
        stop_shared();
        assert!(held().peek().is_none(), "stopping the helper lets go");
        // Idle: kept for the helper's idle time and not past it, and never while an answer runs.
        hold_in(&store, id, t0);
        idle_release(&mut held(), t0 + Duration::from_secs(IDLE_SECS + 30), 1);
        assert!(held().peek().is_some(), "an answer is running");
        idle_release(&mut held(), t0 + Duration::from_secs(IDLE_SECS - 1), 0);
        assert!(held().peek().is_some(), "not idle long enough");
        idle_release(&mut held(), t0 + Duration::from_secs(IDLE_SECS + 1), 0);
        assert!(held().peek().is_none(), "idle: the helper has let the model go");
        assert!(erasable(&store), "and now it can be erased");
    }

    #[test]
    fn a_model_that_is_not_on_this_computer_is_unavailable_not_failed() {
        let _s = serial();
        let dir = tempfile::tempdir().unwrap();
        let store = voice_engine_models::SharedStore::open_at(voice_engine_models::App::Ensayo, dir.path().to_path_buf()).unwrap();
        let text = held().with("qwen3.5-4b", Instant::now(), || store.hold("qwen3.5-4b").map_err(|e| hold_text(&e)), |_| ()).unwrap_err();
        assert!(matches!(hold_error(text), AiError::Unavailable(m) if m == NOT_DOWNLOADED));
        assert!(held().peek().is_none());
    }

    #[test]
    fn the_shared_client_is_reused_for_the_same_helper_and_replaced_for_another() {
        let _s = serial();
        let exe = Path::new("/nonexistent/ensayo-llm");
        let a = shared_in_test(exe, "/models/a.gguf", "a");
        let a2 = shared_in_test(exe, "/models/b.gguf", "b");
        assert!(Arc::ptr_eq(&a.client, &a2.client), "another model uses the same client");
        let b = shared_in_test(Path::new("/nonexistent/other-llm"), "/models/b.gguf", "b");
        assert!(!Arc::ptr_eq(&a.client, &b.client));
        stop_shared();
        let c = shared_in_test(Path::new("/nonexistent/other-llm"), "/models/b.gguf", "b");
        assert!(!Arc::ptr_eq(&b.client, &c.client), "stopping forgets the old one");
        stop_shared();
    }

    #[test]
    fn unloading_with_no_helper_running_does_nothing_and_starts_none() {
        let _s = serial();
        stop_shared();
        unload_shared();
        let a = shared_in_test(Path::new("/nonexistent/ensayo-llm"), "/models/a.gguf", "a");
        unload_shared();
        drop(a);
        stop_shared();
    }

    /// Real model through the real helper. Build the helper first (`sh scripts/build-llm-helper.sh`), then
    /// `ENSAYO_LLM_MODEL=<gguf> cargo test --release --manifest-path src-tauri/Cargo.toml local_ai_smoke -- --ignored --nocapture`
    /// Without ENSAYO_LLM_MODEL it uses the recommended model if it is in the shared models folder.
    #[test]
    #[ignore]
    fn local_ai_smoke() {
        use crate::ai::providers::Provider;
        use crate::scoring::prompts::{get, PromptId};
        use crate::scoring::run::{call_json, Budget};
        use crate::scoring::template::Vars;

        let model = std::env::var("ENSAYO_LLM_MODEL").map(PathBuf::from).unwrap_or_else(|_| {
            let m = super::super::local_models::recommended();
            let status = crate::models_store::store().unwrap().status(m.info.id);
            m.file_in(&status).expect("set ENSAYO_LLM_MODEL, or download the local AI model first")
        });
        let exe = helper_path();
        eprintln!("helper: {} exists={}\nmodel: {}", exe.display(), exe.exists(), model.display());
        let ai = shared_with(&exe, &model, "smoke", &Card::now(), false);
        let t = std::time::Instant::now();
        let mut budget = Budget::new(Provider::Compatible, 0.0);
        let vars = Vars::new().set("question", "Have you done a behavioral implementation in Braze?");
        let called = call_json(&ai, get(PromptId::Classify), &vars, 400, &mut budget).expect("the model returned a valid classification");
        eprintln!("{} ({:.1}s, {} in / {} out tokens)", called.value, t.elapsed().as_secs_f32(), budget.spend.input_tokens, budget.spend.output_tokens);
        assert!(called.value["type"].is_string());
        assert_eq!(budget.spend.usd, 0.0, "local use is free");
        // The second call reuses the loaded model: no load wait.
        let t = std::time::Instant::now();
        call_json(&ai, get(PromptId::Classify), &vars, 400, &mut budget).unwrap();
        eprintln!("second call {:.1}s", t.elapsed().as_secs_f32());
        stop_shared();
    }
}
