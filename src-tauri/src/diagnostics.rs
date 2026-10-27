//! The diagnostics text block: what Settings › About copies and the Feedback email can carry. `build` is a pure
//! function over facts already read from this computer, so tests can feed it hostile settings and data and check
//! what comes out. It holds the app version, system, speech and feedback engine state, the data folder's state
//! (never its path), and the last lines of the log. Never a key, a transcript, or the user's name.

use crate::ai::local_models::{self, LocalAiStatus};
use crate::ai_commands::default_models;
use crate::ai::providers::Provider;
use crate::redact::Redactor;
use crate::speech::models::{self, Location, ModelStore};
use crate::storage::settings::LocalSettings;

/// How many log lines the block carries.
pub const LOG_LINES: usize = 60;

/// Everything `build` reads. All of it is plain values, so a test can set up any machine.
pub struct Inputs<'a> {
    pub app_version: &'a str,
    pub os: &'a str,
    pub os_version: &'a str,
    pub arch: &'a str,
    pub settings: &'a LocalSettings,
    /// The speech model picked in Settings (the window knows it); None means the first one on this computer.
    pub speech_choice: Option<&'a str>,
    pub speech_store: &'a ModelStore,
    pub local_ai: &'a [LocalAiStatus],
    pub helper_found: bool,
    /// "ready", "missing", "other_machine" or "stale_lock".
    pub data_state: &'a str,
    pub has_key: bool,
    pub free_disk_mb: Option<u64>,
    pub log_tail: &'a [String],
}

/// A model name from the settings is used only when it looks like one. Anything else (a typo, a pasted key) is
/// shown as "custom", so the settings can never leak through this block.
fn safe_model(name: &str) -> String {
    let n = name.trim();
    let ok = !n.is_empty() && n.len() <= 64 && n.chars().all(|c| c.is_ascii_alphanumeric() || ".-_:/@".contains(c));
    if ok && !crate::redact::blank_keys(n).contains("[key]") { n.to_string() } else if n.is_empty() { "default".to_string() } else { "custom".to_string() }
}

fn speech_line(i: &Inputs) -> String {
    let chosen = i.speech_choice.and_then(models::find).filter(|m| m.engine.is_speech());
    let by_order = || models::speech_in_order().find(|m| i.speech_store.locate(m) != Location::Missing);
    let Some(m) = chosen.or_else(by_order).or_else(|| models::find(models::DEFAULT_MODEL)) else { return "Speech model: none".into() };
    let state = match i.speech_store.locate(m) {
        Location::Own(_) => "files present",
        Location::OnThisComputer(_) => "files present (another app's copy)",
        Location::Missing => "files missing",
    };
    let vad = if i.speech_store.locate(&models::VAD) == Location::Missing { "missing" } else { "present" };
    format!("Speech model: {} ({}), {state}. Voice detection: {vad}", m.name, m.id)
}

fn engine_line(i: &Inputs) -> String {
    let ai = i.settings.ai.clone().unwrap_or_default();
    let p = ai.provider.trim();
    if p.is_empty() {
        return "Feedback engine: timing only (no AI)".into();
    }
    if p == crate::ai_commands::LOCAL {
        return format!("Feedback engine: built-in local AI ({})", safe_model(local_models::choose(&ai.fast_model).info.id));
    }
    let Some(provider) = Provider::parse(p) else { return "Feedback engine: unknown".into() };
    let (fast_default, strong_default) = default_models(provider);
    let pick = |chosen: &str, default: &str| if chosen.trim().is_empty() { safe_model(default) } else { safe_model(chosen) };
    let key = if i.has_key { "API key saved" } else { "no API key saved" };
    format!("Feedback engine: {} (fast {}, strong {}), {key}", provider.key_id(), pick(&ai.fast_model, fast_default), pick(&ai.strong_model, strong_default))
}

