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
    /// The model's reply was cut off at the token limit twice, even with double the room the second time.
    TooLong,
    /// The session's estimated cost reached the cap set in Settings: what it had spent, and the cap, in US dollars.
    CapReached { spent: f64, cap: f64 },
    /// The person pressed Stop. Never retried; the answer keeps its measured checks and nothing else is saved.
    Stopped,
}

/// What a read (story, posting, resume) returns to the screen when the person stopped the AI. The screen goes back to
/// the form with nothing saved and no error banner.
pub const STOPPED: &str = "stopped";

/// The line for an answer the person stopped the AI on.
const STOPPED_NOTICE: &str = "You stopped the AI. This answer got the measured checks only.";

/// The plain-words reason every screen gives when a reply was cut off twice.
pub const TOO_LONG: &str = "The AI's reply was too long to finish.";

/// What a rep keeps when the AI can't judge it, and what it loses.
const TIMING_ONLY: &str = "This answer got the measured checks only: the number, the stop, the length and filler words. Answering first, ownership and story fit weren't judged, and there's no coach note.";

impl CallError {
    /// A plain-words line for the screen when the rep falls back to timing only.
    pub fn notice(&self) -> String {
        match self {
            CallError::Unavailable(m) | CallError::Failed(m) => format!("{m} {TIMING_ONLY}"),
            CallError::Invalid(_) => format!("The AI answered twice in a shape Ensayo couldn't read. {TIMING_ONLY} Try the next answer; if it keeps happening, choose another model in Settings › AI."),
            CallError::TooLong => format!("{TOO_LONG} {TIMING_ONLY} Try the next answer; if it keeps happening, choose another model in Settings › AI."),
            CallError::CapReached { .. } => format!("{} {TIMING_ONLY} The rest of this session works the same way.", self.cap_words()),
            CallError::Stopped => STOPPED_NOTICE.to_string(),
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
        AiError::Stopped => CallError::Stopped,
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
    // Whether the previous reply was cut off at the token limit: the retry then gets twice the room.
    let mut cut_off = false;
    for attempt in 0..2 {
        budget.check()?;
        let limit = if cut_off { max_tokens.saturating_mul(2) } else { max_tokens };
        let user = if attempt == 0 {
            user.clone()
        } else if cut_off {
            format!("{user}\n\nYour last reply was cut off before it finished. Reply again with one JSON object that matches the JSON Schema in the reply format, and keep the text in each field short.")
        } else {
            format!("{user}\n\nYour last reply was rejected: {last}. Return only one JSON object that matches the JSON Schema in the reply format: its field names, required fields and allowed values.")
        };
        let reply: LlmReply = llm.complete(&LlmRequest { system: system.clone(), user, json: true, schema: Some(prompt.schema.clone()), max_tokens: limit, tier: prompt.tier, label: prompt.id.clone() }).map_err(from_ai)?;
        budget.spend.add_from(budget.provider, &reply);
        cut_off = reply.cut_off;
        let mut value = match extract_json(&reply.text) {
            Ok(v) => v,
            Err(e) => {
                log::warn!("{} reply rejected (attempt {}): no JSON object in it", prompt.id, attempt + 1);
                last = e;
                continue;
            }
        };
        drop_optional_nulls(&prompt.schema, &prompt.schema, &mut value);
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
    if cut_off {
        Err(CallError::TooLong)
    } else {
        Err(CallError::Invalid(last))
    }
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

// ---------- the schema as providers accept it ----------

/// Keywords the providers' structured-output modes reject (Claude, OpenAI strict and Gemini each refuse some of
/// these). Local validation still uses the full schema.
const PROVIDER_FORBIDDEN: &[&str] = &[
    "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minItems", "maxItems", "minLength", "maxLength", "pattern", "format", "$schema", "$id", "description",
];

/// Keys whose value is a map of name -> schema (the names are not keywords and are kept).
const SCHEMA_MAPS: &[&str] = &["properties", "$defs", "definitions"];
/// Keys whose value is one schema.
const SCHEMA_ONE: &[&str] = &["items", "additionalProperties", "not", "if", "then", "else"];
/// Keys whose value is a list of schemas.
const SCHEMA_LISTS: &[&str] = &["anyOf", "oneOf", "allOf", "prefixItems"];

fn is_object_schema(map: &serde_json::Map<String, Value>) -> bool {
    map.contains_key("properties")
        || match map.get("type") {
            Some(Value::String(t)) => t == "object",
            Some(Value::Array(ts)) => ts.iter().any(|t| t == "object"),
            _ => false,
        }
}

fn provider_node(schema: &Value) -> Value {
    let Value::Object(map) = schema else { return schema.clone() };
    let mut out = serde_json::Map::new();
    for (k, v) in map {
        if PROVIDER_FORBIDDEN.contains(&k.as_str()) {
            continue;
        }
        let value = if SCHEMA_MAPS.contains(&k.as_str()) {
            match v {
                Value::Object(m) => Value::Object(m.iter().map(|(name, s)| (name.clone(), provider_node(s))).collect()),
                other => other.clone(),
            }
        } else if SCHEMA_ONE.contains(&k.as_str()) {
            provider_node(v)
        } else if SCHEMA_LISTS.contains(&k.as_str()) {
            match v {
                Value::Array(items) => Value::Array(items.iter().map(provider_node).collect()),
                other => other.clone(),
            }
        } else {
            v.clone()
        };
        out.insert(k.clone(), value);
    }
    if is_object_schema(&out) {
        out.insert("additionalProperties".into(), Value::Bool(false));
    }
    Value::Object(out)
}

/// The schema a provider's structured-output mode accepts: no size or pattern rules, no documentation keywords, and
/// every object closed. The full schema is still checked locally.
pub fn provider_schema(schema: &Value) -> Value {
    provider_node(schema)
}

/// OpenAI strict mode: every property of every object is listed in `required`, and one that wasn't becomes
/// nullable. Returns None when the schema uses something strict mode can't take (a root that isn't an object, or
/// `oneOf`/`allOf`/`not`/`if`), so the caller sends `strict: false`.
pub fn openai_strict_schema(schema: &Value) -> Option<Value> {
    fn nullable(s: &Value) -> Value {
        let Value::Object(m) = s else { return s.clone() };
        let mut m = m.clone();
        match m.get("type").cloned() {
            Some(Value::String(t)) => {
                m.insert("type".into(), serde_json::json!([t, "null"]));
            }
            Some(Value::Array(mut ts)) => {
                if !ts.iter().any(|t| t == "null") {
                    ts.push("null".into());
                }
                m.insert("type".into(), Value::Array(ts));
            }
            _ => return serde_json::json!({ "anyOf": [Value::Object(m), { "type": "null" }] }),
        }
        if let Some(Value::Array(vals)) = m.get_mut("enum") {
            if !vals.iter().any(Value::is_null) {
                vals.push(Value::Null);
            }
        }
        Value::Object(m)
    }
    fn walk(s: &Value) -> Option<Value> {
        let Value::Object(map) = s else { return Some(s.clone()) };
        if ["oneOf", "allOf", "not", "if", "then", "else", "prefixItems"].iter().any(|k| map.contains_key(*k)) {
            return None;
        }
        let mut out = serde_json::Map::new();
        for (k, v) in map {
            let value = match k.as_str() {
                "properties" => {
                    let Value::Object(props) = v else { return None };
                    let required: Vec<&str> = map.get("required").and_then(Value::as_array).map(|r| r.iter().filter_map(Value::as_str).collect()).unwrap_or_default();
                    let mut new = serde_json::Map::new();
                    for (name, ps) in props {
                        let inner = walk(ps)?;
                        new.insert(name.clone(), if required.contains(&name.as_str()) { inner } else { nullable(&inner) });
                    }
                    Value::Object(new)
                }
                "$defs" | "definitions" => {
                    let Value::Object(defs) = v else { return None };
                    Value::Object(defs.iter().map(|(n, d)| walk(d).map(|d| (n.clone(), d))).collect::<Option<_>>()?)
                }
                "items" | "additionalProperties" => walk(v)?,
                "anyOf" => Value::Array(v.as_array()?.iter().map(walk).collect::<Option<_>>()?),
                "required" => continue,
                _ => v.clone(),
            };
            out.insert(k.clone(), value);
        }
        if let Some(Value::Object(props)) = out.get("properties") {
            out.insert("required".into(), Value::Array(props.keys().map(|k| Value::String(k.clone())).collect()));
        }
        Some(Value::Object(out))
    }
    if !is_object_schema(schema.as_object()?) {
        return None;
    }
    walk(schema)
}

/// Looks a `#/$defs/name` reference up in the root schema.
fn resolve_ref<'a>(root: &'a Value, schema: &'a Value) -> &'a Value {
    match schema.get("$ref").and_then(Value::as_str).and_then(|r| r.strip_prefix('#')) {
        Some(pointer) => root.pointer(pointer).unwrap_or(schema),
        None => schema,
    }
}

fn allows_null(root: &Value, schema: &Value) -> bool {
    let s = resolve_ref(root, schema);
    match s.get("type") {
        Some(Value::String(t)) => t == "null",
        Some(Value::Array(ts)) => ts.iter().any(|t| t == "null"),
        _ => s.get("enum").and_then(Value::as_array).is_some_and(|e| e.iter().any(Value::is_null)) || s.get("anyOf").and_then(Value::as_array).is_some_and(|a| a.iter().any(|x| allows_null(root, x))),
    }
}

/// OpenAI strict mode makes the model write every optional field, as null when it has nothing. The schemas say
/// "absent", not null, so a null in an optional field that doesn't allow null is dropped before the local check.
pub fn drop_optional_nulls(root: &Value, schema: &Value, value: &mut Value) {
    let schema = resolve_ref(root, schema);
    match value {
        Value::Array(items) => {
            if let Some(item_schema) = schema.get("items") {
                for item in items.iter_mut() {
                    drop_optional_nulls(root, item_schema, item);
                }
            }
        }
        Value::Object(map) => {
            let Some(Value::Object(props)) = schema.get("properties") else { return };
            let required: Vec<&str> = schema.get("required").and_then(Value::as_array).map(|r| r.iter().filter_map(Value::as_str).collect()).unwrap_or_default();
            map.retain(|k, v| !(v.is_null() && !required.contains(&k.as_str()) && props.get(k).is_some_and(|p| !allows_null(root, p))));
            for (k, v) in map.iter_mut() {
                if let Some(p) = props.get(k) {
                    drop_optional_nulls(root, p, v);
                }
            }
        }
        _ => {}
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
        pub replies: Mutex<VecDeque<Result<(String, bool), AiError>>>,
        pub seen: Mutex<Vec<LlmRequest>>,
    }

    impl Scripted {
        pub fn new(replies: Vec<Result<&str, AiError>>) -> Scripted {
            Scripted { replies: Mutex::new(replies.into_iter().map(|r| r.map(|t| (String::from(t), false))).collect()), seen: Mutex::new(vec![]) }
        }
        /// Replies that say whether the provider cut them off at the token limit.
        pub fn with_cut_offs(replies: Vec<(&str, bool)>) -> Scripted {
            Scripted { replies: Mutex::new(replies.into_iter().map(|(t, c)| Ok((String::from(t), c))).collect()), seen: Mutex::new(vec![]) }
        }
        pub fn calls(&self) -> usize {
            self.seen.lock().unwrap().len()
        }
    }

    impl Llm for Scripted {
        fn complete(&self, req: &LlmRequest) -> Result<LlmReply, AiError> {
            self.seen.lock().unwrap().push(req.clone());
            let next = self.replies.lock().unwrap().pop_front().expect("the script ran out of replies");
            next.map(|(text, cut_off)| LlmReply { text, input_tokens: 1000, output_tokens: 200, model: "claude-haiku-5-5".into(), cut_off, cache_read_tokens: 0, cache_write_tokens: 0 })
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
    fn every_request_carries_the_prompts_reply_schema() {
        let llm = Scripted::new(vec![Ok(GOOD)]);
        call_json(&llm, get(PromptId::Classify), &vars(), 400, &mut budget()).unwrap();
        let seen = llm.seen.lock().unwrap();
        assert_eq!(seen[0].schema.as_ref(), Some(&get(PromptId::Classify).schema));
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
    fn a_cut_off_reply_is_retried_with_twice_the_room_and_told_why() {
        let llm = Scripted::with_cut_offs(vec![(r#"{"type":"tech"#, true), (GOOD, false)]);
        let out = call_json(&llm, get(PromptId::Classify), &vars(), 400, &mut budget()).unwrap();
        assert_eq!(out.value["type"], "technical");
        let seen = llm.seen.lock().unwrap();
        assert_eq!((seen[0].max_tokens, seen[1].max_tokens), (400, 800));
        assert!(seen[1].user.contains("cut off before it finished") && !seen[1].user.contains("rejected"));
    }

    #[test]
    fn a_plain_bad_reply_is_retried_with_the_same_room() {
        let llm = Scripted::new(vec![Ok("nope"), Ok(GOOD)]);
        call_json(&llm, get(PromptId::Classify), &vars(), 400, &mut budget()).unwrap();
        assert_eq!(llm.seen.lock().unwrap()[1].max_tokens, 400);
    }

    #[test]
    fn a_valid_reply_that_hit_the_limit_is_still_used() {
        let llm = Scripted::with_cut_offs(vec![(GOOD, true)]);
        assert!(call_json(&llm, get(PromptId::Classify), &vars(), 400, &mut budget()).is_ok());
        assert_eq!(llm.calls(), 1);
    }

    #[test]
    fn two_cut_offs_in_a_row_are_too_long() {
        let llm = Scripted::with_cut_offs(vec![(r#"{"type":"#, true), (r#"{"type":"tech"#, true)]);
        let err = call_json(&llm, get(PromptId::Classify), &vars(), 400, &mut budget()).unwrap_err();
        assert_eq!(err, CallError::TooLong);
        assert_eq!(llm.calls(), 2);
        assert!(err.notice().contains("The AI's reply was too long to finish."));
    }

    fn walk_schemas(schema: &Value, f: &mut dyn FnMut(&serde_json::Map<String, Value>)) {
        let Value::Object(map) = schema else { return };
        f(map);
        for key in ["properties", "$defs"] {
            if let Some(Value::Object(m)) = map.get(key) {
                m.values().for_each(|s| walk_schemas(s, f));
            }
        }
        for key in ["items", "additionalProperties"] {
            if let Some(s) = map.get(key) {
                walk_schemas(s, f);
            }
        }
    }

    #[test]
    fn provider_schema_drops_every_forbidden_keyword_and_closes_every_object() {
        for id in PromptId::ALL {
            let full = &get(id).schema;
            let slim = provider_schema(full);
            let mut objects = 0;
            walk_schemas(&slim, &mut |m| {
                for k in PROVIDER_FORBIDDEN {
                    assert!(!m.contains_key(*k), "{id:?}: {k} left in");
                }
                if is_object_schema(m) {
                    objects += 1;
                    assert_eq!(m.get("additionalProperties"), Some(&Value::Bool(false)), "{id:?}: an open object");
                }
            });
            assert!(objects > 0);
            assert!(jsonschema::validator_for(&slim).is_ok(), "{id:?}: not a valid schema");
            // Property names that look like keywords stay ("type" is a field of the posting reader).
            assert_eq!(slim.get("required"), full.get("required"), "{id:?}");
        }
    }

    #[test]
    fn openai_strict_lists_every_property_as_required() {
        for id in PromptId::ALL {
            let strict = openai_strict_schema(&provider_schema(&get(id).schema)).unwrap_or_else(|| panic!("{id:?} can't be made strict"));
            assert!(jsonschema::validator_for(&strict).is_ok(), "{id:?}");
            walk_schemas(&strict, &mut |m| {
                if let Some(Value::Object(props)) = m.get("properties") {
                    let mut required: Vec<&str> = m["required"].as_array().unwrap().iter().filter_map(Value::as_str).collect();
                    let mut names: Vec<&str> = props.keys().map(String::as_str).collect();
                    required.sort();
                    names.sort();
                    assert_eq!(required, names, "{id:?}");
                }
            });
        }
    }

    #[test]
    fn a_null_in_an_optional_field_is_dropped_before_the_local_check() {
        let schema = serde_json::json!({ "type": "object", "properties": { "a": { "type": "string" }, "b": { "$ref": "#/$defs/s" }, "c": { "type": ["string", "null"] } }, "required": ["a"], "$defs": { "s": { "type": "string" } } });
        let mut v = serde_json::json!({ "a": "x", "b": null, "c": null });
        drop_optional_nulls(&schema, &schema, &mut v);
        assert_eq!(v, serde_json::json!({ "a": "x", "c": null }));
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

    #[test]
    fn a_stopped_call_ends_at_once_and_is_not_asked_again() {
        let llm = Scripted::new(vec![Err(AiError::Stopped), Ok(GOOD)]);
        let mut b = budget();
        let err = call_json(&llm, get(PromptId::Classify), &vars(), 400, &mut b).unwrap_err();
        assert_eq!(err, CallError::Stopped);
        assert_eq!(llm.calls(), 1);
        assert_eq!(b.spend.calls, 0, "nothing is counted for an answer that never came");
        assert_eq!(err.notice(), "You stopped the AI. This answer got the measured checks only.");
        assert_eq!(STOPPED, "stopped");
    }

    #[test]
    fn each_call_is_labelled_with_its_prompt_id() {
        let llm = Scripted::new(vec![Ok(GOOD)]);
        call_json(&llm, get(PromptId::Classify), &vars(), 400, &mut budget()).unwrap();
        assert_eq!(llm.seen.lock().unwrap()[0].label, get(PromptId::Classify).id);
    }
}
