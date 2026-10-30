//! The real helper binary, without a model: it answers a ping with the engine's protocol version and exits when the
//! app closes its end (the app quit or crashed). Everything else the helper does is the engine's own tests.

use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

fn spawn() -> std::process::Child {
    Command::new(env!("CARGO_BIN_EXE_ensayo-llm"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap()
}

fn wait_exit(child: &mut std::process::Child, within: Duration) -> Option<std::process::ExitStatus> {
    let deadline = Instant::now() + within;
    while Instant::now() < deadline {
        if let Some(s) = child.try_wait().unwrap() {
            return Some(s);
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    None
}

#[test]
fn it_answers_a_ping_and_exits_when_stdin_closes() {
    let mut child = spawn();
    let mut stdin = child.stdin.take().unwrap();
    let mut out = BufReader::new(child.stdout.take().unwrap());
    writeln!(stdin, r#"{{"op":"ping"}}"#).unwrap();
    let mut line = String::new();
    out.read_line(&mut line).unwrap();
    assert!(line.contains(r#""event":"ready""#) && line.contains(r#""protocol":2"#), "{line}");
    drop(stdin);
    let status = wait_exit(&mut child, Duration::from_secs(20));
    assert!(status.is_some_and(|s| s.success()), "the helper must exit when the app is gone");
    let _ = child.kill();
}
