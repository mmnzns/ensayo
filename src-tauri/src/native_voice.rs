//! The interviewer's voice, second engine: the computer's own speech, run as a child process the backend can stop.
//!
//! The app's browser engine (speechSynthesis) does not speak in every webview, so Ensayo falls back to the system:
//! macOS `say`; Windows speaks in this process through Windows.Media.SpeechSynthesis (the voices Narrator and the
//! Settings voice list use, more than System.Speech sees), with PowerShell and System.Speech only as the fallback when
//! that cannot start. The text being read is never put inside a shell string or inside a script. macOS gets it on
//! stdin; Windows hands it straight to the speech API, and the PowerShell fallback gets it in an environment variable
//! that a fixed script reads. Every child is started with `std::process::Command` and explicit arguments, so a
//! question containing quotes, semicolons, `$()` or backticks stays plain text.
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

/// Windows.Media.SpeechSynthesis `SpeakingRate` from the same multiplier. The API takes a multiplier too (0.5 to 6,
/// 1 is normal), so it passes straight through; past 3 nobody can follow a question.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub fn winrt_speaking_rate(rate: f64) -> f64 {
    if rate.is_finite() && rate > 0.0 { rate.clamp(0.5, 3.0) } else { 1.0 }
}

/// Which voice to speak with. `saved` is what Settings stored: an id from the old engine or from this one. An exact
/// match wins, then the same name ignoring case, then the old System.Speech names ("Microsoft David Desktop") against
/// the new ones ("Microsoft David"). None means no match, so the caller keeps the system's default voice.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub fn resolve_voice<'a>(saved: &str, voices: &'a [NativeVoice]) -> Option<&'a NativeVoice> {
    let wanted = saved.trim();
    if wanted.is_empty() {
        return None;
    }
    let plain = |s: &str| -> String {
        let t = s.trim().to_lowercase();
        t.strip_suffix(" desktop").map(str::to_string).unwrap_or(t)
    };
    voices
        .iter()
        .find(|v| v.id == wanted)
        .or_else(|| voices.iter().find(|v| v.id.eq_ignore_ascii_case(wanted) || v.name.eq_ignore_ascii_case(wanted)))
        .or_else(|| voices.iter().find(|v| plain(&v.name) == plain(wanted)))
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
    #[cfg(target_os = "windows")]
    winrt::stop();
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
        #[cfg(target_os = "windows")]
        match winrt::voices() {
            Ok(v) if !v.is_empty() => return Ok(v),
            Ok(_) => log::warn!("the Windows speech API listed no voices; asking PowerShell"),
            Err(e) => log::warn!("the Windows speech API did not start ({e}); asking PowerShell"),
        }
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
        #[cfg(target_os = "windows")]
        match winrt::speak(text, voice_id, rate) {
            Ok(outcome) => return Ok(outcome),
            Err(e) => log::warn!("the Windows speech API could not read the line ({e}); using PowerShell"),
        }
        run(&powershell_spec(text, voice_id, rate))
    } else {
        Err("This computer has no system voice Ensayo can use.".to_string())
    }
}

// ---------- Windows: in-process speech ----------

#[cfg(target_os = "windows")]
mod winrt {
    use super::{clean_text, resolve_voice, valid_voice_id, winrt_speaking_rate, NativeVoice, Outcome};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::mpsc::{channel, Sender};
    use std::sync::{Mutex, MutexGuard, Once};
    use windows::core::{Error, Interface, Ref, HSTRING};
    use windows::Foundation::TypedEventHandler;
    use windows::Media::Core::MediaSource;
    use windows::Media::Playback::{MediaPlayer, MediaPlayerFailedEventArgs};
    use windows::Media::SpeechSynthesis::{SpeechSynthesizer, VoiceInformation};
    use windows::Storage::Streams::IRandomAccessStream;
    use windows::Win32::System::Com::CoIncrementMTAUsage;

    /// Why a line ended, as the player reports it.
    enum Ended {
        Finished,
        Stopped,
        Failed(String),
    }

    type Line = (u64, Sender<Ended>, MediaPlayer);

    /// The line being read: its number, the way to wake its waiter, and its player.
    static CURRENT: Mutex<Option<Line>> = Mutex::new(None);
    static NEXT: AtomicU64 = AtomicU64::new(1);

    fn slot() -> MutexGuard<'static, Option<Line>> {
        CURRENT.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn text(e: Error) -> String {
        e.message()
    }

    /// Makes this process's threads usable for WinRT calls (the multithreaded apartment), once.
    fn init() {
        static ONCE: Once = Once::new();
        // Failing only means the apartment was already set up another way, which works too.
        ONCE.call_once(|| {
            let _ = unsafe { CoIncrementMTAUsage() };
        });
    }

    fn installed() -> Result<Vec<VoiceInformation>, String> {
        init();
        Ok(SpeechSynthesizer::AllVoices().map_err(text)?.into_iter().collect())
    }

    fn as_native(v: &VoiceInformation) -> Option<NativeVoice> {
        let name = v.DisplayName().ok()?.to_string();
        let language = v.Language().map(|l| l.to_string()).unwrap_or_default();
        valid_voice_id(&name).then(|| NativeVoice { id: name.clone(), name, language })
    }

