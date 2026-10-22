//! The interviewer's voice, second engine: the computer's own speech, run as a child process the backend can stop.
//!
//! The app's browser engine (speechSynthesis) does not speak in every webview, so Ensayo falls back to the system:
//! macOS `say`, Windows PowerShell with System.Speech. The text being read is never put inside a shell string or inside
//! a script. macOS gets it on stdin; Windows gets it in an environment variable that a fixed script reads. Every
//! child is started with `std::process::Command` and explicit arguments, so a question containing quotes, semicolons,
//! `$()` or backticks stays plain text.
//!
//! One voice at a time: starting a line stops the one before it, and the child is killed when the app exits.

use serde::Serialize;
use std::io::Write;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct NativeVoice {
    /// What `speak_native` takes back: the voice's name on both systems.
    pub id: String,
    pub name: String,
    pub language: String,
}

/// How a line ended: it was read to the end, or it was stopped (by Stop or by the next line).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Finished,
    Stopped,
}

/// Everything needed to start one child process. The program and the arguments never contain the text on Windows,
/// and never contain it on macOS either: it travels on stdin.
#[derive(Debug, Clone, PartialEq)]
pub struct Spec {
    pub program: String,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    pub stdin: Option<String>,
}

/// Longest text read in one go; a question is a sentence or two.
const MAX_CHARS: usize = 6000;
/// `say`'s own default speed, in words per minute.
const SAY_BASE_WPM: f64 = 175.0;

/// The text as it will be spoken: no NUL bytes (they cannot sit in an environment variable) and a sane length.
pub fn clean_text(text: &str) -> String {
    text.chars().filter(|c| *c != '\0').take(MAX_CHARS).collect()
}

/// A voice id is only passed on when it looks like a plain voice name, so it can never be mistaken for an option.
pub fn valid_voice_id(id: &str) -> bool {
    let t = id.trim();
    !t.is_empty() && t.chars().count() <= 200 && !t.starts_with('-') && !t.chars().any(|c| c.is_control())
}

/// Words per minute for `say`, from the speed multiplier chosen in Settings (1.0 is normal).
pub fn say_wpm(rate: f64) -> u32 {
    let r = if rate.is_finite() && rate > 0.0 { rate } else { 1.0 };
    (SAY_BASE_WPM * r).round().clamp(80.0, 400.0) as u32
}

/// System.Speech rate (-10 to 10) from the same multiplier: Slower is about -2, Faster about +2.
pub fn windows_rate(rate: f64) -> i32 {
    let r = if rate.is_finite() && rate > 0.0 { rate } else { 1.0 };
    (((r - 1.0) * 10.0).round() as i32).clamp(-10, 10)
}

pub fn say_voices_spec() -> Spec {
    Spec { program: "say".into(), args: vec!["-v".into(), "?".into()], env: vec![], stdin: None }
}

/// macOS: `say [-v voice] -r wpm -f -`, the text on stdin.
pub fn say_spec(text: &str, voice_id: &str, rate: f64) -> Spec {
    let mut args: Vec<String> = Vec::new();
    if valid_voice_id(voice_id) {
        args.push("-v".into());
        args.push(voice_id.trim().to_string());
    }
    args.extend(["-r".to_string(), say_wpm(rate).to_string(), "-f".to_string(), "-".to_string()]);
    Spec { program: "say".into(), args, env: vec![], stdin: Some(clean_text(text)) }
}

/// The only script PowerShell ever runs to speak. It reads the text, the voice and the speed from environment
/// variables; nothing is ever pasted into it.
pub const POWERSHELL_SPEAK: &str = "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Speech; \
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; \
if ($env:ENSAYO_VOICE) { try { $s.SelectVoice($env:ENSAYO_VOICE) } catch { } }; \
$s.Rate = [int]$env:ENSAYO_RATE; \
$s.Speak($env:ENSAYO_TEXT)";

