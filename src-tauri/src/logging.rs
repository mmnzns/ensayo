//! The log file. Ensayo's backend writes `log::` lines to `<app local>/logs/ensayo.log` (info and up), rotating at
//! 2 MB and keeping three files. The window's errors come in through `log_frontend`.
//!
//! What is never written: transcripts, story, resume or posting text, pitches, API keys, file contents, and the
//! user's name in a path. Callers log command names, timings, ids, counts, engine and model names and error
//! strings; every line also goes through `Redactor` as a last guard. The file is opened for each line (a few a
//! minute at most), so "Delete all Ensayo data" can remove the folder on Windows, and `close_and_remove` stops
//! anything from writing it back for the rest of the run.

use crate::ai::llm::{Llm, LlmReply, LlmRequest, Tier};
use crate::ai::providers::AiError;
use crate::paths;
use crate::redact::{truncate, Redactor};
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub const LOG_NAME: &str = "ensayo.log";
pub const MAX_BYTES: u64 = 2 * 1024 * 1024;
pub const KEEP_FILES: usize = 3;
/// The most a message from the window may carry (message and stack together).
pub const FRONTEND_MAX_BYTES: usize = 2048;
/// An error string from a provider or a command, cut to this many bytes in the log.
const ERROR_MAX_BYTES: usize = 300;

struct State {
    dir: PathBuf,
    max: u64,
    keep: usize,
    closed: bool,
}

/// A rotating log file in one folder: `ensayo.log`, `ensayo.1.log`, `ensayo.2.log` (newest first).
pub struct Sink {
    state: Mutex<State>,
    redactor: Redactor,
}

fn file_name(i: usize) -> String {
    if i == 0 { LOG_NAME.to_string() } else { format!("ensayo.{i}.log") }
}

impl Sink {
    pub fn new(dir: PathBuf, max: u64, keep: usize, redactor: Redactor) -> Sink {
        Sink { state: Mutex::new(State { dir, max, keep: keep.max(1), closed: false }), redactor }
    }

    fn state(&self) -> std::sync::MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Adds one line (redacted, on one line). Failing to log never fails the app.
    pub fn write_line(&self, line: &str) {
        let line = self.redactor.apply(line).replace(['\r', '\n'], " | ");
        let st = self.state();
        if st.closed {
            return;
        }
        let _ = write_rotating(&st, &line);
    }

    /// Stops writing for the rest of this run and deletes the folder (Delete all Ensayo data).
    pub fn close_and_remove(&self) -> io::Result<()> {
        let mut st = self.state();
        st.closed = true;
        match fs::remove_dir_all(&st.dir) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e),
        }
    }

    pub fn dir(&self) -> PathBuf {
        self.state().dir.clone()
    }
}

fn write_rotating(st: &State, line: &str) -> io::Result<()> {
    fs::create_dir_all(&st.dir)?;
    let current = st.dir.join(file_name(0));
    let size = fs::metadata(&current).map(|m| m.len()).unwrap_or(0);
    if size > 0 && size + line.len() as u64 + 1 > st.max {
        rotate(&st.dir, st.keep)?;
    }
    let mut f = OpenOptions::new().create(true).append(true).open(&current)?;
    writeln!(f, "{line}")
}

/// Shifts every file one place older and drops the oldest, so at most `keep` files exist.
fn rotate(dir: &Path, keep: usize) -> io::Result<()> {
    let oldest = dir.join(file_name(keep - 1));
    if oldest.exists() {
        fs::remove_file(&oldest)?;
    }
    for i in (0..keep.saturating_sub(1)).rev() {
        let from = dir.join(file_name(i));
        if from.exists() {
            fs::rename(&from, dir.join(file_name(i + 1)))?;
        }
    }
    Ok(())
}

/// The last `n` lines across the files, oldest first.
pub fn read_tail(dir: &Path, n: usize) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    for i in 0..KEEP_FILES {
        if lines.len() >= n {
            break;
        }
        let Ok(text) = fs::read_to_string(dir.join(file_name(i))) else { continue };
        let mut older: Vec<String> = text.lines().map(str::to_string).collect();
        older.append(&mut lines);
        lines = older;
    }
    let skip = lines.len().saturating_sub(n);
    lines.split_off(skip)
}