    /// The installed voices, named as the Settings voice list names them, each once.
    pub fn voices() -> Result<Vec<NativeVoice>, String> {
        let mut out: Vec<NativeVoice> = Vec::new();
        for v in installed()? {
            if let Some(n) = as_native(&v) {
                if !out.iter().any(|o| o.id == n.id) {
                    out.push(n);
                }
            }
        }
        Ok(out)
    }

    pub fn stop() {
        let taken = slot().take();
        if let Some((_, wake, player)) = taken {
            let _ = wake.send(Ended::Stopped);
            let _ = player.Pause();
            let _ = player.Close();
        }
    }

    /// Makes the speech, plays it, and waits until it ends or is stopped. Err when the API could not start or make
    /// the speech, so the caller can try PowerShell.
    pub fn speak(line: &str, voice_id: &str, rate: f64) -> Result<Outcome, String> {
        stop();
        init();
        let synth = SpeechSynthesizer::new().map_err(text)?;
        if valid_voice_id(voice_id) {
            let all = installed()?;
            let known: Vec<(NativeVoice, &VoiceInformation)> = all.iter().filter_map(|v| as_native(v).map(|n| (n, v))).collect();
            let names: Vec<NativeVoice> = known.iter().map(|(n, _)| n.clone()).collect();
            // An id nothing matches (a voice from another computer or engine) keeps the default voice.
            if let Some(found) = resolve_voice(voice_id, &names) {
                if let Some((_, info)) = known.iter().find(|(n, _)| n.id == found.id) {
                    let _ = synth.SetVoice(*info);
                }
            }
        }
        if let Ok(options) = synth.Options() {
            let _ = options.SetSpeakingRate(winrt_speaking_rate(rate));
        }
        let stream = synth.SynthesizeTextToStreamAsync(&HSTRING::from(clean_text(line))).map_err(text)?.join().map_err(text)?;
        let content_type = stream.ContentType().map_err(text)?;
        let source = MediaSource::CreateFromStream(&stream.cast::<IRandomAccessStream>().map_err(text)?, &content_type).map_err(text)?;

        let (wake, waiter) = channel::<Ended>();
        let player = MediaPlayer::new().map_err(text)?;
        let on_end = wake.clone();
        player
            .MediaEnded(&TypedEventHandler::new(move |_, _| {
                let _ = on_end.send(Ended::Finished);
                Ok(())
            }))
            .map_err(text)?;
        let on_fail = wake.clone();
        player
            .MediaFailed(&TypedEventHandler::new(move |_, args: Ref<MediaPlayerFailedEventArgs>| {
                let why = args.as_ref().and_then(|a| a.ErrorMessage().ok()).map(|m| m.to_string()).unwrap_or_default();
                let _ = on_fail.send(Ended::Failed(why));
                Ok(())
            }))
            .map_err(text)?;
        player.SetSource(&source).map_err(text)?;

        let mine = NEXT.fetch_add(1, Ordering::SeqCst);
        {
            let mut s = slot();
            if let Some((_, old_wake, old)) = s.take() {
                let _ = old_wake.send(Ended::Stopped);
                let _ = old.Close();
            }
            *s = Some((mine, wake, player.clone()));
        }
        player.Play().map_err(text)?;
        let ended = waiter.recv().unwrap_or(Ended::Stopped);
        {
            let mut s = slot();
            if s.as_ref().is_some_and(|(n, _, _)| *n == mine) {
                *s = None;
            }
        }
        let _ = player.Close();
        match ended {
            Ended::Finished => Ok(Outcome::Finished),
            Ended::Stopped => Ok(Outcome::Stopped),
            Ended::Failed(why) => Err(format!("playback failed: {why}")),
        }
    }

