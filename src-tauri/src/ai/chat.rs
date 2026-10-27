//! The model-call transport: one `Llm` that talks to any provider. Three wire formats cover all eight providers
//! (Anthropic Messages, OpenAI-style chat completions, Gemini's own), each with a pure request builder and a pure
//! reply parser so tests need no network. Retries, timeouts, the JSON-mode fallback and per-model settings live here
//! too. Reasoning models may put `<think>...</think>` in the text; `json::extract_json` strips it.

use super::llm::{Llm, LlmReply, LlmRequest, Tier};
use super::providers::{self, AiError, Provider, auth_headers, http_error};
use serde_json::{Value, json};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

/// How long to wait before the one retry.
pub const RETRY_PAUSE: Duration = Duration::from_millis(1500);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Format {
    Anthropic,
    /// Chat completions: OpenAI, Groq, Cerebras, Mistral, OpenRouter and local servers.
    OpenAi,
    Gemini,
}

fn format_of(provider: Provider) -> Format {
    match provider {
        Provider::Claude => Format::Anthropic,
        Provider::Gemini => Format::Gemini,
        _ => Format::OpenAi,
    }
}

/// How long one call may take: fast tasks 90 s, strong tasks 180 s, anything on a local server 600 s (local models
/// are slow, especially on the first call while the model loads).
pub fn timeout(provider: Provider, tier: Tier) -> Duration {
    match (provider, tier) {
        (Provider::Compatible, _) => Duration::from_secs(600),
        (_, Tier::Fast) => Duration::from_secs(90),
        (_, Tier::Strong) => Duration::from_secs(180),
    }
}

// ---------- per-model settings ----------

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ModelSettings {
    /// None means "send no temperature": the model only takes its default.
    pub temperature: Option<f64>,
    /// How hard a reasoning model thinks (OpenAI's `reasoning_effort`). None for models without the setting.
    pub reasoning_effort: Option<&'static str>,
}

/// The model's own name without the maker prefix OpenRouter adds ("anthropic/claude-sonnet-5.5" is "claude-sonnet-5.5").
fn bare_name(provider: Provider, model: &str) -> &str {
    match (provider, model.split_once('/')) {
        (Provider::OpenRouter, Some((_, name))) => name,
        _ => model,
    }
}

/// Claude from generation 5 on ("claude-sonnet-5-5", "claude-opus-5.5") and the Fable line reject any temperature
/// but the default.
fn is_recent_claude(name: &str) -> bool {
    let Some(rest) = name.strip_prefix("claude-") else { return false };
    if rest.starts_with("fable") || rest.starts_with("mythos") {
        return true;
    }
    rest.split('-')
        .find(|part| part.starts_with(|c: char| c.is_ascii_digit()))
        .and_then(|part| part.split(|c: char| !c.is_ascii_digit()).next())
        .and_then(|major| major.parse::<u32>().ok())
        .is_some_and(|major| major >= 5)
}

/// OpenAI's reasoning models (gpt-5.x, gpt-6.x, and the o-series) reject any temperature but the default and take a
/// reasoning effort instead.
fn is_openai_reasoning(name: &str) -> bool {
    name.starts_with("gpt-5") || name.starts_with("gpt-6") || (name.starts_with('o') && name[1..].starts_with(|c: char| c.is_ascii_digit()))
}

/// Temperature 0 (the most repeatable scoring) wherever the model accepts it:
///
/// | Provider and model                                        | temperature | reasoning_effort        |
/// |-----------------------------------------------------------|-------------|-------------------------|
/// | Claude, claude-*-5-* and later, claude-fable-*            | none        | none                    |
/// | Claude, older models                                      | 0           | none                    |
/// | OpenAI gpt-5.x, gpt-6.x, o-series                         | none        | "low" Fast, "medium" Strong |
/// | OpenAI, other models                                      | 0           | none                    |
/// | Gemini                                                    | none        | none                    |
/// | Groq, Cerebras, Mistral, Compatible (local) servers       | 0           | none                    |
/// | OpenRouter                                                | 0, except for the cases above and Gemini, judged by the maker's model name | none |
///
/// OpenRouter takes a different reasoning switch than OpenAI's, so it never gets `reasoning_effort`. Gemini models
/// are left at their default temperature, which Google asks for on its newer models.
pub fn model_settings(provider: Provider, model: &str, tier: Tier) -> ModelSettings {
    let name = bare_name(provider, model);
    let none = ModelSettings { temperature: None, reasoning_effort: None };
    let zero = ModelSettings { temperature: Some(0.0), reasoning_effort: None };
    match provider {
        Provider::Claude => if is_recent_claude(name) { none } else { zero },
        Provider::Gemini => none,
        Provider::OpenAi if is_openai_reasoning(name) => ModelSettings { temperature: None, reasoning_effort: Some(if tier == Tier::Fast { "low" } else { "medium" }) },
        Provider::OpenRouter if is_recent_claude(name) || is_openai_reasoning(name) || name.starts_with("gemini") => none,
        _ => zero,
    }
}

// ---------- request builders and reply parsers (pure) ----------

/// Everything needed to send one request.
#[derive(Debug, Clone, PartialEq)]
pub struct WireRequest {
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: Value,
}

fn base_of(base: &str) -> &str {
    base.trim_end_matches('/')
}

/// Extra output room for models that think before they answer (their thinking is counted as output). The reply
/// itself still has the caller's limit's worth of room after the thinking.
pub const THINKING_ROOM: u32 = 16_000;

