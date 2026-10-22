//! The cloud AI providers: the model list per provider, auth headers, error wording and the plain HTTP calls the
//! Test button and the model pickers use. Routing, prompts, retries and cost tracking arrive in M4.

use serde_json::Value;
use std::time::Duration;

#[derive(Debug, Clone, PartialEq)]
pub enum AiError {
    /// Can't run at all right now (bad key, no such model, server not running). Nothing to retry.
    Unavailable(String),
    /// The call failed (network, rate limit, refusal). May work next time.
    Failed(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provider {
    Claude,
    OpenAi,
    Gemini,
    Groq,
    Cerebras,
    Mistral,
    /// One key for many companies' models.
    OpenRouter,
    /// Ollama, LM Studio, or any OpenAI-compatible server.
    Compatible,
}

/// The cloud models offered in Settings for each provider (kept in step with the Talaan Cloud AI Models page in
/// Notion). The first one is what "Recommended" uses when the key can reach it.
pub fn catalog(provider: Provider) -> &'static [&'static str] {
    match provider {
        Provider::Claude => &["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5", "claude-fable-5-1"],
        Provider::OpenAi => &["gpt-6-sol", "gpt-6.1-sol", "gpt-6-luna", "gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.4", "gpt-5.4-mini"],
        Provider::Gemini => &["gemini-3.8-flash", "gemini-3.1-pro-preview", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"],
        Provider::Groq => &["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"],
        Provider::Cerebras => &["gpt-oss-120b", "qwen-3.8-27b"],
        Provider::Mistral => &["mistral-medium-latest", "mistral-large-latest", "mistral-small-latest", "ministral-14b-latest", "ministral-8b-latest"],
        Provider::OpenRouter => &[
            "anthropic/claude-sonnet-5.5",
            "anthropic/claude-opus-5.5",
            "anthropic/claude-haiku-5.5",
            "openai/gpt-6-sol",
            "openai/gpt-6-luna",
            "openai/gpt-oss-120b",
            "google/gemini-3.8-flash",
            "google/gemini-3.1-pro-preview",
            "deepseek/deepseek-v4.1-flash",
            "qwen/qwen3.8-flash",
            "mistralai/mistral-medium-3-5",
            "x-ai/grok-4.7",
            "meta-llama/llama-4-maverick",
        ],
        Provider::Compatible => &[],
    }
}

impl Provider {
    pub const ALL: [Provider; 8] = [Provider::Claude, Provider::OpenAi, Provider::Gemini, Provider::Groq, Provider::Cerebras, Provider::Mistral, Provider::OpenRouter, Provider::Compatible];

    pub fn parse(s: &str) -> Option<Provider> {
        Some(match s {
            "claude" => Provider::Claude,
            "openai" => Provider::OpenAi,
            "gemini" => Provider::Gemini,
            "groq" => Provider::Groq,
            "cerebras" => Provider::Cerebras,
            "mistral" => Provider::Mistral,
            "openrouter" => Provider::OpenRouter,
            "compatible" => Provider::Compatible,
            _ => return None,
        })
    }

    pub fn name(self) -> &'static str {
        match self {
            Provider::Claude => "Claude",
            Provider::OpenAi => "OpenAI",
            Provider::Gemini => "Gemini",
            Provider::Groq => "Groq",
            Provider::Cerebras => "Cerebras",
            Provider::Mistral => "Mistral",
            Provider::OpenRouter => "OpenRouter",
            Provider::Compatible => "OpenAI-compatible",
        }
    }

    /// Keychain account name.
    pub fn key_id(self) -> &'static str {
        match self {
            Provider::Claude => "claude",
            Provider::OpenAi => "openai",
            Provider::Gemini => "gemini",
            Provider::Groq => "groq",
            Provider::Cerebras => "cerebras",
            Provider::Mistral => "mistral",
            Provider::OpenRouter => "openrouter",
            Provider::Compatible => "compatible",
        }
    }
}

/// Turns an HTTP error into words: the provider's own message when it gives one.
pub fn http_error(provider: Provider, status: u16, body: &Value) -> AiError {
    let detail = body["error"]["message"].as_str().or_else(|| body["error"].as_str()).or_else(|| body["message"].as_str()).unwrap_or("");
    let name = provider.name();
    match status {
        401 | 403 => AiError::Unavailable(format!("{name} didn't accept the API key. Check it in Settings › AI.")),
        404 => AiError::Unavailable(format!("{name} doesn't have that model. Pick another in Settings › AI. {detail}").trim().to_string()),
        429 => AiError::Failed(format!("{name} is rate limiting or out of credit. Try again later. {detail}").trim().to_string()),
        _ => AiError::Failed(format!("{name} returned an error ({status}). {detail}").trim().to_string()),
    }
}

