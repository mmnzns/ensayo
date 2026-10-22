//! The built-in local AI as an `Llm`: the app's side of the `ensayo-llm` helper. Starts the helper when the first
//! answer needs it, sends one request at a time, and turns a crash, an out-of-memory or a hang into a plain error
//! instead of taking Ensayo down (saying "out of memory" only when that is what happened). The model stays loaded
//! between answers; the helper exits by itself after two idle minutes and whenever Ensayo closes (its stdin closes),
//! and `stop_shared` ends it at once. Adapted from Talaan's `summarizer/local.rs` (Miguel's own MIT code), processor
//! and Metal only.
//!
//! Fast and Strong tasks run on the same loaded model (one model in memory). `json: true` constrains the reply to a
//! JSON object with llama.cpp's grammar, so it always parses; the prompt still carries the schema the keys must follow.

use super::helper::{Death, Process};
use super::llm::{Llm, LlmReply, LlmRequest};
use super::providers::AiError;
use ensayo_llm_protocol::{Completion, Event, Reply, Request, JSON_OBJECT_SCHEMA};
use std::path::{Path, PathBuf};
use std::sync::mpsc::RecvTimeoutError;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub const HELPER: &str = "ensayo-llm";
const WHO: &str = "local AI helper";

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

/// How long the helper may take, so nothing waits forever.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Limits {
    /// To start and say it is ready. Generous: the first launch after an install waits on the system checking the file.
    pub start: Duration,
    /// Without a word from it (progress counts) for this long, it is stuck. Loading a 9B model from a slow disk and
    /// reading one batch of the prompt each take well under it.
    pub stall: Duration,
    /// One whole answer.
    pub total: Duration,
}

impl Default for Limits {
    fn default() -> Self {
        Limits { start: Duration::from_secs(60), stall: Duration::from_secs(120), total: Duration::from_secs(10 * 60) }
    }
}

/// How a request ended, before it becomes words for the user.
enum RunError {
    /// The helper answered with an error (a prompt too long, a model that won't load). It is still fine.
    Said(String),
    /// Couldn't start it at all: the file is missing or blocked.
    NoSpawn(String),
    /// It started but never said it was ready (`Death` when it died doing so).
    NoStart(Option<Death>),
    /// Over the total time limit.
    TooSlow,
    /// No word for longer than the stall limit.
    Stalled,
    Died(Death),
    Io(String),
}

struct Inner {
    running: Option<Process<Event>>,
    /// Why the helper last stopped unexpectedly (exit status and its error lines), for debugging. Never shown as the
    /// message, never answer text.
    last_detail: Option<String>,
}

pub struct LocalLlm {
    exe: PathBuf,
    model_path: PathBuf,
    /// The catalog id, reported as the model that answered.
    model_name: String,
    limits: Limits,
    inner: Mutex<Inner>,
}

impl LocalLlm {
    pub fn new(exe: &Path, model_path: &Path, model_name: &str) -> Self {
        Self::with_limits(exe, model_path, model_name, Limits::default())
    }

    pub fn with_limits(exe: &Path, model_path: &Path, model_name: &str, limits: Limits) -> Self {
        LocalLlm { exe: exe.to_path_buf(), model_path: model_path.to_path_buf(), model_name: model_name.to_string(), limits, inner: Mutex::new(Inner { running: None, last_detail: None }) }
    }