/// Anthropic Messages API: `system` is a top-level field and `max_tokens` is required. It has no JSON mode, so
/// `req.json` changes nothing here; the prompt asks for JSON and `json::extract_json` reads it.
pub fn anthropic_request(base: &str, key: &str, model: &str, req: &LlmRequest, settings: &ModelSettings) -> WireRequest {
    let mut body = json!({
        "model": model,
        "max_tokens": req.max_tokens,
        "messages": [{ "role": "user", "content": req.user }],
    });
    if !req.system.is_empty() {
        body["system"] = json!(req.system);
    }
    if let Some(t) = settings.temperature {
        body["temperature"] = json!(t);
    }
    WireRequest { url: format!("{}/messages", base_of(base)), headers: auth_headers(Provider::Claude, key), body }
}

/// Chat completions. `json_mode` asks for `response_format: json_object`; it is a separate argument so the caller
/// can retry without it for servers that reject it. OpenAI's own newer models want `max_completion_tokens`; the
/// others (and local servers) still take `max_tokens`.
pub fn openai_request(provider: Provider, base: &str, key: &str, model: &str, req: &LlmRequest, settings: &ModelSettings, json_mode: bool) -> WireRequest {
    let mut messages = Vec::new();
    if !req.system.is_empty() {
        messages.push(json!({ "role": "system", "content": req.system }));
    }
    messages.push(json!({ "role": "user", "content": req.user }));
    let mut body = json!({ "model": model, "messages": messages });
    // A reasoning model's thinking counts against this limit too; without room for it, GPT-6 Sol used all 4,000 on
    // thinking while reading a resume and wrote nothing ("ran out of room"). Only tokens used are paid for.
    let limit = if settings.reasoning_effort.is_some() { req.max_tokens + THINKING_ROOM } else { req.max_tokens };
    body[if provider == Provider::OpenAi { "max_completion_tokens" } else { "max_tokens" }] = json!(limit);
    if let Some(t) = settings.temperature {
        body["temperature"] = json!(t);
    }
    if let Some(e) = settings.reasoning_effort {
        body["reasoning_effort"] = json!(e);
    }
    if json_mode {
        body["response_format"] = json!({ "type": "json_object" });
    }
    WireRequest { url: format!("{}/chat/completions", base_of(base)), headers: auth_headers(provider, key), body }
}

/// Gemini's native API. The model is part of the address.
pub fn gemini_request(base: &str, key: &str, model: &str, req: &LlmRequest, settings: &ModelSettings) -> WireRequest {
    let model = model.strip_prefix("models/").unwrap_or(model);
    // Gemini 3 models think by default, and the thinking counts against maxOutputTokens: same room as above.
    let mut config = json!({ "maxOutputTokens": req.max_tokens + THINKING_ROOM });
    if let Some(t) = settings.temperature {
        config["temperature"] = json!(t);
    }
    if req.json {
        config["responseMimeType"] = json!("application/json");
    }
    let mut body = json!({
        "contents": [{ "role": "user", "parts": [{ "text": req.user }] }],
        "generationConfig": config,
    });
    if !req.system.is_empty() {
        body["systemInstruction"] = json!({ "parts": [{ "text": req.system }] });
    }
    WireRequest { url: format!("{}/models/{model}:generateContent", base_of(base)), headers: auth_headers(Provider::Gemini, key), body }
}

/// About four characters to a token: good enough for a cost estimate when a server reports no usage.
fn estimate_tokens(text: &str) -> u32 {
    u32::try_from(text.chars().count().div_ceil(4)).unwrap_or(u32::MAX)
}

fn token_count(v: &Value) -> Option<u32> {
    v.as_u64().map(|n| u32::try_from(n).unwrap_or(u32::MAX))
}

fn finish(provider: Provider, model: &str, req: &LlmRequest, text: String, usage: (Option<u32>, Option<u32>), cut_off: bool) -> Result<LlmReply, AiError> {
    if text.trim().is_empty() {
        return Err(AiError::Failed(if cut_off {
            format!("{} ran out of room before it finished answering.", provider.name())
        } else {
            format!("{} sent back an empty answer.", provider.name())
        }));
    }
    let input_tokens = usage.0.unwrap_or_else(|| estimate_tokens(&req.system).saturating_add(estimate_tokens(&req.user)));
    let output_tokens = usage.1.unwrap_or_else(|| estimate_tokens(&text));
    Ok(LlmReply { text, input_tokens, output_tokens, model: model.to_string() })
}

pub fn parse_anthropic(body: &Value, model: &str, req: &LlmRequest) -> Result<LlmReply, AiError> {
    let text: String = body["content"].as_array().map(|parts| parts.iter().filter(|p| p["type"].as_str().is_none_or(|t| t == "text")).filter_map(|p| p["text"].as_str()).collect()).unwrap_or_default();
    let usage = (token_count(&body["usage"]["input_tokens"]), token_count(&body["usage"]["output_tokens"]));
    if text.trim().is_empty() && body["stop_reason"] == "refusal" {
        return Err(AiError::Failed("Claude declined to answer this one.".into()));
    }
    finish(Provider::Claude, model, req, text, usage, body["stop_reason"] == "max_tokens")
}

pub fn parse_openai(provider: Provider, body: &Value, model: &str, req: &LlmRequest) -> Result<LlmReply, AiError> {
    let choice = &body["choices"][0];
    let content = &choice["message"]["content"];
    let text = match content {
        Value::String(s) => s.clone(),
        // Some servers send the reply as a list of parts.
        Value::Array(parts) => parts.iter().filter_map(|p| p["text"].as_str()).collect(),
        _ => String::new(),
    };
    let usage = (token_count(&body["usage"]["prompt_tokens"]), token_count(&body["usage"]["completion_tokens"]));
    if text.trim().is_empty() {
        if let Some(why) = choice["message"]["refusal"].as_str().filter(|s| !s.is_empty()) {
            return Err(AiError::Failed(format!("{} declined to answer this one. {why}", provider.name())));
        }
    }
    finish(provider, model, req, text, usage, choice["finish_reason"] == "length")
}

