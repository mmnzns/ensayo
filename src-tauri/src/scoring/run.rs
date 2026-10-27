//! One model call that must return JSON matching a schema: render the prompt, call, strip fences and thinking,
//! validate, and on a bad reply ask once more with the problem named. A second bad reply is the caller's cue to fall
//! back to rules-only for that rep (`prompts/README.md`, convention 5).

use super::prompts::Prompt;
use super::template::Vars;
use crate::ai::cost::Spend;
use crate::ai::json::extract_json;
use crate::ai::llm::{Llm, LlmReply, LlmRequest};
use crate::ai::providers::{AiError, Provider};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq)]
pub enum CallError {
    /// Cannot run at all right now (no key, key rejected, no such model, server not running).
    Unavailable(String),
    /// The call failed after its retries (network, rate limit).
    Failed(String),
    /// The model answered twice without valid JSON for the schema.
    Invalid(String),
    /// The session's estimated cost reached the cap set in Settings: what it had spent, and the cap, in US dollars.
    CapReached { spent: f64, cap: f64 },
}

/// What a rep keeps when the AI can't judge it, and what it loses.
const TIMING_ONLY: &str = "This answer got the measured checks only: the number, the stop, the length and filler words. Answering first, ownership and story fit weren't judged, and there's no coach note.";

impl CallError {
    /// A plain-words line for the screen when the rep falls back to timing only.
    pub fn notice(&self) -> String {
        match self {
            CallError::Unavailable(m) | CallError::Failed(m) => format!("{m} {TIMING_ONLY}"),
            CallError::Invalid(_) => format!("The AI answered twice in a shape Ensayo couldn't read. {TIMING_ONLY} Try the next answer; if it keeps happening, choose another model in Settings › AI."),
            CallError::CapReached { .. } => format!("{} {TIMING_ONLY} The rest of this session works the same way.", self.cap_words()),
        }
    }

    /// How much of the limit the session spent, and where to raise it. The spend is an estimate.
    pub fn cap_words(&self) -> String {
        match self {
            CallError::CapReached { spent, cap } => format!("This session has spent about ${spent:.2} of its ${cap:.2} limit, and the next AI step would go over it. Raise the limit in Settings › AI."),
            _ => String::new(),
        }
    }
}

/// What a session has spent, and what it may spend.
pub struct Budget {
    pub spend: Spend,
    /// 0 means no cap.
    pub cap_usd: f64,
    pub provider: Provider,
}

impl Budget {
    pub fn new(provider: Provider, cap_usd: f64) -> Budget {
        Budget { spend: Spend::default(), cap_usd, provider }
    }

    fn check(&self) -> Result<(), CallError> {
        if self.cap_usd > 0.0 && self.spend.would_exceed(self.cap_usd) {
            Err(CallError::CapReached { spent: self.spend.usd, cap: self.cap_usd })
        } else {
            Ok(())
        }
    }
}

#[derive(Debug)]
pub struct Called {
    pub value: Value,
}

fn validate(schema: &Value, value: &Value) -> Result<(), String> {
    let validator = jsonschema::validator_for(schema).map_err(|e| format!("bad schema: {e}"))?;
    let problems: Vec<String> = validator.iter_errors(value).take(8).map(|e| format!("{} (at {})", e, e.instance_path)).collect();
    if problems.is_empty() {
        Ok(())
    } else {
        Err(problems.join("; "))
    }
}

fn from_ai(e: AiError) -> CallError {
    match e {
        AiError::Unavailable(m) => CallError::Unavailable(m),
        AiError::Failed(m) => CallError::Failed(m),
    }
}

/// The system prompt with the reply's JSON Schema after it. The prompts describe the fields in prose; without the
/// schema itself a model guesses names and allowed values (GPT-6 replies to the resume and posting reads were refused
/// for exactly that), so every call carries it.
fn with_schema(system: &str, schema: &Value) -> String {
    format!(
        "{system}\n\n## Reply format\n\nReply with one JSON object that matches this JSON Schema exactly: the same field names, every required field, no other fields, and only the allowed values where a field lists them.\n\n{}",
        serde_json::to_string(schema).unwrap_or_default()
    )
}