fn builtin_line(i: &Inputs) -> String {
    let selected = i.settings.ai.as_ref().map(|a| a.fast_model.as_str()).unwrap_or("");
    let id = local_models::choose(selected).info.id;
    let state = match i.local_ai.iter().find(|m| m.id == id).map(|m| m.state) {
        Some("ready") => "ready",
        Some("on_this_computer") => "ready (another app's copy)",
        _ => "not downloaded",
    };
    format!("Built-in AI: {id} {state}, helper {}", if i.helper_found { "found" } else { "missing" })
}

fn data_line(state: &str) -> String {
    let words = match state {
        "ready" => "ready",
        "missing" => "missing",
        "other_machine" => "open on another computer",
        "stale_lock" => "left open by a closed Ensayo",
        _ => "unknown",
    };
    format!("Data folder: {words}")
}

/// A size in megabytes as "12 GB" or "800 MB".
fn size_text(mb: u64) -> String {
    if mb >= 1024 { format!("{} GB", mb / 1024) } else { format!("{mb} MB") }
}

/// The block, with every line passed through `redactor` last of all.
pub fn build(i: &Inputs, redactor: &Redactor) -> String {
    let mut lines = vec![
        format!("Ensayo {}", i.app_version),
        format!("System: {} {} ({})", i.os, i.os_version, i.arch).replace("  ", " "),
        speech_line(i),
        engine_line(i),
        builtin_line(i),
        data_line(i.data_state),
    ];
    if let Some(mb) = i.free_disk_mb {
        lines.push(format!("Free disk space: {}", size_text(mb)));
    }
    lines.push(String::new());
    let tail: &[String] = &i.log_tail[i.log_tail.len().saturating_sub(LOG_LINES)..];
    lines.push(format!("Log (last {} lines):", tail.len()));
    if tail.is_empty() {
        lines.push("(nothing logged yet)".into());
    }
    lines.extend(tail.iter().cloned());
    redactor.apply(&lines.join("\n"))
}

// ---------- reading this computer ----------

/// "macOS 15.1" style version from `sw_vers -productVersion`.
pub fn parse_mac_version(out: &str) -> String {
    out.trim().to_string()
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
/// "10.0.22631.4037" from `ver`'s "Microsoft Windows [Version 10.0.22631.4037]".
pub fn parse_windows_version(out: &str) -> String {
    out.split("Version").nth(1).map(|v| v.trim().trim_end_matches(']').trim().to_string()).unwrap_or_default()
}

/// Free megabytes on the volume, from POSIX `df -Pk <path>` output (second line, fourth column in KB).
pub fn parse_df_free_mb(out: &str) -> Option<u64> {
    let line = out.lines().nth(1)?;
    let kb: u64 = line.split_whitespace().nth(3)?.parse().ok()?;
    Some(kb / 1024)
}

fn run(cmd: &str, args: &[&str]) -> Option<String> {
    let mut c = std::process::Command::new(cmd);
    c.args(args);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // no console window
    }
    let out = c.output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

pub fn os_name() -> &'static str {
    match std::env::consts::OS {
        "macos" => "macOS",
        "windows" => "Windows",
        "linux" => "Linux",
        other => other,
    }
}

pub fn os_version() -> String {
    #[cfg(target_os = "macos")]
    return run("sw_vers", &["-productVersion"]).map(|o| parse_mac_version(&o)).unwrap_or_default();
    #[cfg(target_os = "windows")]
    return run("cmd", &["/C", "ver"]).map(|o| parse_windows_version(&o)).unwrap_or_default();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    String::new()
}

