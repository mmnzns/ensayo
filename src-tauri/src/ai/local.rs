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
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use voice_engine_client::{EngineError, Limits, LlmClient, LlmConfig};
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

/// Where the helper lives for an app binary at `exe`: next to it (in the app bundle, `Contents/MacOS/`; next to
/// `Ensayo.exe` on Windows; in `target/<profile>/` during development). `cargo test` runs from `target/<profile>/deps`,
/// so the folder above that is tried too.
pub fn helper_path_from(exe: &Path) -> PathBuf {
    let name = helper_file();
    let dir = exe.parent();
    let beside = dir.map(|d| d.join(&name));
    if let Some(b) = beside.as_ref().filter(|b| b.exists()) {
        return b.clone();
    }
    if let Some(up) = dir.filter(|d| d.file_name().is_some_and(|n| n == "deps")).and_then(|d| d.parent()) {
        let candidate = up.join(&name);
        if candidate.exists() {
            return candidate;
        }
    }
    beside.unwrap_or_else(|| PathBuf::from(name))
}

pub fn helper_path() -> PathBuf {
    std::env::current_exe().map(|e| helper_path_from(&e)).unwrap_or_else(|_| PathBuf::from(helper_file()))
}

/// How long one whole answer may take, so nothing waits forever. The engine's own limits for starting the helper (60 s:
/// the first launch after an install waits on the system checking the file) and for a stall (120 s without a word)
/// are kept.
const TOTAL: Duration = Duration::from_secs(10 * 60);

/// The helper exits by itself after this many idle seconds, freeing the model's memory.
const IDLE_SECS: u64 = 120;

/// Ask the helper for the graphics card: Metal on the Mac. (Windows has no graphics-card helper yet.)
const GPU: bool = cfg!(target_os = "macos");

fn new_client(exe: &Path) -> LlmClient {
    LlmClient::new(LlmConfig {
        cpu_helper: exe.to_path_buf(),
        gpu_helper: None,
        env: vec![],
        gpu_env: vec![],
        gpu_failures: None,
        gpu_key: String::new(),
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
        // Fast and Strong share the one loaded model.
        let c = Completion {
            model_path: self.model_path.to_string_lossy().into_owned(),
            n_ctx: CONTEXT,
            system: req.system.clone(),
            user: req.user.clone(),
            json_schema: req.json.then(|| JSON_OBJECT_SCHEMA.to_string()),
            max_tokens: req.max_tokens,
            temperature: TEMPERATURE,
            gpu: GPU,
            thinking: false,
            thinking_budget: None,
            seed: None,
        };
        let out = self.client.complete(c, &mut |_| {}).map_err(|e| {
            log::warn!("local AI: {e}");
            message(&e)
        })?;
        if out.fell_back {
            log::info!("local AI: the graphics card was not used, the processor answered");
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
/// load the model again.
static SHARED: Mutex<Option<(PathBuf, Arc<LlmClient>)>> = Mutex::new(None);

/// A handle that answers with `model_path` through the shared client for this helper. Another model replaces the
/// loaded one inside the helper; another helper path (never in practice) replaces the client.
pub fn shared(exe: &Path, model_path: &Path, model_name: &str) -> LocalLlm {
    let mut slot = SHARED.lock().unwrap_or_else(|e| e.into_inner());
    let client = match slot.as_ref().filter(|(path, _)| path == exe) {
        Some((_, client)) => client.clone(),
        None => {
            if let Some((_, old)) = slot.take() {
                old.shutdown();
            }
            let client = Arc::new(new_client(exe));
            *slot = Some((exe.to_path_buf(), client.clone()));
            client
        }
    };
    LocalLlm { client, exe: exe.to_path_buf(), model_path: model_path.to_path_buf(), model_name: model_name.to_string() }
}

/// Ends the shared helper now (the app is closing, the engine was switched, or the models are being deleted).
pub fn stop_shared() {
    let taken = SHARED.lock().unwrap_or_else(|e| e.into_inner()).take();
    if let Some((_, client)) = taken {
        client.shutdown();
    }
}

/// Frees the loaded model's memory and its file now, but keeps the helper for the next answer (a model is being deleted).
pub fn unload_shared() {
    let client = SHARED.lock().unwrap_or_else(|e| e.into_inner()).as_ref().map(|(_, c)| c.clone());
    if let Some(client) = client {
        if let Err(e) = client.unload() {
            log::warn!("local AI: could not unload the model: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::llm::Tier;

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
        let ai = shared(Path::new("/nonexistent/ensayo-llm"), Path::new("/models/qwen.gguf"), "qwen3.5-4b");
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
        let dir = tempfile::tempdir().unwrap();
        let exe = fake_helper(dir.path(), "first", false);
        let ai = LocalLlm { client: Arc::new(new_client(&exe)), exe: exe.clone(), model_path: PathBuf::from("/models/qwen.gguf"), model_name: "qwen3.5-4b".into() };
        let r = ai.complete(&request(true, Tier::Fast)).unwrap();
        assert_eq!((r.text.as_str(), r.input_tokens, r.output_tokens, r.model.as_str()), ("first", 120, 7, "qwen3.5-4b"));
        assert_eq!(ai.complete(&request(false, Tier::Strong)).unwrap().text, "first", "both tiers use the same helper");
        ai.client.shutdown();
    }

    #[cfg(unix)]
    #[test]
    fn an_empty_answer_is_an_error_not_a_blank_note() {
        let dir = tempfile::tempdir().unwrap();
        let exe = fake_helper(dir.path(), "", true);
        let ai = LocalLlm { client: Arc::new(new_client(&exe)), exe: exe.clone(), model_path: PathBuf::from("/models/qwen.gguf"), model_name: "qwen3.5-4b".into() };
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
    fn the_shared_client_is_reused_for_the_same_helper_and_replaced_for_another() {
        let exe = Path::new("/nonexistent/ensayo-llm");
        let a = shared(exe, Path::new("/models/a.gguf"), "a");
        let a2 = shared(exe, Path::new("/models/b.gguf"), "b");
        assert!(Arc::ptr_eq(&a.client, &a2.client), "another model uses the same client");
        let b = shared(Path::new("/nonexistent/other-llm"), Path::new("/models/b.gguf"), "b");
        assert!(!Arc::ptr_eq(&a.client, &b.client));
        stop_shared();
        let c = shared(Path::new("/nonexistent/other-llm"), Path::new("/models/b.gguf"), "b");
        assert!(!Arc::ptr_eq(&b.client, &c.client), "stopping forgets the old one");
        stop_shared();
    }

    #[test]
    fn unloading_with_no_helper_running_does_nothing_and_starts_none() {
        stop_shared();
        unload_shared();
        let a = shared(Path::new("/nonexistent/ensayo-llm"), Path::new("/models/a.gguf"), "a");
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
        let ai = shared(&exe, &model, "smoke");
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