pub fn parse_gemini(body: &Value, model: &str, req: &LlmRequest) -> Result<LlmReply, AiError> {
    let candidate = &body["candidates"][0];
    let text: String = candidate["content"]["parts"].as_array().map(|parts| parts.iter().filter(|p| p["thought"] != true).filter_map(|p| p["text"].as_str()).collect()).unwrap_or_default();
    let meta = &body["usageMetadata"];
    // Gemini bills its thinking tokens as output but reports them separately.
    let output = token_count(&meta["candidatesTokenCount"]).map(|n| n.saturating_add(token_count(&meta["thoughtsTokenCount"]).unwrap_or(0)));
    if text.trim().is_empty() {
        let blocked = body["promptFeedback"]["blockReason"].as_str().or_else(|| candidate["finishReason"].as_str().filter(|r| matches!(*r, "SAFETY" | "PROHIBITED_CONTENT" | "BLOCKLIST" | "RECITATION")));
        if let Some(why) = blocked {
            return Err(AiError::Failed(format!("Gemini wouldn't answer this one ({}).", why.to_lowercase().replace('_', " "))));
        }
    }
    finish(Provider::Gemini, model, req, text, (token_count(&meta["promptTokenCount"]), output), candidate["finishReason"] == "MAX_TOKENS")
}

// ---------- the transport ----------

/// A failed attempt, with what the retry and fallback logic needs to know.
struct Failure {
    error: AiError,
    status: Option<u16>,
    /// A 429, a 5xx or a timeout: worth one more try.
    retryable: bool,
    body: Value,
}

impl Failure {
    fn plain(error: AiError) -> Failure {
        Failure { error, status: None, retryable: false, body: Value::Null }
    }
}

pub struct ProviderLlm {
    provider: Provider,
    base: String,
    key: String,
    fast_model: String,
    strong_model: String,
    sleep: Arc<dyn Fn(Duration) + Send + Sync>,
    timeout_override: Option<Duration>,
    /// Set once a server has refused `response_format`, so later calls skip the doomed first try.
    json_mode_refused: AtomicBool,
}

// The key never appears in debug output.
impl std::fmt::Debug for ProviderLlm {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ProviderLlm").field("provider", &self.provider).field("base", &self.base).field("key", &"<hidden>").field("fast_model", &self.fast_model).field("strong_model", &self.strong_model).finish()
    }
}

impl ProviderLlm {
    pub fn new(provider: Provider, base: impl Into<String>, key: impl Into<String>, fast_model: impl Into<String>, strong_model: impl Into<String>) -> ProviderLlm {
        ProviderLlm {
            provider,
            base: base.into(),
            key: key.into(),
            fast_model: fast_model.into(),
            strong_model: strong_model.into(),
            sleep: Arc::new(std::thread::sleep),
            timeout_override: None,
            json_mode_refused: AtomicBool::new(false),
        }
    }

    /// Replaces the pause before the retry (tests pass a recorder so nothing waits).
    pub fn with_sleeper(mut self, sleep: impl Fn(Duration) + Send + Sync + 'static) -> ProviderLlm {
        self.sleep = Arc::new(sleep);
        self
    }

    /// Replaces the per-tier timeouts (tests use a short one).
    pub fn with_timeout(mut self, timeout: Duration) -> ProviderLlm {
        self.timeout_override = Some(timeout);
        self
    }

    fn model_for(&self, tier: Tier) -> &str {
        match tier {
            Tier::Fast => &self.fast_model,
            Tier::Strong => &self.strong_model,
        }
    }

    fn post(&self, wire: &WireRequest, timeout: Duration) -> Result<Value, Failure> {
        let mut http = providers::client(timeout).post(&wire.url);
        for (k, v) in &wire.headers {
            http = http.header(k, v);
        }
        let resp = http.json(&wire.body).send().map_err(|e| Failure { retryable: e.is_timeout(), ..Failure::plain(providers::transport_error(self.provider, &wire.url, &e)) })?;
        let status = resp.status().as_u16();
        let body: Value = resp.json().unwrap_or(Value::Null);
        if (200..300).contains(&status) {
            return Ok(body);
        }
        Err(Failure { error: http_error(self.provider, status, &body), status: Some(status), retryable: status == 429 || status >= 500, body })
    }

    /// One try, then one more after a pause when the failure is the kind that passes (rate limit, server trouble,
    /// timeout). A key the provider refuses or a server that isn't running is never retried.
    fn post_with_retry(&self, wire: &WireRequest, timeout: Duration) -> Result<Value, Failure> {
        match self.post(wire, timeout) {
            Err(f) if f.retryable => {
                (self.sleep)(RETRY_PAUSE);
                self.post(wire, timeout)
            }
            other => other,
        }
    }

    fn round_trip(&self, req: &LlmRequest, model: &str, json_mode: bool) -> Result<LlmReply, Failure> {
        let settings = model_settings(self.provider, model, req.tier);
        let wire = match format_of(self.provider) {
            Format::Anthropic => anthropic_request(&self.base, &self.key, model, req, &settings),
            Format::OpenAi => openai_request(self.provider, &self.base, &self.key, model, req, &settings, json_mode),
            Format::Gemini => gemini_request(&self.base, &self.key, model, req, &settings),
        };
        let timeout = self.timeout_override.unwrap_or_else(|| timeout(self.provider, req.tier));
        let body = self.post_with_retry(&wire, timeout)?;
        match format_of(self.provider) {
            Format::Anthropic => parse_anthropic(&body, model, req),
            Format::OpenAi => parse_openai(self.provider, &body, model, req),
            Format::Gemini => parse_gemini(&body, model, req),
        }
        .map_err(Failure::plain)
    }