/// Free space on the volume holding `dir`. Mac and Linux ask `df`; on Windows it is left out (no light way to ask).
pub fn free_disk_mb(dir: &std::path::Path) -> Option<u64> {
    #[cfg(not(target_os = "windows"))]
    {
        let probe = if dir.exists() { dir.to_path_buf() } else { dir.parent()?.to_path_buf() };
        run("df", &["-Pk", &probe.to_string_lossy()]).and_then(|o| parse_df_free_mb(&o))
    }
    #[cfg(target_os = "windows")]
    {
        let _ = dir;
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::settings::AiSettings;
    use std::path::Path;

    const KEY: &str = "sk-ant-api03-REALLYSECRETKEYVALUE0123456789";
    const TRANSCRIPT: &str = "so at Northpine I grew churn revenue by forty percent";

    fn redactor() -> Redactor {
        crate::redact::redactor_for_home(Path::new("/Users/dana.okafor"), "dana.okafor").with_secrets([KEY.to_string()])
    }

    struct Fixture {
        settings: LocalSettings,
        store: ModelStore,
        local: Vec<LocalAiStatus>,
        tail: Vec<String>,
    }

    fn fixture(ai: AiSettings, tail: Vec<String>) -> (tempfile::TempDir, Fixture) {
        let dir = tempfile::tempdir().unwrap();
        let store = ModelStore { root: dir.path().join("models"), talaan_root: None, reuse: false };
        let local = local_models::status_in(&ModelStore { root: dir.path().join("models").join("llm"), talaan_root: None, reuse: false });
        (dir, Fixture { settings: LocalSettings { ai: Some(ai), ..Default::default() }, store, local, tail })
    }

    fn inputs<'a>(f: &'a Fixture, data_state: &'a str, choice: Option<&'a str>) -> Inputs<'a> {
        Inputs { app_version: "0.2.0", os: "macOS", os_version: "15.1", arch: "aarch64", settings: &f.settings, speech_choice: choice, speech_store: &f.store, local_ai: &f.local, helper_found: true, data_state, has_key: true, free_disk_mb: Some(120 * 1024), log_tail: &f.tail }
    }

    #[test]
    fn the_block_lists_the_facts_in_plain_lines() {
        let (_d, f) = fixture(AiSettings { provider: "claude".into(), ..Default::default() }, vec!["2026-10-22 09:00:00.000 INFO ensayo_lib::cmd: finish_rep 812 ms".into()]);
        let out = build(&inputs(&f, "ready", None), &redactor());
        assert!(out.starts_with("Ensayo 0.2.0\nSystem: macOS 15.1 (aarch64)\n"), "{out}");
        // Nothing downloaded: the line names this computer's default.
        let default = crate::speech::models::find(crate::speech::models::DEFAULT_MODEL).unwrap();
        assert!(out.contains(&format!("Speech model: {} ({}), files missing. Voice detection: missing", default.name, default.id)), "{out}");
        assert!(out.contains("Feedback engine: claude (fast claude-sonnet-5-5, strong claude-sonnet-5-5), API key saved"), "{out}");
        assert!(out.contains("Built-in AI: qwen3.5-4b not downloaded, helper found"), "{out}");
        assert!(out.contains("Data folder: ready"), "{out}");
        assert!(out.contains("Free disk space: 120 GB"), "{out}");
        assert!(out.contains("Log (last 1 lines):\n2026-10-22 09:00:00.000 INFO ensayo_lib::cmd: finish_rep 812 ms"), "{out}");
    }

    #[test]
    fn the_data_folder_states_have_their_own_words_and_disk_space_is_left_out_when_unknown() {
        let (_d, f) = fixture(AiSettings::default(), vec![]);
        for (state, words) in [("missing", "Data folder: missing"), ("other_machine", "Data folder: open on another computer"), ("stale_lock", "left open")] {
            assert!(build(&inputs(&f, state, None), &redactor()).contains(words), "{state}");
        }
        let mut i = inputs(&f, "ready", None);
        i.free_disk_mb = None;
        let out = build(&i, &redactor());
        assert!(!out.contains("Free disk space"));
        assert!(out.contains("Feedback engine: timing only (no AI)"));
        assert!(out.contains("(nothing logged yet)"));
    }

    #[test]
    fn only_the_last_sixty_log_lines_go_in() {
        let tail: Vec<String> = (0..100).map(|n| format!("line {n}")).collect();
        let (_d, f) = fixture(AiSettings::default(), tail);
        let out = build(&inputs(&f, "ready", None), &redactor());
        assert!(out.contains("Log (last 60 lines):\nline 40\n") && out.ends_with("line 99"), "{out}");
        assert!(!out.contains("line 39\n"));
    }

    #[test]
    fn the_speech_model_in_use_comes_from_the_choice_or_the_first_one_present() {
        let (d, f) = fixture(AiSettings::default(), vec![]);
        let out = build(&inputs(&f, "ready", Some("whisper-tiny")), &redactor());
        assert!(out.contains("Whisper Tiny") || out.contains("(whisper-tiny)"), "{out}");
        // A model that is on disk is "in use" when nothing is chosen.
        let tiny = models::find("whisper-tiny").unwrap();
        let own = f.store.own_dir(tiny);
        std::fs::create_dir_all(&own).unwrap();
        for file in tiny.files {
            let h = std::fs::File::create(own.join(file.name)).unwrap();
            h.set_len(file.size).unwrap();
        }
        let out = build(&inputs(&f, "ready", None), &redactor());
        assert!(out.contains("(whisper-tiny), files present"), "{out}");
        drop(d);
    }

    #[test]
    fn hostile_settings_data_and_logs_leave_no_key_transcript_or_user_name_in_the_block() {
        // A key pasted into a model field, a settings value shaped like a key, a transcript sitting in the data
        // folder, a data folder named after the user, and log lines that carry all of it.
        let (dir, f) = fixture(
            AiSettings { provider: "compatible".into(), fast_model: KEY.into(), strong_model: "dana.okafor's model".into(), base_url: format!("http://localhost:1234/?key={KEY}"), ..Default::default() },
            vec![
                format!("read /Users/dana.okafor/Drive/Ensayo/bank/stories/s1.json failed"),
                format!("auth header was {KEY}"),
                "GET https://generativelanguage.googleapis.com/v1/models?key=AIzaSyD-9tSrke72PouQMnMX-a7eZSW0jkFMBWY".to_string(),
            ],
        );
        let data = dir.path().join("dana.okafor-data");
        std::fs::create_dir_all(data.join("reps")).unwrap();
        std::fs::write(data.join("reps/r1.json"), format!(r#"{{"transcript":"{TRANSCRIPT}"}}"#)).unwrap();
        let state = crate::data_commands::status_for(&data, &dir.path().join("elsewhere"), "dana.okafor-macbook", chrono::Utc::now()).state;
        let out = build(&inputs(&f, state, None), &redactor());
        for bad in [KEY, "REALLYSECRET", "AIzaSyD", "9tSrke72", TRANSCRIPT, "churn", "dana", "okafor", "1234/?key"] {
            assert!(!out.contains(bad), "the block leaked {bad:?}:\n{out}");
        }
        assert!(out.contains("Data folder:"), "{out}");
        assert!(out.contains("fast custom") && out.contains("strong custom"), "{out}");
    }

    #[test]
    fn a_saved_key_is_blanked_even_when_it_shows_up_somewhere_unexpected() {
        let (_d, f) = fixture(AiSettings::default(), vec![format!("odd: {KEY}")]);
        let out = build(&inputs(&f, "ready", None), &Redactor::default().with_secrets([KEY.to_string()]));
        assert!(!out.contains("REALLYSECRET") && out.contains("[key]"), "{out}");
    }

    #[test]
    fn the_system_commands_output_is_read_into_versions_and_free_space() {
        assert_eq!(parse_mac_version("15.1\n"), "15.1");
        assert_eq!(parse_windows_version("\r\nMicrosoft Windows [Version 10.0.22631.4037]\r\n"), "10.0.22631.4037");
        assert_eq!(parse_windows_version("garbage"), "");
        let df = "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/disk3s5 971350180 500000000 125829120 81% /System/Volumes/Data\n";
        assert_eq!(parse_df_free_mb(df), Some(122880));
        assert_eq!(parse_df_free_mb("nonsense"), None);
    }
}