fn stamp() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string()
}

impl log::Log for Sink {
    /// Ensayo's own lines from info up; other crates only when something is wrong.
    fn enabled(&self, m: &log::Metadata) -> bool {
        if m.target().starts_with("ensayo") { m.level() <= log::Level::Info } else { m.level() <= log::Level::Warn }
    }

    fn log(&self, record: &log::Record) {
        if self.enabled(record.metadata()) {
            self.write_line(&format!("{} {:<5} {}: {}", stamp(), record.level(), record.target(), record.args()));
        }
    }

    fn flush(&self) {}
}

static SINK: OnceLock<Sink> = OnceLock::new();

/// The app's log, once `init` has run.
pub fn sink() -> Option<&'static Sink> {
    SINK.get()
}

/// Installs the file logger and a panic hook that logs where the app panicked. Call once at launch.
pub fn init() {
    let sink = SINK.get_or_init(|| Sink::new(paths::logs_dir(), MAX_BYTES, KEEP_FILES, Redactor::for_this_computer()));
    if log::set_logger(sink).is_ok() {
        log::set_max_level(log::LevelFilter::Info);
    }
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let at = info.location().map(|l| format!("{}:{}", l.file(), l.line())).unwrap_or_else(|| "unknown".into());
        let what = info.payload().downcast_ref::<&str>().map(|s| s.to_string()).or_else(|| info.payload().downcast_ref::<String>().cloned()).unwrap_or_default();
        log::error!(target: "ensayo::panic", "panic at {at}: {}", truncate(&what, ERROR_MAX_BYTES));
        previous(info);
    }));
}

/// Delete all data: the log folder goes too, and nothing writes it again until Ensayo restarts.
pub fn remove_all_in(dir: &Path) -> Result<(), String> {
    let gone = match sink().filter(|s| s.dir() == dir) {
        Some(s) => s.close_and_remove(),
        None => match fs::remove_dir_all(dir) {
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
            other => other,
        },
    };
    gone.map_err(|e| format!("Couldn't remove the log folder: {e}"))
}

// ---------- what the window sends ----------

static WINDOW_START: AtomicU64 = AtomicU64::new(0);
static WINDOW_COUNT: AtomicU32 = AtomicU32::new(0);
/// A runaway error loop in the window must not fill the disk: at most this many lines a minute.
const FRONTEND_PER_MINUTE: u32 = 60;

fn within_rate() -> bool {
    let minute = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() / 60).unwrap_or(0);
    if WINDOW_START.swap(minute, Ordering::SeqCst) != minute {
        WINDOW_COUNT.store(0, Ordering::SeqCst);
    }
    WINDOW_COUNT.fetch_add(1, Ordering::SeqCst) < FRONTEND_PER_MINUTE
}

/// The level and one-line text for a message from the window: the message and stack only, cut to 2 KB.
pub fn frontend_line(level: &str, message: &str, origin: &str) -> (log::Level, String) {
    let lvl = match level.trim().to_ascii_lowercase().as_str() {
        "info" => log::Level::Info,
        "warn" | "warning" => log::Level::Warn,
        _ => log::Level::Error,
    };
    let origin: String = origin.chars().filter(|c| c.is_ascii_alphanumeric() || " ._-:/".contains(*c)).take(60).collect();
    (lvl, format!("[{}] {}", origin.trim(), truncate(message, FRONTEND_MAX_BYTES)))
}

/// Writes a message from the window to the log.
pub fn log_frontend(level: &str, message: &str, origin: &str) {
    if !within_rate() {
        return;
    }
    let (lvl, text) = frontend_line(level, message, origin);
    log::log!(target: "ensayo::frontend", lvl, "{text}");
}

// ---------- timings ----------

/// Put `let _t = logging::Timer::new("finish_rep");` first in a command: when the command ends, the log says how
/// long it took. Only the name and the time are logged.
pub struct Timer {
    name: &'static str,
    start: Instant,
}

impl Timer {
    pub fn new(name: &'static str) -> Timer {
        Timer { name, start: Instant::now() }
    }

    pub fn elapsed(&self) -> Duration {
        self.start.elapsed()
    }
}