/// The fixed script that lists the installed voices, one `name<TAB>culture` per line.
pub const POWERSHELL_LIST: &str = "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.Speech; \
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; \
$s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name + [char]9 + $_.VoiceInfo.Culture.Name }";

fn powershell(script: &str, env: Vec<(String, String)>) -> Spec {
    Spec {
        program: "powershell.exe".into(),
        args: ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script].iter().map(|s| s.to_string()).collect(),
        env,
        stdin: None,
    }
}

pub fn powershell_voices_spec() -> Spec {
    powershell(POWERSHELL_LIST, vec![])
}

/// Windows: the same fixed arguments for every line; only the environment differs.
pub fn powershell_spec(text: &str, voice_id: &str, rate: f64) -> Spec {
    let voice = if valid_voice_id(voice_id) { voice_id.trim().to_string() } else { String::new() };
    powershell(
        POWERSHELL_SPEAK,
        vec![("ENSAYO_TEXT".into(), clean_text(text)), ("ENSAYO_VOICE".into(), voice), ("ENSAYO_RATE".into(), windows_rate(rate).to_string())],
    )
}

/// `say -v ?` prints `Name   en_US    # sample sentence`. The name can hold spaces and brackets; the language is the
/// last word before the `#`.
pub fn parse_say_voices(output: &str) -> Vec<NativeVoice> {
    let mut out: Vec<NativeVoice> = Vec::new();
    for line in output.lines() {
        let head = line.split(" #").next().unwrap_or("").trim_end();
        let Some(split) = head.rfind(char::is_whitespace) else { continue };
        let (name, language) = (head[..split].trim(), head[split..].trim());
        if name.is_empty() || language.is_empty() || !valid_voice_id(name) || out.iter().any(|v| v.id == name) {
            continue;
        }
        out.push(NativeVoice { id: name.to_string(), name: name.to_string(), language: language.to_string() });
    }
    out
}

/// PowerShell's `name<TAB>culture` lines.
pub fn parse_powershell_voices(output: &str) -> Vec<NativeVoice> {
    let mut out: Vec<NativeVoice> = Vec::new();
    for line in output.trim_start_matches('\u{feff}').lines() {
        let line = line.trim_end_matches('\r');
        let Some((name, language)) = line.split_once('\t') else { continue };
        let (name, language) = (name.trim(), language.trim());
        if !valid_voice_id(name) || out.iter().any(|v| v.id == name) {
            continue;
        }
        out.push(NativeVoice { id: name.to_string(), name: name.to_string(), language: language.to_string() });
    }
    out
}

// ---------- running ----------

/// The line being read: its number and its process.
static CURRENT: Mutex<Option<(u64, Child)>> = Mutex::new(None);
static NEXT: AtomicU64 = AtomicU64::new(1);

fn slot() -> MutexGuard<'static, Option<(u64, Child)>> {
    CURRENT.lock().unwrap_or_else(|e| e.into_inner())
}

fn kill(mut child: Child) {
    let _ = child.kill();
    let _ = child.wait();
}

/// Stops the line being read, if any. Also what the app calls when it exits.
pub fn stop() {
    let taken = slot().take();
    if let Some((_, child)) = taken {
        kill(child);
    }
}

fn command(spec: &Spec) -> Command {
    let mut cmd = Command::new(&spec.program);
    cmd.args(&spec.args);
    for (k, v) in &spec.env {
        cmd.env(k, v);
    }
    cmd.stdin(if spec.stdin.is_some() { Stdio::piped() } else { Stdio::null() }).stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd
}