    /// Lists the voices and reads one short line three ways. By hand:
    /// `cargo test --manifest-path src-tauri/Cargo.toml winrt_voices_smoke -- --ignored --nocapture`
    #[cfg(test)]
    #[test]
    #[ignore]
    fn winrt_voices_smoke() {
        let t = std::time::Instant::now();
        let v = voices().expect("the Windows speech API starts");
        eprintln!("{} voices in {:?}", v.len(), t.elapsed());
        for n in &v {
            eprintln!("  {} ({})", n.id, n.language);
        }
        assert!(!v.is_empty());
        let first_voice = v[0].id.clone();
        for (label, id) in [("default voice", String::new()), ("first listed voice", first_voice), ("old System.Speech id", "Microsoft Zira Desktop".to_string())] {
            let t = std::time::Instant::now();
            let outcome = speak("Tell me about a time you changed your mind.", &id, 1.0).expect("it speaks");
            eprintln!("{label}: {outcome:?}, {:?} from start to end of the line", t.elapsed());
        }
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
    fn windows_speaking_rate_follows_the_setting() {
        assert_eq!(winrt_speaking_rate(1.0), 1.0);
        assert_eq!(winrt_speaking_rate(0.85), 0.85);
        assert_eq!(winrt_speaking_rate(1.2), 1.2);
        assert_eq!(winrt_speaking_rate(f64::NAN), 1.0);
        assert_eq!(winrt_speaking_rate(-2.0), 1.0);
        assert_eq!(winrt_speaking_rate(0.01), 0.5);
        assert_eq!(winrt_speaking_rate(50.0), 3.0);
    }

    fn voice(name: &str) -> NativeVoice {
        NativeVoice { id: name.into(), name: name.into(), language: "en-US".into() }
    }

    #[test]
    fn a_saved_voice_resolves_across_engines_or_falls_back_to_the_default() {
        let list = [voice("Microsoft David"), voice("Microsoft Zira"), voice("Microsoft Aria Online (Natural)")];
        let pick = |saved: &str| resolve_voice(saved, &list).map(|v| v.id.as_str());
        assert_eq!(pick("Microsoft Zira"), Some("Microsoft Zira"));
        assert_eq!(pick("microsoft zira"), Some("Microsoft Zira"));
        // Ids saved by the System.Speech engine.
        assert_eq!(pick("Microsoft Zira Desktop"), Some("Microsoft Zira"));
        assert_eq!(pick("  Microsoft David Desktop "), Some("Microsoft David"));
        // Gone, or never on this computer: the default voice.
        assert_eq!(pick("Microsoft Hazel Desktop"), None);
        assert_eq!(pick(""), None);
        assert_eq!(pick("Samantha"), None);
        assert_eq!(resolve_voice("Microsoft David", &[]), None);
    }

    #[test]
    fn an_exact_voice_id_beats_a_looser_match() {
        let list = [voice("Microsoft Zira Desktop"), voice("Microsoft Zira")];
        assert_eq!(resolve_voice("Microsoft Zira", &list).map(|v| v.id.as_str()), Some("Microsoft Zira"));
        assert_eq!(resolve_voice("Microsoft Zira Desktop", &list).map(|v| v.id.as_str()), Some("Microsoft Zira Desktop"));
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

    /// Real child processes. Windows has no cat, false, true or sleep, so it uses `findstr`, `cmd` and `ping`.
    mod running {
        use super::*;
        use std::sync::Mutex;
        use std::time::Instant;

        /// Echoes stdin to nowhere and ends when stdin closes.
        fn cat() -> Spec {
            if cfg!(windows) { spec("findstr", &["^"], Some("")) } else { spec("cat", &[], Some("")) }
        }
        fn exits(code: &str) -> Spec {
            if cfg!(windows) { spec("cmd", &["/C", &format!("exit {code}")], None) } else { spec(if code == "0" { "true" } else { "false" }, &[], None) }
        }
        /// A child that stays alive for about 30 seconds unless it is killed.
        fn sleeper() -> Spec {
            if cfg!(windows) { spec("ping", &["-n", "31", "127.0.0.1"], None) } else { spec("sleep", &["30"], None) }
        }
        fn with_stdin(text: &str) -> Spec {
            Spec { stdin: Some(text.into()), ..cat() }
        }

        // The current line is one shared slot, so these run one at a time.
        static ONE_AT_A_TIME: Mutex<()> = Mutex::new(());

        fn spec(program: &str, args: &[&str], stdin: Option<&str>) -> Spec {
            Spec { program: program.into(), args: args.iter().map(|s| s.to_string()).collect(), env: vec![], stdin: stdin.map(String::from) }
        }

        #[test]
        fn a_line_that_ends_is_finished() {
            let _g = ONE_AT_A_TIME.lock().unwrap_or_else(|e| e.into_inner());
            assert_eq!(run(&with_stdin("some text")), Ok(Outcome::Finished));
        }

        #[test]
        fn a_failing_or_missing_program_is_an_error_so_the_caller_can_fall_back() {
            let _g = ONE_AT_A_TIME.lock().unwrap_or_else(|e| e.into_inner());
            assert!(run(&exits("1")).is_err());
            assert!(run(&spec("ensayo-no-such-program", &[], None)).is_err());
        }

        #[test]
        fn stop_kills_the_child_and_ends_the_wait() {
            let _g = ONE_AT_A_TIME.lock().unwrap_or_else(|e| e.into_inner());
            let waiter = std::thread::spawn(|| run(&sleeper()));
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
            let first = std::thread::spawn(|| run(&sleeper()));
            std::thread::sleep(Duration::from_millis(300));
            assert_eq!(run(&exits("0")), Ok(Outcome::Finished));
            assert_eq!(first.join().unwrap(), Ok(Outcome::Stopped));
        }

        #[test]
        fn hostile_text_on_stdin_is_just_text() {
            let _g = ONE_AT_A_TIME.lock().unwrap_or_else(|e| e.into_inner());
            // the reader echoes nothing anywhere useful; the point is that nothing is interpreted and the child ends cleanly.
            let marker = std::env::temp_dir().join("ensayo-voice-hostile-marker");
            let _ = std::fs::remove_file(&marker);
            let text = format!("$(touch {m}) `touch {m}` ; touch {m} & echo hi > {m} | echo %PATH%", m = marker.display());
            assert_eq!(run(&with_stdin(&text)), Ok(Outcome::Finished));
            assert!(!marker.exists());
        }
    }
}