pub fn call_json(llm: &dyn Llm, prompt: &Prompt, vars: &Vars, max_tokens: u32, budget: &mut Budget) -> Result<Called, CallError> {
    let (system, user) = prompt.render(vars);
    let system = with_schema(&system, &prompt.schema);
    let mut last = String::new();
    for attempt in 0..2 {
        budget.check()?;
        let user = if attempt == 0 { user.clone() } else { format!("{user}\n\nYour last reply was rejected: {last}. Return only one JSON object that matches the JSON Schema in the reply format: its field names, required fields and allowed values.") };
        let reply: LlmReply = llm.complete(&LlmRequest { system: system.clone(), user, json: true, max_tokens, tier: prompt.tier }).map_err(from_ai)?;
        budget.spend.add_from(budget.provider, &reply);
        let mut value = match extract_json(&reply.text) {
            Ok(v) => v,
            Err(e) => {
                log::warn!("{} reply rejected (attempt {}): no JSON object in it", prompt.id, attempt + 1);
                last = e;
                continue;
            }
        };
        match validate(&prompt.schema, &value) {
            Ok(()) => return Ok(Called { value }),
            // Only too long or too many: keep it (lists cut to their limit) rather than lose the whole reply.
            Err(_) if validate(&without_size_limits(&prompt.schema), &value).is_ok() => {
                clip_lists(&prompt.schema, &mut value);
                log::info!("{} reply kept past its length limits", prompt.id);
                return Ok(Called { value });
            }
            Err(e) => {
                log::warn!("{} reply rejected (attempt {}): {}", prompt.id, attempt + 1, problem_places(&prompt.schema, &value));
                last = e;
            }
        }
    }
    Err(CallError::Invalid(last))
}

/// The schemas cap text length and list size to keep replies tidy. A verbose model (GPT-6 Luna reading a long story)
/// broke a `maxLength` on both tries and the whole read failed, so a reply that breaks only those is kept instead.
fn without_size_limits(schema: &Value) -> Value {
    match schema {
        Value::Object(map) => Value::Object(
            map.iter().filter(|(k, _)| k.as_str() != "maxLength" && k.as_str() != "maxItems").map(|(k, v)| (k.clone(), without_size_limits(v))).collect(),
        ),
        Value::Array(items) => Value::Array(items.iter().map(without_size_limits).collect()),
        other => other.clone(),
    }
}

/// Cuts each list down to its `maxItems`, following `properties` and `items`. Long text is left whole.
fn clip_lists(schema: &Value, value: &mut Value) {
    match value {
        Value::Array(items) => {
            if let Some(max) = schema.get("maxItems").and_then(Value::as_u64) {
                items.truncate(max as usize);
            }
            if let Some(item_schema) = schema.get("items") {
                for item in items.iter_mut() {
                    clip_lists(item_schema, item);
                }
            }
        }
        Value::Object(map) => {
            if let Some(Value::Object(props)) = schema.get("properties") {
                for (k, v) in map.iter_mut() {
                    if let Some(s) = props.get(k) {
                        clip_lists(s, v);
                    }
                }
            }
        }
        _ => {}
    }
}

/// Where a reply broke the schema, as schema rules and field paths only: never the reply's text, which can hold the
/// user's words (the log never does).
fn problem_places(schema: &Value, value: &Value) -> String {
    let Ok(validator) = jsonschema::validator_for(schema) else { return "bad schema".into() };
    let places: Vec<String> = validator.iter_errors(value).take(4).map(|e| format!("{} at {}", e.schema_path, e.instance_path)).collect();
    places.join("; ")
}

#[cfg(test)]
pub mod testing {
    use super::*;
    use std::collections::VecDeque;
    use std::sync::Mutex;

    /// Replies in order; records every request.
    pub struct Scripted {
        pub replies: Mutex<VecDeque<Result<String, AiError>>>,
        pub seen: Mutex<Vec<LlmRequest>>,
    }

    impl Scripted {
        pub fn new(replies: Vec<Result<&str, AiError>>) -> Scripted {
            Scripted { replies: Mutex::new(replies.into_iter().map(|r| r.map(String::from)).collect()), seen: Mutex::new(vec![]) }
        }
        pub fn calls(&self) -> usize {
            self.seen.lock().unwrap().len()
        }
    }

