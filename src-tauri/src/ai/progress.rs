//! The `ai-progress` event: tells the window an AI step is running, so the screen can show it is alive and how far a
//! local answer has come. The payload is `{ step, tokens, elapsed_ms }` and never carries text: `step` is a prompt id or
//! "ai", `tokens` is how many the local model has written (null when unknown).

use crate::graphics;
use serde::Serialize;
use tauri::Emitter;

/// Progress events go out at most this often.
pub const MIN_GAP_MS: u64 = 250;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Progress {
    pub step: String,
    pub tokens: Option<u32>,
    pub elapsed_ms: u64,
}

/// Lets an event through when at least `MIN_GAP_MS` have passed since the last one it let through (at most four a
/// second). The clock is passed in, so a test can use a fake one.
#[derive(Debug, Default)]
pub struct Throttle {
    last: Option<u64>,
}

impl Throttle {
    pub fn new() -> Throttle {
        Throttle { last: None }
    }

    /// True when an event at `now_ms` (milliseconds on any steady clock) may be sent.
    pub fn ready(&mut self, now_ms: u64) -> bool {
        if self.last.is_some_and(|last| now_ms.saturating_sub(last) < MIN_GAP_MS) {
            return false;
        }
        self.last = Some(now_ms);
        true
    }
}

/// Sends one `ai-progress` event to the window. Does nothing before the app has started (tests).
pub fn emit(step: &str, tokens: Option<u32>, elapsed_ms: u64) {
    if let Some(app) = graphics::app() {
        let _ = app.emit("ai-progress", Progress { step: step.to_string(), tokens, elapsed_ms });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn at_most_four_events_a_second_get_through() {
        let mut t = Throttle::new();
        // An event every 10 ms for five seconds.
        let sent: Vec<u64> = (0..5000).step_by(10).filter(|ms| t.ready(*ms)).collect();
        for second in 0..5 {
            let n = sent.iter().filter(|ms| **ms / 1000 == second).count();
            assert!(n <= 4, "second {second}: {n}");
        }
        assert_eq!(sent[0], 0, "the first one goes at once");
        assert_eq!(sent.len(), 20);
    }

    #[test]
    fn a_slow_trickle_is_not_held_back() {
        let mut t = Throttle::new();
        assert!(t.ready(0) && t.ready(300) && t.ready(900));
        assert!(!t.ready(1000));
    }

    #[test]
    fn the_payload_has_no_text_field() {
        let v = serde_json::to_value(Progress { step: "classify".into(), tokens: None, elapsed_ms: 5 }).unwrap();
        let mut keys: Vec<&str> = v.as_object().unwrap().keys().map(String::as_str).collect();
        keys.sort();
        assert_eq!(keys, ["elapsed_ms", "step", "tokens"]);
        assert!(v["tokens"].is_null());
    }
}