    /// Why the helper last stopped unexpectedly (taken, so it is reported once).
    pub fn take_detail(&self) -> Option<String> {
        self.lock().last_detail.take()
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Ends the helper now, which frees all of the model's memory. Does nothing while an answer is being made (that
    /// ends with the app, or on its own).
    pub fn stop(&self) {
        if let Ok(mut inner) = self.inner.try_lock() {
            if let Some(p) = inner.running.take() {
                p.kill();
            }
        }
    }

    fn run_once(&self, inner: &mut Inner, req: &Request) -> Result<Reply, RunError> {
        for attempt in 0..2 {
            let reused = start(&mut inner.running, &self.exe, self.limits.start)?;
            let mut p = inner.running.take().expect("started");
            let mut heard = false;
            match run(&mut p, req, &self.limits, &mut heard) {
                Ok(r) => {
                    inner.running = Some(p);
                    return Ok(r);
                }
                // The helper is still fine after reporting an error (a prompt too long, a bad schema).
                Err(RunError::Said(m)) => {
                    inner.running = Some(p);
                    return Err(RunError::Said(m));
                }
                // A helper that left on its own after its idle time, just as this request arrived: it never heard the
                // request, so start a fresh one and send it again (once, and never after it ran out of memory).
                Err(e @ (RunError::Died(_) | RunError::Io(_))) if reused && !heard && attempt == 0 => match finish(e, p) {
                    RunError::Died(d) if d.out_of_memory => return Err(RunError::Died(d)),
                    _ => continue,
                },
                Err(e) => return Err(finish(e, p)),
            }
        }
        unreachable!("the second attempt always returns")
    }

    /// Words for the user (and `last_detail` for the log).
    fn message(&self, inner: &mut Inner, e: RunError) -> AiError {
        match e {
            RunError::Said(m) | RunError::Io(m) => AiError::Failed(m),
            RunError::NoSpawn(why) => {
                log::warn!("couldn't start the local AI helper: {why}");
                AiError::Unavailable("Ensayo couldn't start the built-in local AI because its helper program is missing or was blocked. Reinstall Ensayo, or choose another feedback engine in Settings › AI.".into())
            }
            RunError::NoStart(death) => {
                let oom = death.as_ref().is_some_and(|d| d.out_of_memory);
                inner.last_detail = death.map(|d| d.detail);
                AiError::Failed(if oom { OUT_OF_MEMORY } else { NO_START }.into())
            }
            RunError::TooSlow | RunError::Stalled => AiError::Failed(TOO_SLOW.into()),
            RunError::Died(d) => {
                let oom = d.out_of_memory;
                inner.last_detail = Some(d.detail);
                AiError::Failed(if oom { OUT_OF_MEMORY } else { CRASHED }.into())
            }
        }
    }
}

const OUT_OF_MEMORY: &str = "The built-in local AI ran out of memory. Close some other apps and try again, or choose a smaller model or another feedback engine in Settings › AI.";
const CRASHED: &str = "The built-in local AI stopped unexpectedly. Try again, or choose another feedback engine in Settings › AI.";
const NO_START: &str = "The built-in local AI didn't start. Try again, or choose another feedback engine in Settings › AI.";
const TOO_SLOW: &str = "The built-in local AI took too long, so Ensayo stopped it. Try again, or choose another feedback engine in Settings › AI.";

impl Llm for LocalLlm {
    fn complete(&self, req: &LlmRequest) -> Result<LlmReply, AiError> {
        // Fast and Strong share the one loaded model.
        let c = Completion {
            model_path: self.model_path.to_string_lossy().into_owned(),
            n_ctx: CONTEXT,
            system: req.system.clone(),
            user: req.user.clone(),
            json_schema: req.json.then(|| JSON_OBJECT_SCHEMA.to_string()),
            max_tokens: req.max_tokens,
            temperature: TEMPERATURE,
        };
        let mut inner = self.lock();
        inner.last_detail = None;
        let reply = match self.run_once(&mut inner, &Request::Complete(c)) {
            Ok(r) => r,
            Err(e) => return Err(self.message(&mut inner, e)),
        };
        if reply.text.trim().is_empty() {
            return Err(AiError::Failed(if reply.truncated { "The built-in local AI ran out of room before it finished answering." } else { "The built-in local AI sent back an empty answer." }.into()));
        }
        Ok(LlmReply { text: reply.text, input_tokens: reply.prompt_tokens, output_tokens: reply.output_tokens, model: self.model_name.clone() })
    }
}

impl Drop for LocalLlm {
    fn drop(&mut self) {
        let inner = self.inner.get_mut().unwrap_or_else(|e| e.into_inner());
        if let Some(p) = inner.running.take() {
            p.kill();
        }
    }
}

/// Starts the helper in `slot` unless it is still running. True when it already was (a reused process).
fn start(slot: &mut Option<Process<Event>>, exe: &Path, wait: Duration) -> Result<bool, RunError> {
    if slot.as_mut().is_some_and(|p| p.alive()) {
        return Ok(true);
    }
    if let Some(p) = slot.take() {
        p.kill();
    }
    let mut p = Process::<Event>::spawn(exe, &[]).map_err(|e| RunError::NoSpawn(format!("{}: {e}", exe.display())))?;
    if let Err(e) = p.send(&Request::Ping) {
        p.kill();
        return Err(RunError::Io(format!("Ensayo couldn't talk to the built-in local AI: {e}")));
    }
    match p.recv_timeout(wait) {
        Ok(Event::Ready { backend }) => {
            log::info!("local AI helper started on {}", if backend.backend.is_empty() { "an unknown backend" } else { &backend.backend });
            *slot = Some(p);
            Ok(false)
        }
        Ok(Event::Error { message }) => {
            p.kill();
            Err(RunError::Said(message))
        }
        Err(RecvTimeoutError::Disconnected) => Err(RunError::NoStart(Some(p.died(WHO)))),
        _ => {
            p.kill();
            Err(RunError::NoStart(None))
        }
    }
}

/// Sends `req` and waits for the reply, watching the clock. `heard` says whether the helper sent anything back.
fn run(p: &mut Process<Event>, req: &Request, limits: &Limits, heard: &mut bool) -> Result<Reply, RunError> {
    p.send(req).map_err(|e| RunError::Io(format!("Ensayo couldn't talk to the built-in local AI: {e}")))?;
    let started = Instant::now();
    let mut last_word = Instant::now();
    loop {
        match p.recv_timeout(Duration::from_millis(100).min(limits.stall)) {
            Ok(Event::Error { message }) => {
                *heard = true;
                return Err(RunError::Said(message));
            }
            Ok(Event::Done(r)) => {
                *heard = true;
                return Ok(r);
            }
            // Loading, reading and writing progress: not shown, but it proves the helper is alive.
            Ok(Event::Progress { .. }) | Ok(Event::Ready { .. }) => {
                *heard = true;
                last_word = Instant::now();
                if started.elapsed() > limits.total {
                    return Err(RunError::TooSlow);
                }
            }
            Err(RecvTimeoutError::Timeout) => {
                if started.elapsed() > limits.total {
                    return Err(RunError::TooSlow);
                }
                if last_word.elapsed() > limits.stall {
                    return Err(RunError::Stalled);
                }
            }
            Err(RecvTimeoutError::Disconnected) => return Err(RunError::Died(Death { detail: String::new(), out_of_memory: false })),
        }
    }
}

/// After a failed request: a helper that died is described, any other is stopped.
fn finish(e: RunError, p: Process<Event>) -> RunError {
    match e {
        RunError::Died(_) => RunError::Died(p.died(WHO)),
        e => {
            p.kill();
            e
        }
    }
}

// ---------- the one shared helper ----------

/// The helper and its loaded model are shared by every answer, so a second answer does not load the model again.
static SHARED: Mutex<Option<Arc<LocalLlm>>> = Mutex::new(None);

/// A cheap handle on the shared `LocalLlm`.
pub struct Shared(Arc<LocalLlm>);

impl Llm for Shared {
    fn complete(&self, req: &LlmRequest) -> Result<LlmReply, AiError> {
        self.0.complete(req)
    }
}

/// The shared `LocalLlm` for this helper and model. Asking for another model replaces it (the old helper is ended
/// once nothing is using it).
pub fn shared(exe: &Path, model_path: &Path, model_name: &str) -> Shared {
    let mut slot = SHARED.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(existing) = slot.as_ref().filter(|l| l.exe == exe && l.model_path == model_path) {
        return Shared(existing.clone());
    }
    let fresh = Arc::new(LocalLlm::new(exe, model_path, model_name));
    *slot = Some(fresh.clone());
    Shared(fresh)
}

/// Ends the shared helper now (the app is closing, the engine was switched, or the models are being deleted).
pub fn stop_shared() {
    let taken = SHARED.lock().unwrap_or_else(|e| e.into_inner()).take();
    if let Some(l) = taken {
        l.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::helper::fake::{crash, reply, script};
    use crate::ai::llm::Tier;

    const READY: &str = r#"{"event":"ready","backend":"cpu"}"#;
    const DONE: &str = r#"{"event":"done","text":"TEXT","prompt_tokens":120,"output_tokens":7,"seconds":0.1,"truncated":false}"#;
    const NO_TEXT: &str = r#"{"event":"done","text":"","prompt_tokens":1,"output_tokens":0,"seconds":0.1,"truncated":true}"#;

    fn done(text: &str) -> String {
        DONE.replace("TEXT", text)
    }

    fn request(json: bool, tier: Tier) -> LlmRequest {
        LlmRequest { system: "Be brief.".into(), user: "Classify this question.".into(), json, max_tokens: 200, tier }
    }

    fn fast() -> LlmRequest {
        request(true, Tier::Fast)
    }

    fn llm(exe: &Path) -> LocalLlm {
        LocalLlm::new(exe, Path::new("/models/qwen.gguf"), "qwen3.5-4b")
    }

    fn quick(exe: &Path) -> LocalLlm {
        LocalLlm::with_limits(exe, Path::new("/models/qwen.gguf"), "qwen3.5-4b", Limits { start: Duration::from_secs(10), stall: Duration::from_millis(500), total: Duration::from_secs(20) })
    }

    fn text_of(e: AiError) -> String {
        match e {
            AiError::Unavailable(m) | AiError::Failed(m) => m,
        }
    }

    /// A fake helper: answers the ping, then on the first real request prints `stderr` lines and exits with `code`.
    fn crashing(dir: &Path, stderr: &[&str], code: i32) -> PathBuf {
        script(dir, "fake-llm", &[reply(&[READY]), crash(stderr, code)])
    }

    #[test]
    fn a_missing_helper_is_one_plain_unavailable_message() {
        let e = llm(Path::new("/nonexistent/ensayo-llm")).complete(&fast()).unwrap_err();
        assert!(matches!(e, AiError::Unavailable(_)), "{e:?}");
        let m = text_of(e);
        assert!(m.contains("helper program is missing") && m.contains("Settings"), "{m}");
        assert!(!m.contains("nonexistent"), "no file paths for the user: {m}");
    }

    #[test]
    fn a_reply_comes_back_with_its_token_counts_and_the_model_name_and_the_helper_is_reused() {
        let dir = tempfile::tempdir().unwrap();
        let (a, b) = (done("first"), done("second"));
        // One ready, then two answers: a second process would answer the ping with a done and hang the test.
        let exe = script(dir.path(), "h", &[reply(&[READY]), reply(&[&a]), reply(&[&b])]);
        let ai = quick(&exe);
        let r = ai.complete(&fast()).unwrap();
        assert_eq!((r.text.as_str(), r.input_tokens, r.output_tokens, r.model.as_str()), ("first", 120, 7, "qwen3.5-4b"));
        assert_eq!(ai.complete(&request(false, Tier::Strong)).unwrap().text, "second");
    }

    #[test]
    fn an_empty_answer_is_an_error_not_a_blank_note() {
        let dir = tempfile::tempdir().unwrap();
        let exe = script(dir.path(), "h", &[reply(&[READY]), reply(&[NO_TEXT])]);
        let m = text_of(quick(&exe).complete(&fast()).unwrap_err());
        assert!(m.contains("ran out of room"), "{m}");
    }

    /// A helper that dies mid-request becomes a readable error, and it doesn't blame memory without a reason.
    #[test]
    fn a_crashing_helper_is_reported_not_fatal() {
        let dir = tempfile::tempdir().unwrap();
        let ai = quick(&crashing(dir.path(), &["thread 'main' panicked at llm/src/main.rs:10:5:", "I led the Braze migration at my last job"], 1));
        let e = ai.complete(&fast()).unwrap_err();
        assert!(matches!(e, AiError::Failed(_)), "{e:?}");
        let m = text_of(e);
        assert!(m.contains("stopped unexpectedly") && m.contains("Settings"), "{m}");
        assert!(!m.contains("memory"), "{m}");
        let detail = ai.take_detail().unwrap();
        assert!(detail.contains("exit code 1") && detail.contains("panicked at llm/src/main.rs:10:5"), "{detail}");
        // Lines that aren't error markers (which could be the user's answer) are never kept.
        assert!(!detail.contains("Braze"), "{detail}");
        assert_eq!(ai.take_detail(), None, "reported once");
    }

    #[test]
    fn a_helper_that_ran_out_of_memory_says_so() {
        let dir = tempfile::tempdir().unwrap();
        let ai = quick(&crashing(dir.path(), &["memory allocation of 8589934592 bytes failed"], 3));
        let m = text_of(ai.complete(&fast()).unwrap_err());
        assert!(m.contains("ran out of memory"), "{m}");
        assert!(ai.take_detail().unwrap().contains("memory allocation of 8589934592 bytes failed"));
    }

    #[test]
    fn a_helper_that_dies_before_it_is_ready_is_a_plain_error_too() {
        let dir = tempfile::tempdir().unwrap();
        let exe = script(dir.path(), "h", &[crash(&["ggml_backend: failed to allocate buffer"], 3)]);
        let m = text_of(quick(&exe).complete(&fast()).unwrap_err());
        assert!(m.contains("ran out of memory"), "{m}");
        let exe = script(dir.path(), "h2", &[crash(&[], 1)]);
        let m = text_of(quick(&exe).complete(&fast()).unwrap_err());
        assert!(m.contains("didn't start"), "{m}");
    }

    #[test]
    fn a_helper_that_never_answers_is_stopped_after_the_stall_limit() {
        let dir = tempfile::tempdir().unwrap();
        // Ready, then silence on the request.
        let exe = script(dir.path(), "h", &[reply(&[READY])]);
        let ai = quick(&exe);
        let t = Instant::now();
        let m = text_of(ai.complete(&fast()).unwrap_err());
        assert!(m.contains("took too long"), "{m}");
        assert!(t.elapsed() < Duration::from_secs(15), "gave up after the short stall, not the real one");
        assert!(ai.lock().running.is_none(), "the stuck helper was ended");
    }

    #[test]
    fn a_helper_that_never_says_it_is_ready_is_given_up_on() {
        let dir = tempfile::tempdir().unwrap();
        let exe = script(dir.path(), "h", &[]);
        let ai = LocalLlm::with_limits(&exe, Path::new("/m.gguf"), "m", Limits { start: Duration::from_millis(400), stall: Duration::from_millis(400), total: Duration::from_secs(5) });
        let m = text_of(ai.complete(&fast()).unwrap_err());
        assert!(m.contains("didn't start"), "{m}");
    }

    #[test]
    fn an_error_the_helper_reports_keeps_it_running_for_the_next_answer() {
        let dir = tempfile::tempdir().unwrap();
        let err = r#"{"event":"error","message":"The text is too long for the built-in local AI (20000 tokens, room for 15000)."}"#;
        let ok = done("fine");
        let exe = script(dir.path(), "h", &[reply(&[READY]), reply(&[err]), reply(&[&ok])]);
        let ai = quick(&exe);
        let m = text_of(ai.complete(&fast()).unwrap_err());
        assert!(m.contains("too long"), "{m}");
        assert_eq!(ai.complete(&fast()).unwrap().text, "fine");
    }

    /// Unix-only fakes: shell scripts that need state (a log, a counter) the plain fake cannot keep.
    #[cfg(unix)]
    mod sh {
        use super::*;
        use std::os::unix::fs::PermissionsExt;

        fn write(dir: &Path, name: &str, body: &str) -> PathBuf {
            let path = dir.join(name);
            std::fs::write(&path, format!("#!/bin/sh\n{body}")).unwrap();
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
            path
        }

        #[test]
        fn json_mode_uses_the_json_grammar_and_both_tiers_use_the_same_model() {
            let dir = tempfile::tempdir().unwrap();
            let log = dir.path().join("requests.log");
            let ok = done("ok");
            let body = format!(
                "read line; echo '{READY}'\nwhile read -r line; do printf '%s\\n' \"$line\" >> '{}'; echo '{ok}'; done\n",
                log.display()
            );
            let exe = write(dir.path(), "h", &body);
            let ai = quick(&exe);
            ai.complete(&request(true, Tier::Fast)).unwrap();
            ai.complete(&request(false, Tier::Strong)).unwrap();
            let lines: Vec<serde_json::Value> = std::fs::read_to_string(&log).unwrap().lines().map(|l| serde_json::from_str(l).unwrap()).collect();
            assert_eq!(lines.len(), 2);
            for l in &lines {
                assert_eq!(l["op"], "complete");
                assert_eq!(l["model_path"], "/models/qwen.gguf");
                assert_eq!(l["n_ctx"], CONTEXT);
                assert_eq!(l["max_tokens"], 200);
                assert_eq!(l["system"], "Be brief.");
            }
            assert_eq!(lines[0]["json_schema"], JSON_OBJECT_SCHEMA, "json: true constrains the reply to a JSON object");
            assert!(lines[1].get("json_schema").is_none(), "json: false leaves the reply free");
        }

        #[test]
        fn a_helper_that_left_when_idle_is_started_again_and_the_request_still_works() {
            let dir = tempfile::tempdir().unwrap();
            let counter = dir.path().join("runs");
            let ok = done("again");
            // Run 1: ready, one answer, then exits (its idle exit). Run 2: ready, answers.
            let body = format!(
                "echo x >> '{c}'\nread line; echo '{READY}'\nread line; echo '{ok}'\nif [ \"$(wc -l < '{c}' | tr -d ' ')\" -le 1 ]; then exit 0; fi\nwhile read line; do echo '{ok}'; done\n",
                c = counter.display()
            );
            let exe = write(dir.path(), "h", &body);
            let ai = quick(&exe);
            assert_eq!(ai.complete(&fast()).unwrap().text, "again");
            std::thread::sleep(Duration::from_millis(300)); // it has gone
            assert_eq!(ai.complete(&fast()).unwrap().text, "again");
            assert_eq!(std::fs::read_to_string(&counter).unwrap().lines().count(), 2, "started twice");
        }

        #[test]
        fn a_crash_on_a_reused_helper_is_still_reported_after_one_fresh_start() {
            let dir = tempfile::tempdir().unwrap();
            let counter = dir.path().join("runs");
            let ok = done("one");
            // The first start answers once. Every request after that, in this start and in the fresh one that is
            // tried when the old helper vanishes, crashes.
            let body = format!(
                "echo x >> '{c}'\nread line; echo '{READY}'\nread line\nif [ \"$(wc -l < '{c}' | tr -d ' ')\" -le 1 ]; then echo '{ok}'; read line; fi\necho 'ggml_backend: boom' 1>&2; exit 2\n",
                c = counter.display()
            );
            let exe = write(dir.path(), "h", &body);
            let ai = quick(&exe);
            assert_eq!(ai.complete(&fast()).unwrap().text, "one");
            let m = text_of(ai.complete(&fast()).unwrap_err());
            assert!(m.contains("stopped unexpectedly"), "{m}");
            assert_eq!(std::fs::read_to_string(&counter).unwrap().lines().count(), 2, "one fresh start, not more");
        }

        #[test]
        fn a_helper_that_keeps_talking_but_never_finishes_hits_the_total_limit() {
            let dir = tempfile::tempdir().unwrap();
            let progress = r#"{"event":"progress","phase":"writing","done":1,"total":0}"#;
            let body = format!("read line; echo '{READY}'\nread line\nwhile true; do echo '{progress}'; sleep 0.05; done\n");
            let exe = write(dir.path(), "h", &body);
            let ai = LocalLlm::with_limits(&exe, Path::new("/m.gguf"), "m", Limits { start: Duration::from_secs(10), stall: Duration::from_secs(5), total: Duration::from_millis(600) });
            let t = Instant::now();
            let m = text_of(ai.complete(&fast()).unwrap_err());
            assert!(m.contains("took too long"), "{m}");
            assert!(t.elapsed() < Duration::from_secs(10));
        }

        fn alive(pid: &str) -> bool {
            std::process::Command::new("kill").args(["-0", pid]).stderr(std::process::Stdio::null()).status().map(|s| s.success()).unwrap_or(false)
        }

        fn wait_gone(pid: &str) -> bool {
            for _ in 0..100 {
                if !alive(pid) {
                    return true;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            false
        }

        #[test]
        fn the_helper_is_ended_when_the_llm_is_dropped_or_stopped() {
            let dir = tempfile::tempdir().unwrap();
            let pidfile = dir.path().join("pid");
            let ok = done("x");
            let body = format!("echo $$ > '{}'\nread line; echo '{READY}'\nwhile read line; do echo '{ok}'; done\n", pidfile.display());
            let exe = write(dir.path(), "h", &body);

            let ai = quick(&exe);
            ai.complete(&fast()).unwrap();
            let pid = std::fs::read_to_string(&pidfile).unwrap().trim().to_string();
            assert!(alive(&pid));
            drop(ai);
            assert!(wait_gone(&pid), "dropping ends the helper");

            let ai = quick(&exe);
            ai.complete(&fast()).unwrap();
            let pid = std::fs::read_to_string(&pidfile).unwrap().trim().to_string();
            assert!(alive(&pid));
            ai.stop();
            assert!(wait_gone(&pid), "stop ends the helper");
            assert_eq!(ai.complete(&fast()).unwrap().text, "x", "and the next answer starts a new one");
        }
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
    fn the_shared_helper_is_reused_for_the_same_model_and_replaced_for_another() {
        let exe = Path::new("/nonexistent/ensayo-llm");
        let a = shared(exe, Path::new("/models/a.gguf"), "a");
        let a2 = shared(exe, Path::new("/models/a.gguf"), "a");
        assert!(Arc::ptr_eq(&a.0, &a2.0));
        let b = shared(exe, Path::new("/models/b.gguf"), "b");
        assert!(!Arc::ptr_eq(&a.0, &b.0));
        stop_shared();
        let c = shared(exe, Path::new("/models/b.gguf"), "b");
        assert!(!Arc::ptr_eq(&b.0, &c.0), "stopping forgets the old one");
        stop_shared();
    }

    /// Real model through the real helper. Build the helper first (`sh scripts/build-llm-helper.sh`), then
    /// `ENSAYO_LLM_MODEL=<gguf> cargo test --release --manifest-path src-tauri/Cargo.toml local_ai_smoke -- --ignored --nocapture`
    /// Without ENSAYO_LLM_MODEL it uses the recommended model if it is downloaded, or Talaan's copy of it.
    #[test]
    #[ignore]
    fn local_ai_smoke() {
        use crate::ai::providers::Provider;
        use crate::scoring::prompts::{get, PromptId};
        use crate::scoring::run::{call_json, Budget};
        use crate::scoring::template::Vars;

        let model = std::env::var("ENSAYO_LLM_MODEL").map(PathBuf::from).unwrap_or_else(|_| {
            let m = super::super::local_models::recommended();
            let loc = super::super::local_models::store().locate(&m.info);
            m.file_in(&loc).expect("set ENSAYO_LLM_MODEL, or download the local AI model first")
        });
        let exe = helper_path();
        eprintln!("helper: {} exists={}\nmodel: {}", exe.display(), exe.exists(), model.display());
        let ai = LocalLlm::new(&exe, &model, "smoke");
        let t = Instant::now();
        let mut budget = Budget::new(Provider::Compatible, 0.0);
        let vars = Vars::new().set("question", "Have you done a behavioral implementation in Braze?");
        let called = call_json(&ai, get(PromptId::Classify), &vars, 400, &mut budget).expect("the model returned a valid classification");
        eprintln!("{} ({:.1}s, {} in / {} out tokens)", called.value, t.elapsed().as_secs_f32(), budget.spend.input_tokens, budget.spend.output_tokens);
        assert!(called.value["type"].is_string());
        assert_eq!(budget.spend.usd, 0.0, "local use is free");
        // The second call reuses the loaded model: no load wait.
        let t = Instant::now();
        call_json(&ai, get(PromptId::Classify), &vars, 400, &mut budget).unwrap();
        eprintln!("second call {:.1}s", t.elapsed().as_secs_f32());
    }
}