    impl Llm for Scripted {
        fn complete(&self, req: &LlmRequest) -> Result<LlmReply, AiError> {
            self.seen.lock().unwrap().push(req.clone());
            let next = self.replies.lock().unwrap().pop_front().expect("the script ran out of replies");
            next.map(|text| LlmReply { text, input_tokens: 1000, output_tokens: 200, model: "claude-haiku-5-5".into() })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::testing::Scripted;
    use super::*;
    use crate::scoring::prompts::{get, PromptId};

    const GOOD: &str = r#"{"type":"technical","behavioral_situation":null,"commitment_check":false,"builder_operator_check":false,"is_major_story":true,"competencies":["technical depth"]}"#;

    fn vars() -> Vars {
        Vars::new().set("question", "Have you done a behavioral implementation in Braze?")
    }

    fn budget() -> Budget {
        Budget::new(Provider::Claude, 0.0)
    }

    #[test]
    fn a_valid_reply_is_returned_and_counted() {
        let llm = Scripted::new(vec![Ok(GOOD)]);
        let mut b = budget();
        let out = call_json(&llm, get(PromptId::Classify), &vars(), 400, &mut b).unwrap();
        assert_eq!(out.value["type"], "technical");
        assert_eq!(b.spend.calls, 1);
        assert_eq!(b.spend.input_tokens, 1000);
    }

    #[test]
    fn fences_and_thinking_around_the_json_are_fine() {
        let reply = format!("<think>hmm</think>\n```json\n{GOOD}\n```");
        let llm = Scripted::new(vec![Ok(&reply)]);
        assert!(call_json(&llm, get(PromptId::Classify), &vars(), 400, &mut budget()).is_ok());
    }

    #[test]
    fn invalid_json_is_retried_once_with_the_problem_named() {
        let llm = Scripted::new(vec![Ok("Sure! Here is the classification:"), Ok(GOOD)]);
        let out = call_json(&llm, get(PromptId::Classify), &vars(), 400, &mut budget()).unwrap();
        assert_eq!(out.value["type"], "technical");
        let seen = llm.seen.lock().unwrap();
        assert_eq!(seen.len(), 2);
        assert!(seen[1].user.contains("Your last reply was rejected"));
        assert!(!seen[0].user.contains("rejected"));
    }

    #[test]
    fn every_call_shows_the_model_the_schema_it_must_match() {
        let llm = Scripted::new(vec![Ok(GOOD)]);
        call_json(&llm, get(PromptId::Classify), &vars(), 400, &mut budget()).unwrap();
        let system = llm.seen.lock().unwrap()[0].system.clone();
        assert!(system.contains("## Reply format"));
        assert!(system.contains("\"behavioral_situation\"") && system.contains("\"required\""), "the schema itself, with its field names");
    }

    #[test]
    fn json_that_breaks_the_schema_is_retried_too() {
        let wrong = r#"{"type":"nonsense"}"#;
        let llm = Scripted::new(vec![Ok(wrong), Ok(GOOD)]);
        assert!(call_json(&llm, get(PromptId::Classify), &vars(), 400, &mut budget()).is_ok());
        assert!(llm.seen.lock().unwrap()[1].user.contains("rejected"));
    }

    #[test]
    fn two_bad_replies_in_a_row_are_invalid_and_stop_there() {
        let llm = Scripted::new(vec![Ok("nope"), Ok("still nope")]);
        let err = call_json(&llm, get(PromptId::Classify), &vars(), 400, &mut budget()).unwrap_err();
        assert!(matches!(err, CallError::Invalid(_)), "{err:?}");
        assert_eq!(llm.calls(), 2);
        assert!(err.notice().contains("measured checks only") && err.notice().contains("Settings › AI"));
    }

    #[test]
    fn no_key_or_no_server_is_unavailable_and_not_retried() {
        let llm = Scripted::new(vec![Err(AiError::Unavailable("Claude didn't accept the API key. Check it in Settings › AI.".into()))]);
        let err = call_json(&llm, get(PromptId::Classify), &vars(), 400, &mut budget()).unwrap_err();
        assert_eq!(err, CallError::Unavailable("Claude didn't accept the API key. Check it in Settings › AI.".into()));
        assert_eq!(llm.calls(), 1);
        assert!(err.notice().contains("Answering first, ownership and story fit weren't judged"));
    }

    #[test]
    fn the_spending_cap_stops_the_next_call_before_it_starts() {
        let llm = Scripted::new(vec![Ok(GOOD)]);
        let mut b = Budget::new(Provider::Claude, 0.25);
        b.spend.usd = 0.30;
        assert_eq!(call_json(&llm, get(PromptId::Classify), &vars(), 400, &mut b).unwrap_err(), CallError::CapReached { spent: 0.30, cap: 0.25 });
        assert_eq!(llm.calls(), 0);
        let mut free = Budget::new(Provider::Claude, 0.0);
        free.spend.usd = 99.0;
        assert!(call_json(&Scripted::new(vec![Ok(GOOD)]), get(PromptId::Classify), &vars(), 400, &mut free).is_ok(), "0 means no cap");
    }
}