/// Runs a short child to the end and returns what it printed (the voice lists).
fn capture(spec: &Spec) -> Result<String, String> {
    let mut cmd = command(spec);
    cmd.stdout(Stdio::piped());
    let out = cmd.output().map_err(|e| format!("could not start {}: {e}", spec.program))?;
    if !out.status.success() {
        return Err(format!("{} failed: {}", spec.program, out.status));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// Starts `spec`, makes it the current line (stopping the one before) and waits until it ends or is stopped.
/// Err when it could not start or exited with an error, so the caller can try another engine.
pub fn run(spec: &Spec) -> Result<Outcome, String> {
    stop();
    let mut child = command(spec).spawn().map_err(|e| format!("could not start {}: {e}", spec.program))?;
    if let (Some(text), Some(mut stdin)) = (&spec.stdin, child.stdin.take()) {
        // A broken pipe here means the child already ended; the wait below reports how.
        let _ = stdin.write_all(text.as_bytes());
    }
    let mine = NEXT.fetch_add(1, Ordering::SeqCst);
    {
        let mut s = slot();
        if let Some((_, old)) = s.take() {
            kill(old);
        }
        *s = Some((mine, child));
    }
    loop {
        std::thread::sleep(Duration::from_millis(40));
        let mut s = slot();
        match s.as_mut() {
            Some((n, child)) if *n == mine => match child.try_wait() {
                Ok(Some(status)) => {
                    *s = None;
                    return if status.success() { Ok(Outcome::Finished) } else { Err(format!("{} ended with {status}", spec.program)) };
                }
                Ok(None) => {}
                Err(e) => {
                    *s = None;
                    return Err(e.to_string());
                }
            },
            _ => return Ok(Outcome::Stopped),
        }
    }
}

fn list_voices() -> Result<Vec<NativeVoice>, String> {
    if cfg!(target_os = "macos") {
        Ok(parse_say_voices(&capture(&say_voices_spec())?))
    } else if cfg!(target_os = "windows") {
        Ok(parse_powershell_voices(&capture(&powershell_voices_spec())?))
    } else {
        Ok(vec![])
    }
}

fn speak(text: &str, voice_id: &str, rate: f64) -> Result<Outcome, String> {
    if text.trim().is_empty() {
        return Ok(Outcome::Finished);
    }
    if cfg!(target_os = "macos") {
        run(&say_spec(text, voice_id, rate))
    } else if cfg!(target_os = "windows") {
        run(&powershell_spec(text, voice_id, rate))
    } else {
        Err("This computer has no system voice Ensayo can use.".to_string())
    }
}

// ---------- commands ----------

/// The voices the system offers. Empty when there are none or this system has no supported speech.
#[tauri::command]
pub async fn native_voices() -> Result<Vec<NativeVoice>, String> {
    tauri::async_runtime::spawn_blocking(list_voices).await.map_err(|e| e.to_string())?
}

/// Reads `text` in the system voice (`voice_id` empty for the default) at `rate`, a multiplier where 1 is normal.
/// Stops any line already being read, and returns when this one ends: "finished" or "stopped".
#[tauri::command]
pub async fn speak_native(text: String, voice_id: String, rate: f64) -> Result<String, String> {
    let outcome = tauri::async_runtime::spawn_blocking(move || speak(&text, &voice_id, rate)).await.map_err(|e| e.to_string())??;
    Ok(if outcome == Outcome::Finished { "finished" } else { "stopped" }.to_string())
}

#[tauri::command]
pub async fn stop_speaking_native() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(stop).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const HOSTILE: &[&str] = &[
        "Tell me about \"a time\"; rm -rf ~ #",
        "$(touch /tmp/pwned) and `whoami` and ${IFS}",
        "it's a 'quote' & | > < ^ % ! \n second line",
        "-v Fred --help",
        "'; Remove-Item -Recurse C:\\ ; '",
        "\"; Start-Process calc; \"",
        "$env:USERPROFILE `n (Get-Date)",
    ];

    fn everything_but_stdin(s: &Spec) -> String {
        format!("{} {}", s.program, s.args.join(" "))
    }

    #[test]
    fn say_takes_the_text_on_stdin_only() {
        for text in HOSTILE {
            let s = say_spec(text, "Samantha", 1.0);
            assert_eq!(s.program, "say");
            assert_eq!(s.stdin.as_deref(), Some(*text));
            assert!(!everything_but_stdin(&s).contains(text), "{text} leaked into the command");
            assert!(s.env.is_empty());
        }
        assert_eq!(say_spec("Hi", "Samantha", 1.0).args, ["-v", "Samantha", "-r", "175", "-f", "-"]);
    }

    #[test]
    fn say_arguments_do_not_change_with_the_text() {
        let a = say_spec("one", "Alex", 1.2);
        let b = say_spec(HOSTILE[0], "Alex", 1.2);
        assert_eq!(a.args, b.args);
    }

    #[test]
    fn say_without_a_usable_voice_uses_the_default() {
        assert_eq!(say_spec("Hi", "", 1.0).args, ["-r", "175", "-f", "-"]);
        assert_eq!(say_spec("Hi", "-v", 1.0).args, ["-r", "175", "-f", "-"]);
        assert_eq!(say_spec("Hi", "Bad\nNews", 1.0).args, ["-r", "175", "-f", "-"]);
    }

    #[test]
    fn say_speed_follows_the_setting() {
        assert_eq!(say_wpm(1.0), 175);
        assert_eq!(say_wpm(0.85), 149);
        assert_eq!(say_wpm(1.2), 210);
        assert_eq!(say_wpm(f64::NAN), 175);
        assert_eq!(say_wpm(100.0), 400);
        assert_eq!(say_wpm(0.01), 80);
    }

    #[test]
    fn powershell_gets_the_text_in_the_environment_only() {
        let plain = powershell_spec("Hello", "Microsoft Zira Desktop", 1.0);
        for text in HOSTILE {
            let s = powershell_spec(text, "Microsoft Zira Desktop", 1.0);
            assert_eq!(s.program, "powershell.exe");
            assert!(!everything_but_stdin(&s).contains(text), "{text} leaked into the command");
            assert_eq!(s.args, plain.args, "the arguments must be the same fixed ones for every text");
            assert!(s.stdin.is_none());
            assert!(s.env.contains(&("ENSAYO_TEXT".to_string(), text.to_string())));
        }
        assert!(plain.args.contains(&POWERSHELL_SPEAK.to_string()));
        assert!(plain.args.iter().any(|a| a == "Hidden"));
    }

    #[test]
    fn powershell_voice_and_speed_travel_in_the_environment_too() {
        let s = powershell_spec("Hi", "Evil'; calc; '", 1.2);
        assert!(!everything_but_stdin(&s).contains("calc"));
        assert!(s.env.contains(&("ENSAYO_VOICE".to_string(), "Evil'; calc; '".to_string())));
        assert!(s.env.contains(&("ENSAYO_RATE".to_string(), "2".to_string())));
        assert!(powershell_spec("Hi", "-x", 1.0).env.contains(&("ENSAYO_VOICE".to_string(), String::new())));
        assert_eq!(windows_rate(0.85), -2);
        assert_eq!(windows_rate(1.0), 0);
        assert_eq!(windows_rate(50.0), 10);
    }

    #[test]
    fn the_fixed_scripts_hold_no_text_placeholder() {
        for script in [POWERSHELL_SPEAK, POWERSHELL_LIST] {
            assert!(!script.contains("{}") && !script.contains("{0}"));
        }
        assert!(POWERSHELL_SPEAK.contains("$env:ENSAYO_TEXT"));
    }

    #[test]
    fn text_is_cleaned_not_changed() {
        assert_eq!(clean_text("a\0b"), "ab");
        assert_eq!(clean_text("héllo 'x'"), "héllo 'x'");
        assert_eq!(clean_text(&"x".repeat(MAX_CHARS + 50)).chars().count(), MAX_CHARS);
    }

    #[test]
    fn reads_the_say_voice_list() {
        let out = "Alex                en_US    # Most people recognize me by my voice.\n\
Eddy (English (US)) en_US    # Hello! My name is Eddy.\n\
Bad News            en_US    # The light you see at the end of the tunnel # is the headlamp.\n\
Amélie              fr_CA    # Bonjour!\n\
\n\
garbage\n\
Alex                en_US    # again\n";
        let v = parse_say_voices(out);
        let names: Vec<&str> = v.iter().map(|v| v.name.as_str()).collect();
        assert_eq!(names, ["Alex", "Eddy (English (US))", "Bad News", "Amélie"]);
        assert_eq!(v[1], NativeVoice { id: "Eddy (English (US))".into(), name: "Eddy (English (US))".into(), language: "en_US".into() });
        assert_eq!(v[3].language, "fr_CA");
        assert!(parse_say_voices("").is_empty());
    }

    #[test]
    fn reads_the_powershell_voice_list() {
        let out = "\u{feff}Microsoft David Desktop\ten-US\r\nMicrosoft Zira Desktop\ten-US\r\n\r\nno tab here\r\nMicrosoft Hazel Desktop\ten-GB\r\n";
        let v = parse_powershell_voices(out);
        assert_eq!(v.iter().map(|v| v.id.as_str()).collect::<Vec<_>>(), ["Microsoft David Desktop", "Microsoft Zira Desktop", "Microsoft Hazel Desktop"]);
        assert_eq!(v[2].language, "en-GB");
        assert!(parse_powershell_voices("").is_empty());
    }

    #[cfg(unix)]
    mod running {
        use super::*;
        use std::sync::Mutex;
        use std::time::Instant;

        // The current line is one shared slot, so these run one at a time.
        static ONE_AT_A_TIME: Mutex<()> = Mutex::new(());

        fn spec(program: &str, args: &[&str], stdin: Option<&str>) -> Spec {
            Spec { program: program.into(), args: args.iter().map(|s| s.to_string()).collect(), env: vec![], stdin: stdin.map(String::from) }
        }

        #[test]
        fn a_line_that_ends_is_finished() {
            let _g = ONE_AT_A_TIME.lock().unwrap_or_else(|e| e.into_inner());
            assert_eq!(run(&spec("cat", &[], Some("some text"))), Ok(Outcome::Finished));
        }

        #[test]
        fn a_failing_or_missing_program_is_an_error_so_the_caller_can_fall_back() {
            let _g = ONE_AT_A_TIME.lock().unwrap_or_else(|e| e.into_inner());
            assert!(run(&spec("false", &[], None)).is_err());
            assert!(run(&spec("ensayo-no-such-program", &[], None)).is_err());
        }

        #[test]
        fn stop_kills_the_child_and_ends_the_wait() {
            let _g = ONE_AT_A_TIME.lock().unwrap_or_else(|e| e.into_inner());
            let waiter = std::thread::spawn(|| run(&spec("sleep", &["30"], None)));
            std::thread::sleep(Duration::from_millis(300));
            let t = Instant::now();
            stop();
            assert_eq!(waiter.join().unwrap(), Ok(Outcome::Stopped));
            assert!(t.elapsed() < Duration::from_secs(5));
            assert!(slot().is_none());
        }

        #[test]
        fn the_next_line_stops_the_one_before() {
            let _g = ONE_AT_A_TIME.lock().unwrap_or_else(|e| e.into_inner());
            let first = std::thread::spawn(|| run(&spec("sleep", &["30"], None)));
            std::thread::sleep(Duration::from_millis(300));
            assert_eq!(run(&spec("true", &[], None)), Ok(Outcome::Finished));
            assert_eq!(first.join().unwrap(), Ok(Outcome::Stopped));
        }

        #[test]
        fn hostile_text_on_stdin_is_just_text() {
            let _g = ONE_AT_A_TIME.lock().unwrap_or_else(|e| e.into_inner());
            // `cat` echoes nothing anywhere useful; the point is that nothing is interpreted and the child ends cleanly.
            let marker = std::env::temp_dir().join("ensayo-voice-hostile-marker");
            let _ = std::fs::remove_file(&marker);
            let text = format!("$(touch {m}) `touch {m}` ; touch {m}", m = marker.display());
            assert_eq!(run(&spec("cat", &[], Some(&text))), Ok(Outcome::Finished));
            assert!(!marker.exists());
        }
    }
}