    /// Error text never carries the key, even if a provider echoes it back.
    fn scrub(&self, error: AiError) -> AiError {
        if self.key.len() < 8 {
            return error;
        }
        let clean = |m: String| m.replace(&self.key, "[key]");
        match error {
            AiError::Unavailable(m) => AiError::Unavailable(clean(m)),
            AiError::Failed(m) => AiError::Failed(clean(m)),
        }
    }
}

impl Llm for ProviderLlm {
    fn complete(&self, req: &LlmRequest) -> Result<LlmReply, AiError> {
        let model = self.model_for(req.tier);
        if model.trim().is_empty() {
            return Err(AiError::Unavailable(format!("No model is chosen for {}. Pick one in Settings › AI.", self.provider.name())));
        }
        let json_mode = req.json && !self.json_mode_refused.load(Ordering::Relaxed);
        let result = self.round_trip(req, model, json_mode).or_else(|f| {
            // Some servers reject `response_format`. Ask again without it; the prompt still asks for JSON.
            let refused = json_mode && format_of(self.provider) == Format::OpenAi && f.status == Some(400) && f.body.to_string().to_lowercase().contains("response_format");
            if !refused {
                return Err(f);
            }
            self.json_mode_refused.store(true, Ordering::Relaxed);
            self.round_trip(req, model, false)
        });
        result.map_err(|f| self.scrub(f.error))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    fn request(json: bool, tier: Tier) -> LlmRequest {
        LlmRequest { system: "Be brief.".into(), user: "Score this answer.".into(), json, max_tokens: 500, tier }
    }

    // ----- model settings table -----

    fn settings(provider: Provider, model: &str, tier: Tier) -> (Option<f64>, Option<&'static str>) {
        let s = model_settings(provider, model, tier);
        (s.temperature, s.reasoning_effort)
    }

    #[test]
    fn recent_claude_models_get_no_temperature() {
        for m in ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5", "claude-fable-5-1", "claude-mythos-5-1"] {
            assert_eq!(settings(Provider::Claude, m, Tier::Fast), (None, None), "{m}");
        }
    }