impl Drop for Timer {
    fn drop(&mut self) {
        log::info!(target: "ensayo::cmd", "{} {} ms", self.name, self.start.elapsed().as_millis());
    }
}

// ---------- every model call ----------

/// Wraps the engine's client so each call is logged: engine, model, tier, sizes, tokens, time, and the error string
/// when it fails. The prompt and the reply are never logged, only their sizes.
pub struct LoggedLlm {
    inner: Box<dyn Llm>,
    engine: String,
}

impl LoggedLlm {
    pub fn new(inner: Box<dyn Llm>, engine: &str) -> LoggedLlm {
        LoggedLlm { inner, engine: engine.to_string() }
    }
}

impl Llm for LoggedLlm {
    fn complete(&self, req: &LlmRequest) -> Result<LlmReply, AiError> {
        let start = Instant::now();
        let tier = if req.tier == Tier::Fast { "fast" } else { "strong" };
        let sent = req.system.len() + req.user.len();
        let out = self.inner.complete(req);
        let ms = start.elapsed().as_millis();
        match &out {
            Ok(r) => log::info!(target: "ensayo::ai", "{} {tier} model={} sent_bytes={sent} reply_bytes={} in={} out={} {ms} ms", self.engine, r.model, r.text.len(), r.input_tokens, r.output_tokens),
            Err(e) => {
                let (kind, m) = match e {
                    AiError::Unavailable(m) => ("unavailable", m),
                    AiError::Failed(m) => ("failed", m),
                };
                log::warn!(target: "ensayo::ai", "{} {tier} {kind} sent_bytes={sent} {ms} ms: {}", self.engine, truncate(m, ERROR_MAX_BYTES));
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use log::Log;
    use std::path::Path;

    fn sink_in(dir: &Path, max: u64) -> Sink {
        Sink::new(dir.join("logs"), max, KEEP_FILES, crate::redact::redactor_for_home(Path::new("/Users/dana.okafor"), "dana.okafor"))
    }

    fn files(dir: &Path) -> Vec<String> {
        let mut v: Vec<String> = fs::read_dir(dir.join("logs")).map(|d| d.flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect()).unwrap_or_default();
        v.sort();
        v
    }

    #[test]
    fn rotation_keeps_three_files_and_each_stays_under_the_limit() {
        let dir = tempfile::tempdir().unwrap();
        let sink = sink_in(dir.path(), 1000);
        for i in 0..200 {
            sink.write_line(&format!("line {i:03} {}", "x".repeat(40)));
        }
        assert_eq!(files(dir.path()), ["ensayo.1.log", "ensayo.2.log", "ensayo.log"]);
        for f in files(dir.path()) {
            assert!(fs::metadata(dir.path().join("logs").join(&f)).unwrap().len() <= 1000, "{f} is over the limit");
        }
        // The newest line is in the current file and the oldest ones are gone.
        let tail = read_tail(&dir.path().join("logs"), 5);
        assert!(tail.last().unwrap().starts_with("line 199"), "{tail:?}");
        let all = read_tail(&dir.path().join("logs"), 10_000).join("\n");
        assert!(!all.contains("line 000"));
    }

    #[test]
    fn the_real_limit_is_two_megabytes_and_three_files() {
        assert_eq!(MAX_BYTES, 2 * 1024 * 1024);
        assert_eq!(KEEP_FILES, 3);
    }

    #[test]
    fn the_tail_spans_files_oldest_first() {
        let dir = tempfile::tempdir().unwrap();
        let sink = sink_in(dir.path(), 200);
        for i in 0..30 {
            sink.write_line(&format!("n{i:02}"));
        }
        let tail = read_tail(&dir.path().join("logs"), 7);
        assert_eq!(tail, ["n23", "n24", "n25", "n26", "n27", "n28", "n29"]);
        assert!(read_tail(&dir.path().join("nothing"), 5).is_empty());
    }

    #[test]
    fn a_line_never_carries_a_key_or_the_users_name() {
        let dir = tempfile::tempdir().unwrap();
        let sink = sink_in(dir.path(), MAX_BYTES);
        sink.write_line("read /Users/dana.okafor/Drive/x failed\nsecond line sk-ant-api03-abcDEF1234567890");
        let text = fs::read_to_string(dir.path().join("logs").join(LOG_NAME)).unwrap();
        assert_eq!(text.lines().count(), 1, "one record is one line");
        assert!(!text.contains("dana") && !text.contains("abcDEF1234567890"), "{text}");
    }

    #[test]
    fn only_ensayos_lines_get_in_at_info_and_other_crates_only_when_something_is_wrong() {
        let dir = tempfile::tempdir().unwrap();
        let sink = sink_in(dir.path(), MAX_BYTES);
        let rec = |target: &str, level: log::Level, msg: &str| {
            sink.log(&log::Record::builder().target(target).level(level).args(format_args!("{msg}")).build());
        };
        rec("ensayo_lib::ai", log::Level::Info, "mine");
        rec("ensayo_lib::ai", log::Level::Debug, "mine debug");
        rec("hyper::client", log::Level::Info, "theirs info");
        rec("hyper::client", log::Level::Warn, "theirs warn");
        let text = fs::read_to_string(dir.path().join("logs").join(LOG_NAME)).unwrap();
        assert!(text.contains("mine") && text.contains("theirs warn"));
        assert!(!text.contains("mine debug") && !text.contains("theirs info"), "{text}");
        assert!(text.contains("INFO") && text.contains("ensayo_lib::ai"));
    }

    #[test]
    fn closing_removes_the_folder_and_nothing_writes_it_back() {
        let dir = tempfile::tempdir().unwrap();
        let sink = sink_in(dir.path(), MAX_BYTES);
        sink.write_line("one");
        assert!(dir.path().join("logs").is_dir());
        sink.close_and_remove().unwrap();
        assert!(!dir.path().join("logs").exists());
        sink.write_line("two");
        assert!(!dir.path().join("logs").exists(), "a closed log stays gone");
        sink.close_and_remove().unwrap(); // already gone: still fine
    }

    #[test]
    fn delete_all_removes_the_log_folder_with_every_rotated_file() {
        let dir = tempfile::tempdir().unwrap();
        let logs = dir.path().join("logs");
        // Not the app's own sink: the folder is removed by path, as when the logger never started.
        let sink = sink_in(dir.path(), 100);
        for i in 0..30 {
            sink.write_line(&format!("line {i} {}", "x".repeat(30)));
        }
        assert_eq!(files(dir.path()).len(), 3);
        remove_all_in(&logs).unwrap();
        assert!(!logs.exists());
        remove_all_in(&logs).unwrap(); // nothing there: still fine
    }

    #[test]
    fn a_window_message_is_cut_to_two_kilobytes_and_kept_to_one_origin_word() {
        let (lvl, text) = frontend_line("ERROR", &"é".repeat(5000), "window.onerror\n<script>");
        assert_eq!(lvl, log::Level::Error);
        assert!(text.len() < FRONTEND_MAX_BYTES + 80, "{}", text.len());
        assert!(text.starts_with("[window.onerrorscript] "), "{text}");
        assert_eq!(frontend_line("warn", "x", "a").0, log::Level::Warn);
        assert_eq!(frontend_line("nonsense", "x", "a").0, log::Level::Error);
    }

    struct Fake(Result<LlmReply, AiError>);
    impl Llm for Fake {
        fn complete(&self, _: &LlmRequest) -> Result<LlmReply, AiError> {
            self.0.clone()
        }
    }

    #[test]
    fn a_logged_model_call_passes_the_reply_through_unchanged() {
        let reply = LlmReply { text: "hello".into(), input_tokens: 3, output_tokens: 1, model: "m".into() };
        let llm = LoggedLlm::new(Box::new(Fake(Ok(reply.clone()))), "test");
        let req = LlmRequest { system: "s".into(), user: "u".into(), json: false, max_tokens: 10, tier: Tier::Fast };
        assert_eq!(llm.complete(&req).unwrap(), reply);
        let bad = LoggedLlm::new(Box::new(Fake(Err(AiError::Failed("down".into())))), "test");
        assert_eq!(bad.complete(&req).unwrap_err(), AiError::Failed("down".into()));
    }
}
