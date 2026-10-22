//! Messages between Ensayo and its built-in local AI helper (`ensayo-llm`). One JSON object per line on stdin
//! (requests) and stdout (events). The helper runs one request at a time. Adapted from Talaan's helper protocol
//! (Miguel's own MIT code), reduced to what Ensayo uses: a ping and a completion, on the processor or Metal.

use serde::{Deserialize, Serialize};

/// A JSON object with any keys: the grammar that keeps a reply parseable when the caller has no schema of its own.
pub const JSON_OBJECT_SCHEMA: &str = r#"{"type":"object"}"#;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum Request {
    /// Answers with `Event::Ready`. Used to check the helper started.
    Ping,
    /// Generates one reply. The model stays loaded for the next request with the same path and context size.
    Complete(Completion),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Completion {
    pub model_path: String,
    /// Context size in tokens (prompt + reply).
    pub n_ctx: u32,
    pub system: String,
    pub user: String,
    /// When set, the reply is constrained to JSON matching this schema (llama.cpp grammar).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub json_schema: Option<String>,
    pub max_tokens: u32,
    pub temperature: f32,
}

/// What a helper runs on, reported when it says it's ready.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct Backend {
    /// `metal` on the Mac, `cpu` otherwise. Empty from a fake helper that says only `ready`.
    #[serde(default)]
    pub backend: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum Event {
    Ready {
        #[serde(flatten)]
        backend: Backend,
    },
    /// Loading the model, reading the prompt (`done` of `total` tokens), then writing (`done` tokens, `total` 0).
    Progress { phase: Phase, done: u32, total: u32 },
    Done(Reply),
    Error { message: String },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Loading,
    Reading,
    Writing,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Reply {
    pub text: String,
    pub prompt_tokens: u32,
    pub output_tokens: u32,
    pub seconds: f32,
    /// True when the reply stopped at `max_tokens` instead of finishing.
    pub truncated: bool,
}

/// One message as one line (no newline inside: JSON escapes the ones in the text).
pub fn encode<T: Serialize>(msg: &T) -> String {
    serde_json::to_string(msg).expect("protocol messages always serialize")
}

/// Reads one request line. A UTF-8 byte order mark (a file piped in by hand) isn't part of the request.
pub fn decode_request(line: &str) -> Result<Request, serde_json::Error> {
    serde_json::from_str(line.trim_start_matches('\u{feff}').trim())
}

/// Reads one event line.
pub fn decode_event(line: &str) -> Result<Event, serde_json::Error> {
    serde_json::from_str(line.trim())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn completion() -> Completion {
        Completion {
            model_path: "/m.gguf".into(),
            n_ctx: 8192,
            system: "s".into(),
            user: "line one\nline two \"quoted\" \u{2192} caf\u{e9}".into(),
            json_schema: Some(JSON_OBJECT_SCHEMA.into()),
            max_tokens: 100,
            temperature: 0.0,
        }
    }

    #[test]
    fn a_request_is_one_line_and_round_trips_with_its_text_intact() {
        let req = Request::Complete(completion());
        let line = encode(&req);
        assert!(!line.contains('\n'), "{line}");
        assert!(line.contains("\"op\":\"complete\""));
        assert_eq!(decode_request(&line).unwrap(), req);
        assert_eq!(encode(&Request::Ping), r#"{"op":"ping"}"#);
        assert_eq!(decode_request(r#"{"op":"ping"}"#).unwrap(), Request::Ping);
    }

    #[test]
    fn every_event_round_trips_as_one_line() {
        let events = [
            Event::Ready { backend: Backend { backend: "metal".into() } },
            Event::Progress { phase: Phase::Reading, done: 5, total: 10 },
            Event::Progress { phase: Phase::Loading, done: 0, total: 0 },
            Event::Done(Reply { text: "{\"a\":\n1}".into(), prompt_tokens: 12, output_tokens: 3, seconds: 0.5, truncated: false }),
            Event::Error { message: "the AI model failed".into() },
        ];
        for ev in events {
            let line = encode(&ev);
            assert!(!line.contains('\n'), "{line}");
            assert_eq!(decode_event(&line).unwrap(), ev);
        }
        assert_eq!(encode(&Event::Ready { backend: Backend { backend: "cpu".into() } }), r#"{"event":"ready","backend":"cpu"}"#);
    }

    #[test]
    fn a_bare_ready_from_a_fake_helper_still_reads() {
        let Event::Ready { backend } = decode_event(r#"{"event":"ready"}"#).unwrap() else { panic!() };
        assert_eq!(backend, Backend::default());
    }

    #[test]
    fn the_schema_is_left_out_when_there_is_none() {
        let line = encode(&Request::Complete(Completion { json_schema: None, ..completion() }));
        assert!(!line.contains("json_schema"), "{line}");
        let Request::Complete(c) = decode_request(&line).unwrap() else { panic!() };
        assert_eq!(c.json_schema, None);
    }

    #[test]
    fn a_byte_order_mark_and_blank_edges_are_ignored_and_garbage_is_an_error() {
        assert_eq!(decode_request("\u{feff}{\"op\":\"ping\"}  ").unwrap(), Request::Ping);
        assert!(decode_request("not json").is_err());
        assert!(decode_request(r#"{"op":"unknown"}"#).is_err());
        assert!(decode_event("").is_err());
    }
}