pub(super) fn client(timeout: Duration) -> reqwest::blocking::Client {
    reqwest::blocking::Client::builder()
        .user_agent(concat!("Ensayo/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(10))
        .timeout(timeout)
        .build()
        .expect("http client")
}

/// A failure to get any answer at all (as opposed to an HTTP error status), in plain words.
pub(super) fn transport_error(provider: Provider, url: &str, e: &reqwest::Error) -> AiError {
    if e.is_connect() {
        AiError::Unavailable(format!("Couldn't reach {} at {url}. Is it running, and is this computer online?", provider.name()))
    } else if e.is_timeout() {
        AiError::Failed(format!("{} took too long to answer.", provider.name()))
    } else {
        AiError::Failed(format!("Couldn't reach {}: {e}", provider.name()))
    }
}

fn send(provider: Provider, method: reqwest::Method, url: &str, headers: &[(String, String)], body: Option<&Value>, timeout: Duration) -> Result<Value, AiError> {
    let mut req = client(timeout).request(method, url);
    for (k, v) in headers {
        req = req.header(k, v);
    }
    if let Some(b) = body {
        req = req.json(b);
    }
    let resp = req.send().map_err(|e| transport_error(provider, url, &e))?;
    let status = resp.status().as_u16();
    let body: Value = resp.json().unwrap_or(Value::Null);
    if !(200..300).contains(&status) {
        return Err(http_error(provider, status, &body));
    }
    Ok(body)
}

// ---------- model lists (Settings: Test button, local server model picker) ----------

pub fn auth_headers(provider: Provider, key: &str) -> Vec<(String, String)> {
    match provider {
        Provider::Claude => vec![("x-api-key".into(), key.into()), ("anthropic-version".into(), "2023-06-01".into())],
        Provider::Gemini => vec![("x-goog-api-key".into(), key.into())],
        _ if key.is_empty() => vec![],
        _ => vec![("Authorization".into(), format!("Bearer {key}"))],
    }
}

/// Model ids from a provider's model list response.
pub fn model_ids(provider: Provider, body: &Value) -> Vec<String> {
    let list = match provider {
        Provider::Gemini => &body["models"],
        _ => &body["data"],
    };
    list.as_array()
        .map(|a| {
            a.iter()
                .filter_map(|m| m["id"].as_str().or_else(|| m["name"].as_str()))
                .map(|id| id.strip_prefix("models/").unwrap_or(id).to_string())
                .collect()
        })
        .unwrap_or_default()
}

/// Version numbers in a model id, for picking the newest: "gpt-5.1-mini" → [5, 1].
fn version(id: &str) -> Vec<u32> {
    id.split(|c: char| !c.is_ascii_digit()).filter(|s| !s.is_empty() && s.len() < 4).filter_map(|s| s.parse().ok()).collect()
}

/// The model Ensayo uses when the user hasn't picked one: the first of the provider's list that the key can
/// use, else the newest of its fast, capable tier among what the key offers (names change faster than releases).
pub fn recommended_model(provider: Provider, ids: &[String]) -> Option<String> {
    if let Some(m) = catalog(provider).iter().find(|m| ids.iter().any(|id| id == *m)) {
        return Some(m.to_string());
    }
    let fits = |id: &str| -> bool {
        let id = id.to_lowercase();
        match provider {
            Provider::Claude => id.starts_with("claude-sonnet"),
            Provider::OpenAi => id.starts_with("gpt-") && id.ends_with("-mini") && !id.contains("audio") && !id.contains("realtime") && !id.contains("search"),
            Provider::Gemini => id.starts_with("gemini-") && id.contains("flash") && !id.contains("lite") && !id.contains("image") && !id.contains("tts") && !id.contains("live") && !id.contains("exp") && !id.contains("preview"),
            Provider::Groq | Provider::Cerebras | Provider::OpenRouter => id.contains("gpt-oss-120b"),
            Provider::Mistral => id.starts_with("mistral-medium"),
            Provider::Compatible => !id.contains("embed"),
        }
    };
    let mut ok: Vec<&String> = ids.iter().filter(|id| fits(id)).collect();
    if provider == Provider::Compatible {
        return ok.first().map(|s| s.to_string());
    }
    ok.sort_by_key(|id| version(id));
    ok.last().map(|s| s.to_string())
}

/// Lists the models a key (or a local server) offers. Used by the Test button.
pub fn list_models(provider: Provider, base: &str, key: &str) -> Result<Vec<String>, AiError> {
    let body = send(provider, reqwest::Method::GET, &format!("{base}/models"), &auth_headers(provider, key), None, Duration::from_secs(20))?;
    Ok(model_ids(provider, &body))
}

pub fn default_base(provider: Provider) -> &'static str {
    match provider {
        Provider::Claude => "https://api.anthropic.com/v1",
        Provider::OpenAi => "https://api.openai.com/v1",
        Provider::Gemini => "https://generativelanguage.googleapis.com/v1beta",
        Provider::Groq => "https://api.groq.com/openai/v1",
        Provider::Cerebras => "https://api.cerebras.ai/v1",
        Provider::Mistral => "https://api.mistral.ai/v1",
        Provider::OpenRouter => "https://openrouter.ai/api/v1",
        Provider::Compatible => "http://localhost:11434/v1",
    }
}

/// "http://localhost:11434" or ".../v1/" → "http://localhost:11434/v1".
pub fn compatible_base(address: &str) -> String {
    let a = address.trim().trim_end_matches('/');
    let a = if a.contains("://") { a.to_string() } else { format!("http://{a}") };
    if a.ends_with("/v1") { a } else { format!("{a}/v1") }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn ids(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn every_provider_has_a_unique_key_id_and_parses_back() {
        let mut seen = std::collections::HashSet::new();
        for p in Provider::ALL {
            assert!(seen.insert(p.key_id()), "{}", p.key_id());
            assert_eq!(Provider::parse(p.key_id()), Some(p));
        }
        assert_eq!(Provider::parse("nonsense"), None);
    }

    #[test]
    fn every_provider_has_an_address_and_cloud_ones_have_models() {
        for (id, base) in [("groq", "https://api.groq.com/openai/v1"), ("cerebras", "https://api.cerebras.ai/v1"), ("mistral", "https://api.mistral.ai/v1"), ("openrouter", "https://openrouter.ai/api/v1")] {
            assert_eq!(default_base(Provider::parse(id).unwrap()), base);
        }
        for p in Provider::ALL {
            assert!(default_base(p).starts_with("http"), "{p:?}");
        }
        for p in ["claude", "openai", "gemini", "groq", "cerebras", "mistral", "openrouter"].map(|p| Provider::parse(p).unwrap()) {
            assert!(!catalog(p).is_empty(), "{p:?}");
        }
        assert!(catalog(Provider::Compatible).is_empty(), "a local server's models come from the server");
    }

    #[test]
    fn auth_headers_differ_per_provider() {
        assert_eq!(auth_headers(Provider::Claude, "k")[0], ("x-api-key".into(), "k".into()));
        assert_eq!(auth_headers(Provider::Gemini, "k")[0], ("x-goog-api-key".into(), "k".into()));
        assert_eq!(auth_headers(Provider::OpenAi, "k")[0], ("Authorization".into(), "Bearer k".into()));
        assert!(auth_headers(Provider::Compatible, "").is_empty(), "a local server may need no key");
    }

    #[test]
    fn model_lists_parse_for_each_provider() {
        assert_eq!(model_ids(Provider::OpenAi, &json!({"data": [{"id": "gpt-5-mini"}, {"id": "gpt-5"}]})), vec!["gpt-5-mini", "gpt-5"]);
        assert_eq!(model_ids(Provider::Gemini, &json!({ "models": [{ "name": "models/gemini-3-flash" }] })), vec!["gemini-3-flash"]);
        assert_eq!(model_ids(Provider::Compatible, &json!({ "data": [{ "id": "llama3.2:3b" }] })), vec!["llama3.2:3b"]);
    }

    #[test]
    fn a_rejected_key_says_so_in_plain_words() {
        let e = http_error(Provider::Claude, 401, &Value::Null);
        assert!(matches!(&e, AiError::Unavailable(m) if m.contains("Claude didn't accept the API key")), "{e:?}");
        assert!(matches!(http_error(Provider::Claude, 403, &Value::Null), AiError::Unavailable(_)));
    }

    #[test]
    fn a_missing_model_and_a_rate_limit_keep_the_providers_own_message() {
        let e = http_error(Provider::OpenAi, 429, &json!({ "error": { "message": "You exceeded your quota." } }));
        assert_eq!(e, AiError::Failed("OpenAI is rate limiting or out of credit. Try again later. You exceeded your quota.".into()));
        let e = http_error(Provider::Groq, 404, &json!({ "error": "no such model" }));
        assert!(matches!(&e, AiError::Unavailable(m) if m.contains("doesn't have that model") && m.ends_with("no such model")), "{e:?}");
        let e = http_error(Provider::Mistral, 500, &Value::Null);
        assert_eq!(e, AiError::Failed("Mistral returned an error (500).".into()));
    }

    #[test]
    fn recommended_prefers_the_listed_default_the_key_can_use() {
        assert_eq!(recommended_model(Provider::OpenAi, &ids(&["gpt-5.4-mini", "gpt-6-sol", "gpt-6-luna"])).as_deref(), Some("gpt-6-sol"));
        assert_eq!(recommended_model(Provider::Groq, &ids(&["llama-3.3-70b", "openai/gpt-oss-20b"])).as_deref(), Some("openai/gpt-oss-20b"));
        assert_eq!(recommended_model(Provider::Mistral, &ids(&["mistral-small-latest", "mistral-medium-latest"])).as_deref(), Some("mistral-medium-latest"));
        assert_eq!(recommended_model(Provider::OpenRouter, &ids(&["x-ai/grok-4.7", "anthropic/claude-sonnet-5.5"])).as_deref(), Some("anthropic/claude-sonnet-5.5"));
    }

    #[test]
    fn the_newest_fast_model_is_recommended_from_what_the_key_offers() {
        assert_eq!(recommended_model(Provider::OpenAi, &ids(&["gpt-4o", "gpt-4.1-mini", "gpt-5-mini", "gpt-5-mini-audio", "text-embedding-3"])).as_deref(), Some("gpt-5-mini"));
        assert_eq!(recommended_model(Provider::Claude, &ids(&["claude-haiku-5-5", "claude-sonnet-4-6", "claude-sonnet-5-5", "claude-opus-5-5"])).as_deref(), Some("claude-sonnet-5-5"));
        assert_eq!(recommended_model(Provider::Gemini, &ids(&["gemini-2.5-flash", "gemini-3-flash", "gemini-3-flash-lite", "gemini-3-pro"])).as_deref(), Some("gemini-3-flash"));
        assert_eq!(recommended_model(Provider::OpenAi, &ids(&["whisper-1"])), None);
    }

    #[test]
    fn local_server_addresses_are_normalized() {
        assert_eq!(compatible_base("http://localhost:11434"), "http://localhost:11434/v1");
        assert_eq!(compatible_base("localhost:1234/v1/"), "http://localhost:1234/v1");
    }

    /// The whole HTTP path against a fake OpenAI-compatible server: address, auth header, reply, parsing.
    #[test]
    fn list_models_sends_the_key_and_reads_the_reply() {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let port = server.server_addr().to_ip().unwrap().port();
        let handle = std::thread::spawn(move || {
            let req = server.recv().unwrap();
            let auth = req.headers().iter().find(|h| h.field.equiv("Authorization")).map(|h| h.value.as_str().to_string());
            let url = req.url().to_string();
            let reply = tiny_http::Response::from_string(r#"{"data":[{"id":"llama3.2:3b"},{"id":"qwen3:8b"}]}"#).with_header("Content-Type: application/json".parse::<tiny_http::Header>().unwrap());
            req.respond(reply).unwrap();
            (auth, url)
        });
        let found = list_models(Provider::Compatible, &format!("http://127.0.0.1:{port}/v1"), "k").unwrap();
        let (auth, url) = handle.join().unwrap();
        assert_eq!(found, vec!["llama3.2:3b", "qwen3:8b"]);
        assert_eq!(auth.as_deref(), Some("Bearer k"));
        assert_eq!(url, "/v1/models");
    }

    #[test]
    fn a_server_that_is_not_running_is_unavailable_not_a_crash() {
        let e = list_models(Provider::Compatible, "http://127.0.0.1:1/v1", "").unwrap_err();
        assert!(matches!(&e, AiError::Unavailable(m) if m.contains("Couldn't reach")), "{e:?}");
    }
}