    #[test]
    fn older_claude_models_get_temperature_zero() {
        for m in ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5", "claude-3-5-sonnet"] {
            assert_eq!(settings(Provider::Claude, m, Tier::Strong), (Some(0.0), None), "{m}");
        }
    }

    #[test]
    fn openai_reasoning_models_take_an_effort_by_tier_and_no_temperature() {
        for m in ["gpt-6-sol", "gpt-6.1-sol", "gpt-5.6-luna", "gpt-5.5", "gpt-5.4-mini", "o4-mini"] {
            assert_eq!(settings(Provider::OpenAi, m, Tier::Fast), (None, Some("low")), "{m}");
            assert_eq!(settings(Provider::OpenAi, m, Tier::Strong), (None, Some("medium")), "{m}");
        }
        assert_eq!(settings(Provider::OpenAi, "gpt-4.1", Tier::Fast), (Some(0.0), None));
    }

    #[test]
    fn gemini_gets_no_temperature() {
        assert_eq!(settings(Provider::Gemini, "gemini-3.8-flash", Tier::Fast), (None, None));
        assert_eq!(settings(Provider::Gemini, "gemini-3.1-pro-preview", Tier::Strong), (None, None));
    }

    #[test]
    fn the_other_providers_get_temperature_zero() {
        assert_eq!(settings(Provider::Groq, "openai/gpt-oss-120b", Tier::Fast), (Some(0.0), None));
        assert_eq!(settings(Provider::Cerebras, "gpt-oss-120b", Tier::Fast), (Some(0.0), None));
        assert_eq!(settings(Provider::Mistral, "mistral-medium-latest", Tier::Strong), (Some(0.0), None));
        assert_eq!(settings(Provider::Compatible, "llama3.2:3b", Tier::Fast), (Some(0.0), None));
        assert_eq!(settings(Provider::Compatible, "gpt-5-local", Tier::Fast), (Some(0.0), None), "a local server's model is never judged by its name");
    }

    #[test]
    fn openrouter_gets_zero_unless_the_model_behind_it_refuses() {
        assert_eq!(settings(Provider::OpenRouter, "deepseek/deepseek-v4.1-flash", Tier::Fast), (Some(0.0), None));
        assert_eq!(settings(Provider::OpenRouter, "openai/gpt-oss-120b", Tier::Fast), (Some(0.0), None));
        assert_eq!(settings(Provider::OpenRouter, "anthropic/claude-sonnet-5.5", Tier::Fast), (None, None));
        assert_eq!(settings(Provider::OpenRouter, "openai/gpt-6-sol", Tier::Strong), (None, None));
        assert_eq!(settings(Provider::OpenRouter, "google/gemini-3.8-flash", Tier::Fast), (None, None));
    }

    #[test]
    fn timeouts_follow_the_tier_and_local_servers_get_ten_minutes() {
        assert_eq!(timeout(Provider::Claude, Tier::Fast), Duration::from_secs(90));
        assert_eq!(timeout(Provider::OpenAi, Tier::Strong), Duration::from_secs(180));
        assert_eq!(timeout(Provider::Compatible, Tier::Fast), Duration::from_secs(600));
        assert_eq!(timeout(Provider::Compatible, Tier::Strong), Duration::from_secs(600));
    }

    // ----- request builders -----

    #[test]
    fn anthropic_request_has_a_top_level_system_and_a_required_max_tokens() {
        let s = model_settings(Provider::Claude, "claude-sonnet-5-5", Tier::Fast);
        let w = anthropic_request("https://api.anthropic.com/v1/", "sk-ant-key", "claude-sonnet-5-5", &request(true, Tier::Fast), &s);
        assert_eq!(w.url, "https://api.anthropic.com/v1/messages");
        assert!(w.headers.contains(&("x-api-key".into(), "sk-ant-key".into())));
        assert!(w.headers.iter().any(|(k, _)| k == "anthropic-version"));
        assert_eq!(w.body["model"], "claude-sonnet-5-5");
        assert_eq!(w.body["max_tokens"], 500);
        assert_eq!(w.body["system"], "Be brief.");
        assert_eq!(w.body["messages"], json!([{ "role": "user", "content": "Score this answer." }]));
        assert!(w.body.get("temperature").is_none());
        let old = model_settings(Provider::Claude, "claude-haiku-4-5", Tier::Fast);
        assert_eq!(anthropic_request("b", "k", "claude-haiku-4-5", &request(false, Tier::Fast), &old).body["temperature"], 0.0);
    }

    #[test]
    fn openai_request_asks_for_json_and_names_the_token_limit_the_way_each_server_expects() {
        let r = request(true, Tier::Strong);
        let s = model_settings(Provider::OpenAi, "gpt-6-sol", Tier::Strong);
        let w = openai_request(Provider::OpenAi, "https://api.openai.com/v1", "sk-key", "gpt-6-sol", &r, &s, true);
        assert_eq!(w.url, "https://api.openai.com/v1/chat/completions");
        assert!(w.headers.contains(&("Authorization".into(), "Bearer sk-key".into())));
        assert_eq!(w.body["messages"][0], json!({ "role": "system", "content": "Be brief." }));
        assert_eq!(w.body["messages"][1], json!({ "role": "user", "content": "Score this answer." }));
        assert_eq!(w.body["response_format"], json!({ "type": "json_object" }));
        assert_eq!(w.body["reasoning_effort"], "medium");
        assert_eq!(w.body["max_completion_tokens"], 500 + THINKING_ROOM, "room to think on top of the reply");
        assert!(w.body.get("max_tokens").is_none() && w.body.get("temperature").is_none());

        let s = model_settings(Provider::Groq, "openai/gpt-oss-120b", Tier::Fast);
        let w = openai_request(Provider::Groq, "https://api.groq.com/openai/v1", "k", "openai/gpt-oss-120b", &r, &s, false);
        assert_eq!(w.body["max_tokens"], 500);
        assert_eq!(w.body["temperature"], 0.0);
        assert!(w.body.get("response_format").is_none() && w.body.get("max_completion_tokens").is_none());
    }

    #[test]
    fn a_local_server_with_no_key_gets_no_auth_header() {
        let s = model_settings(Provider::Compatible, "llama3.2:3b", Tier::Fast);
        let w = openai_request(Provider::Compatible, "http://localhost:11434/v1", "", "llama3.2:3b", &request(false, Tier::Fast), &s, false);
        assert!(w.headers.is_empty());
    }

    #[test]
    fn gemini_request_puts_the_model_in_the_address_and_asks_for_json_in_the_config() {
        let s = model_settings(Provider::Gemini, "gemini-3.8-flash", Tier::Fast);
        let w = gemini_request("https://generativelanguage.googleapis.com/v1beta", "g-key", "gemini-3.8-flash", &request(true, Tier::Fast), &s);
        assert_eq!(w.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
        assert!(w.headers.contains(&("x-goog-api-key".into(), "g-key".into())));
        assert_eq!(w.body["systemInstruction"], json!({ "parts": [{ "text": "Be brief." }] }));
        assert_eq!(w.body["contents"], json!([{ "role": "user", "parts": [{ "text": "Score this answer." }] }]));
        assert_eq!(w.body["generationConfig"]["responseMimeType"], "application/json");
        assert_eq!(w.body["generationConfig"]["maxOutputTokens"], 500 + THINKING_ROOM);
        assert!(w.body["generationConfig"].get("temperature").is_none());
        let w = gemini_request("b", "k", "gemini-3.8-flash", &request(false, Tier::Fast), &s);
        assert!(w.body["generationConfig"].get("responseMimeType").is_none());
    }

    // ----- reply parsers -----

    #[test]
    fn anthropic_reply_joins_text_parts_and_reads_usage() {
        let body = json!({ "content": [{ "type": "thinking", "thinking": "..." }, { "type": "text", "text": "{\"a\":" }, { "type": "text", "text": "1}" }], "usage": { "input_tokens": 120, "output_tokens": 30 } });
        let r = parse_anthropic(&body, "claude-sonnet-5-5", &request(true, Tier::Fast)).unwrap();
        assert_eq!(r, LlmReply { text: "{\"a\":1}".into(), input_tokens: 120, output_tokens: 30, model: "claude-sonnet-5-5".into() });
    }

    #[test]
    fn openai_reply_reads_the_first_choice_and_usage() {
        let body = json!({ "choices": [{ "message": { "content": "hello" }, "finish_reason": "stop" }], "usage": { "prompt_tokens": 7, "completion_tokens": 2 } });
        let r = parse_openai(Provider::Groq, &body, "m", &request(false, Tier::Fast)).unwrap();
        assert_eq!((r.text.as_str(), r.input_tokens, r.output_tokens), ("hello", 7, 2));
        let parts = json!({ "choices": [{ "message": { "content": [{ "type": "text", "text": "hi" }] } }] });
        assert_eq!(parse_openai(Provider::Compatible, &parts, "m", &request(false, Tier::Fast)).unwrap().text, "hi");
    }

    #[test]
    fn missing_usage_is_estimated_at_four_characters_a_token() {
        // "Be brief." is 9 characters (3 tokens), "Score this answer." is 18 (5 tokens), the reply is 20 (5 tokens).
        let body = json!({ "choices": [{ "message": { "content": "12345678901234567890" } }] });
        let r = parse_openai(Provider::Compatible, &body, "llama3.2:3b", &request(false, Tier::Fast)).unwrap();
        assert_eq!((r.input_tokens, r.output_tokens), (8, 5));
    }

    #[test]
    fn gemini_reply_skips_thought_parts_and_counts_thinking_as_output() {
        let body = json!({
            "candidates": [{ "content": { "parts": [{ "text": "planning", "thought": true }, { "text": "{\"ok\":" }, { "text": "true}" }] }, "finishReason": "STOP" }],
            "usageMetadata": { "promptTokenCount": 50, "candidatesTokenCount": 10, "thoughtsTokenCount": 40 }
        });
        let r = parse_gemini(&body, "gemini-3.8-flash", &request(true, Tier::Fast)).unwrap();
        assert_eq!((r.text.as_str(), r.input_tokens, r.output_tokens), ("{\"ok\":true}", 50, 50));
    }

    #[test]
    fn a_thinking_model_gets_room_to_think_on_top_of_the_reply() {
        let req = LlmRequest { system: String::new(), user: "u".into(), json: true, max_tokens: 4000, tier: Tier::Strong };
        let sol = model_settings(Provider::OpenAi, "gpt-6-sol", Tier::Strong);
        assert!(sol.reasoning_effort.is_some());
        let w = openai_request(Provider::OpenAi, "https://api.openai.com/v1", "k", "gpt-6-sol", &req, &sol, true);
        assert_eq!(w.body["max_completion_tokens"], json!(4000 + THINKING_ROOM));
        let plain = model_settings(Provider::OpenAi, "gpt-4.1", Tier::Strong);
        let w = openai_request(Provider::OpenAi, "https://api.openai.com/v1", "k", "gpt-4.1", &req, &plain, true);
        assert_eq!(w.body["max_completion_tokens"], json!(4000), "a model that doesn't think keeps the plain limit");
        let g = gemini_request("https://generativelanguage.googleapis.com/v1beta", "k", "gemini-3.1-pro-preview", &req, &model_settings(Provider::Gemini, "gemini-3.1-pro-preview", Tier::Strong));
        assert_eq!(g.body["generationConfig"]["maxOutputTokens"], json!(4000 + THINKING_ROOM));
    }

    #[test]
    fn empty_cut_off_and_declined_replies_are_explained() {
        let r = request(false, Tier::Fast);
        let e = parse_openai(Provider::OpenAi, &json!({ "choices": [{ "message": { "content": "" }, "finish_reason": "length" }] }), "m", &r).unwrap_err();
        assert!(matches!(&e, AiError::Failed(m) if m.contains("ran out of room")), "{e:?}");
        let e = parse_openai(Provider::OpenAi, &json!({ "choices": [{ "message": { "content": null, "refusal": "I can't help with that." } }] }), "m", &r).unwrap_err();
        assert!(matches!(&e, AiError::Failed(m) if m.contains("declined") && m.contains("can't help")), "{e:?}");
        let e = parse_anthropic(&json!({ "content": [], "stop_reason": "refusal" }), "m", &r).unwrap_err();
        assert!(matches!(&e, AiError::Failed(m) if m.contains("declined")), "{e:?}");
        let e = parse_gemini(&json!({ "promptFeedback": { "blockReason": "SAFETY" } }), "m", &r).unwrap_err();
        assert!(matches!(&e, AiError::Failed(m) if m.contains("safety")), "{e:?}");
        let e = parse_gemini(&json!({}), "m", &r).unwrap_err();
        assert!(matches!(&e, AiError::Failed(m) if m.contains("empty answer")), "{e:?}");
    }

    // ----- over the wire, against a fake server -----

    struct Seen {
        method: String,
        url: String,
        headers: Vec<(String, String)>,
        body: Value,
    }

    impl Seen {
        fn header(&self, name: &str) -> Option<&str> {
            self.headers.iter().find(|(k, _)| k.eq_ignore_ascii_case(name)).map(|(_, v)| v.as_str())
        }
    }

    /// One scripted reply: status, body, and how long to sit on it first.
    fn reply(status: u16, body: Value) -> (u16, String, u64) {
        (status, body.to_string(), 0)
    }

    /// A fake server that answers the scripted replies in order and records what it was sent.
    fn fake_server(script: Vec<(u16, String, u64)>) -> (String, std::thread::JoinHandle<Vec<Seen>>) {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let port = server.server_addr().to_ip().unwrap().port();
        let handle = std::thread::spawn(move || {
            let mut seen = Vec::new();
            for (status, body, delay_ms) in script {
                let Some(mut req) = server.recv_timeout(Duration::from_secs(10)).unwrap() else { break };
                let mut raw = String::new();
                std::io::Read::read_to_string(req.as_reader(), &mut raw).unwrap();
                seen.push(Seen {
                    method: req.method().to_string(),
                    url: req.url().to_string(),
                    headers: req.headers().iter().map(|h| (h.field.to_string(), h.value.as_str().to_string())).collect(),
                    body: serde_json::from_str(&raw).unwrap_or(Value::Null),
                });
                let resp = tiny_http::Response::from_string(body).with_status_code(status).with_header("Content-Type: application/json".parse::<tiny_http::Header>().unwrap());
                // A slow reply is held back on its own thread, so the next request is not stuck behind it.
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(delay_ms));
                    let _ = req.respond(resp);
                });
            }
            seen
        });
        (format!("http://127.0.0.1:{port}"), handle)
    }

    type Pauses = Arc<Mutex<Vec<Duration>>>;

    /// A transport that records its pauses instead of waiting.
    fn llm(provider: Provider, base: String, key: &str, model: &str) -> (ProviderLlm, Pauses) {
        let pauses: Pauses = Arc::default();
        let log = pauses.clone();
        (ProviderLlm::new(provider, base, key, model, model).with_sleeper(move |d| log.lock().unwrap().push(d)), pauses)
    }

    fn openai_ok(text: &str) -> (u16, String, u64) {
        reply(200, json!({ "choices": [{ "message": { "content": text } }], "usage": { "prompt_tokens": 11, "completion_tokens": 4 } }))
    }

    #[test]
    fn claude_round_trip_uses_the_messages_endpoint() {
        let (base, server) = fake_server(vec![reply(200, json!({ "content": [{ "type": "text", "text": "{\"score\": 5}" }], "usage": { "input_tokens": 21, "output_tokens": 6 } }))]);
        let (llm, pauses) = llm(Provider::Claude, format!("{base}/v1"), "sk-ant-secret-key", "claude-sonnet-5-5");
        let r = llm.complete(&request(true, Tier::Fast)).unwrap();
        let seen = server.join().unwrap();
        assert_eq!((seen[0].method.as_str(), seen[0].url.as_str()), ("POST", "/v1/messages"));
        assert_eq!(seen[0].header("x-api-key"), Some("sk-ant-secret-key"));
        assert_eq!(seen[0].header("anthropic-version"), Some("2023-06-01"));
        assert_eq!(seen[0].body["system"], "Be brief.");
        assert_eq!(seen[0].body["max_tokens"], 500);
        assert_eq!(seen[0].body["messages"][0]["content"], "Score this answer.");
        assert_eq!(r, LlmReply { text: "{\"score\": 5}".into(), input_tokens: 21, output_tokens: 6, model: "claude-sonnet-5-5".into() });
        assert!(pauses.lock().unwrap().is_empty());
    }

    #[test]
    fn openai_style_round_trip_sends_json_mode_and_the_bearer_key() {
        let (base, server) = fake_server(vec![openai_ok("{\"ok\": true}")]);
        let (llm, _) = llm(Provider::Groq, format!("{base}/openai/v1"), "gsk-secret-key", "openai/gpt-oss-120b");
        let r = llm.complete(&request(true, Tier::Strong)).unwrap();
        let seen = server.join().unwrap();
        assert_eq!(seen[0].url, "/openai/v1/chat/completions");
        assert_eq!(seen[0].header("authorization"), Some("Bearer gsk-secret-key"));
        assert_eq!(seen[0].body["model"], "openai/gpt-oss-120b");
        assert_eq!(seen[0].body["response_format"]["type"], "json_object");
        assert_eq!(seen[0].body["temperature"], 0.0);
        assert_eq!((r.text.as_str(), r.input_tokens, r.output_tokens), ("{\"ok\": true}", 11, 4));
    }

    #[test]
    fn gemini_round_trip_puts_the_model_in_the_path_and_the_key_in_a_header() {
        let (base, server) = fake_server(vec![reply(200, json!({
            "candidates": [{ "content": { "parts": [{ "text": "{\"g\": 1}" }] } }],
            "usageMetadata": { "promptTokenCount": 33, "candidatesTokenCount": 8 }
        }))]);
        let (llm, _) = llm(Provider::Gemini, format!("{base}/v1beta"), "g-secret-key-1234", "gemini-3.8-flash");
        let r = llm.complete(&request(true, Tier::Fast)).unwrap();
        let seen = server.join().unwrap();
        assert_eq!(seen[0].url, "/v1beta/models/gemini-3.8-flash:generateContent");
        assert_eq!(seen[0].header("x-goog-api-key"), Some("g-secret-key-1234"));
        assert_eq!(seen[0].body["generationConfig"]["responseMimeType"], "application/json");
        assert_eq!((r.text.as_str(), r.input_tokens, r.output_tokens), ("{\"g\": 1}", 33, 8));
    }

    #[test]
    fn the_strong_tier_uses_the_strong_model() {
        let (base, server) = fake_server(vec![openai_ok("a"), openai_ok("b")]);
        let llm = ProviderLlm::new(Provider::Compatible, format!("{base}/v1"), "", "small", "big");
        assert_eq!(llm.complete(&request(false, Tier::Fast)).unwrap().model, "small");
        assert_eq!(llm.complete(&request(false, Tier::Strong)).unwrap().model, "big");
        let seen = server.join().unwrap();
        assert_eq!((seen[0].body["model"].as_str(), seen[1].body["model"].as_str()), (Some("small"), Some("big")));
        assert!(seen[0].header("authorization").is_none());
    }

    #[test]
    fn a_server_that_rejects_response_format_is_asked_again_without_it_and_remembered() {
        let refusal = reply(400, json!({ "error": { "message": "'response_format.type' must be 'json_schema' or 'text'" } }));
        let (base, server) = fake_server(vec![refusal, openai_ok("{\"a\": 1}"), openai_ok("{\"a\": 2}")]);
        let (llm, pauses) = llm(Provider::Compatible, format!("{base}/v1"), "", "llama3.2:3b");
        assert_eq!(llm.complete(&request(true, Tier::Fast)).unwrap().text, "{\"a\": 1}");
        assert_eq!(llm.complete(&request(true, Tier::Fast)).unwrap().text, "{\"a\": 2}");
        let seen = server.join().unwrap();
        assert_eq!(seen.len(), 3);
        assert!(seen[0].body.get("response_format").is_some());
        assert!(seen[1].body.get("response_format").is_none(), "retried without it");
        assert!(seen[2].body.get("response_format").is_none(), "and later calls don't try it again");
        assert!(pauses.lock().unwrap().is_empty(), "the fallback is not a timed retry");
    }

    #[test]
    fn any_other_400_is_not_retried() {
        let (base, server) = fake_server(vec![reply(400, json!({ "error": { "message": "max_tokens is too large" } })), openai_ok("never sent")]);
        let (llm, pauses) = llm(Provider::Compatible, format!("{base}/v1"), "", "m");
        let e = llm.complete(&request(true, Tier::Fast)).unwrap_err();
        assert!(matches!(&e, AiError::Failed(m) if m.contains("max_tokens is too large")), "{e:?}");
        drop(server); // the second scripted reply is never asked for
        assert!(pauses.lock().unwrap().is_empty());
    }

    #[test]
    fn a_rate_limit_is_retried_once_after_a_pause_and_then_succeeds() {
        let (base, server) = fake_server(vec![reply(429, json!({ "error": { "message": "slow down" } })), openai_ok("fine")]);
        let (llm, pauses) = llm(Provider::OpenAi, format!("{base}/v1"), "sk-key-12345678", "gpt-6-sol");
        assert_eq!(llm.complete(&request(false, Tier::Fast)).unwrap().text, "fine");
        assert_eq!(server.join().unwrap().len(), 2);
        assert_eq!(*pauses.lock().unwrap(), vec![Duration::from_millis(1500)]);
    }

    #[test]
    fn a_server_error_is_retried_only_once() {
        let (base, server) = fake_server(vec![reply(503, json!({})), reply(500, json!({ "error": { "message": "still down" } }))]);
        let (llm, pauses) = llm(Provider::Mistral, format!("{base}/v1"), "k", "mistral-medium-latest");
        let e = llm.complete(&request(false, Tier::Fast)).unwrap_err();
        assert!(matches!(&e, AiError::Failed(m) if m.contains("500") && m.contains("still down")), "{e:?}");
        assert_eq!(server.join().unwrap().len(), 2);
        assert_eq!(pauses.lock().unwrap().len(), 1);
    }

    #[test]
    fn a_timeout_is_retried_once() {
        let (base, server) = fake_server(vec![(200, "{}".into(), 700), openai_ok("second time lucky")]);
        let pauses: Pauses = Arc::default();
        let log = pauses.clone();
        let llm = ProviderLlm::new(Provider::Compatible, format!("{base}/v1"), "", "m", "m").with_sleeper(move |d| log.lock().unwrap().push(d)).with_timeout(Duration::from_millis(250));
        assert_eq!(llm.complete(&request(false, Tier::Fast)).unwrap().text, "second time lucky");
        assert_eq!(server.join().unwrap().len(), 2);
        assert_eq!(pauses.lock().unwrap().len(), 1);
    }

    #[test]
    fn a_rejected_key_is_unavailable_in_plain_words_and_never_retried() {
        let (base, server) = fake_server(vec![reply(401, json!({ "error": { "message": "Incorrect API key provided: sk-ant-secret-key" } })), openai_ok("never sent")]);
        let (llm, pauses) = llm(Provider::Claude, format!("{base}/v1"), "sk-ant-secret-key", "claude-sonnet-5-5");
        let e = llm.complete(&request(false, Tier::Fast)).unwrap_err();
        assert_eq!(e, AiError::Unavailable("Claude didn't accept the API key. Check it in Settings › AI.".into()));
        assert!(pauses.lock().unwrap().is_empty());
        drop(server);
    }

    #[test]
    fn a_missing_model_is_unavailable_and_never_retried() {
        let (base, server) = fake_server(vec![reply(404, json!({ "error": { "message": "model not found" } }))]);
        let (llm, pauses) = llm(Provider::Compatible, format!("{base}/v1"), "", "nope");
        let e = llm.complete(&request(false, Tier::Fast)).unwrap_err();
        assert!(matches!(&e, AiError::Unavailable(m) if m.contains("doesn't have that model")), "{e:?}");
        assert_eq!(server.join().unwrap().len(), 1);
        assert!(pauses.lock().unwrap().is_empty());
    }

    #[test]
    fn a_connection_refused_is_unavailable_and_never_retried() {
        let (llm, pauses) = llm(Provider::Compatible, "http://127.0.0.1:1/v1".into(), "", "m");
        let e = llm.complete(&request(false, Tier::Fast)).unwrap_err();
        assert!(matches!(&e, AiError::Unavailable(m) if m.contains("Couldn't reach")), "{e:?}");
        assert!(pauses.lock().unwrap().is_empty());
    }

    #[test]
    fn no_chosen_model_is_unavailable() {
        let (llm, _) = llm(Provider::Compatible, "http://127.0.0.1:1/v1".into(), "", "");
        let e = llm.complete(&request(false, Tier::Fast)).unwrap_err();
        assert!(matches!(&e, AiError::Unavailable(m) if m.contains("Pick one in Settings")), "{e:?}");
    }

    #[test]
    fn the_key_never_appears_in_an_error_or_in_debug_output() {
        let key = "sk-live-0123456789abcdef";
        let (base, server) = fake_server(vec![reply(500, json!({ "error": { "message": format!("bad request from {key}") } })), reply(500, json!({ "error": { "message": format!("bad request from {key}") } }))]);
        let (llm, _) = llm(Provider::OpenAi, format!("{base}/v1"), key, "gpt-5.4");
        let e = llm.complete(&request(false, Tier::Fast)).unwrap_err();
        let text = format!("{e:?}");
        assert!(!text.contains(key) && text.contains("[key]"), "{text}");
        assert!(!format!("{llm:?}").contains(key));
        drop(server);
    }
}
