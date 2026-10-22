//! Settings for the feedback engine and the commands the Settings screen uses: which provider and models, the API
//! key (kept in the system's secure key storage, never in a file), the Test button, and the spending cap. Also builds
//! the model client the rep loop uses, and keeps each session's running cost.

use crate::ai::chat::ProviderLlm;
use crate::ai::providers::{catalog, compatible_base, default_base, list_models, recommended_model, AiError, Provider};
use crate::keys;
use crate::paths;
use crate::scoring::run::Budget;
use crate::storage::settings::{self, AiSettings};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;

type Cmd<T> = std::result::Result<T, String>;

/// The fast and the strong model Ensayo uses for a provider when the user has not picked one: the fast one judges
/// and classifies (most calls), the strong one words the note and reads postings and resumes.
pub fn default_models(p: Provider) -> (&'static str, &'static str) {
    match p {
        Provider::Claude => ("claude-haiku-5-5", "claude-sonnet-5-5"),
        Provider::OpenAi => ("gpt-5.4-mini", "gpt-6-sol"),
        Provider::Gemini => ("gemini-3.8-flash", "gemini-3.1-pro-preview"),
        Provider::Groq => ("openai/gpt-oss-120b", "openai/gpt-oss-120b"),
        Provider::Cerebras => ("gpt-oss-120b", "gpt-oss-120b"),
        Provider::Mistral => ("mistral-small-latest", "mistral-medium-latest"),
        Provider::OpenRouter => ("anthropic/claude-haiku-5.5", "anthropic/claude-sonnet-5.5"),
        Provider::Compatible => ("", ""),
    }
}

/// Everything needed to call the chosen engine.
#[derive(Debug, Clone, PartialEq)]
pub struct Resolved {
    pub provider: Provider,
    pub base: String,
    pub key: String,
    pub fast: String,
    pub strong: String,
    pub cap_usd: f64,
}

/// None means timing only. An error is a plain-words reason the engine cannot be used right now.
pub fn resolve(s: &AiSettings, key_of: impl Fn(&str) -> Option<String>) -> Result<Option<Resolved>, String> {
    if s.provider.trim().is_empty() {
        return Ok(None);
    }
    let provider = Provider::parse(s.provider.trim()).ok_or_else(|| "The feedback engine in Settings is not one Ensayo knows. Pick one again.".to_string())?;
    let key = key_of(provider.key_id()).unwrap_or_default();
    if provider != Provider::Compatible && key.is_empty() {
        return Err(format!("There is no {} API key saved. Add one in Settings › AI.", provider.name()));
    }
    let (fast_default, strong_default) = default_models(provider);
    let pick = |chosen: &str, default: &str| if chosen.trim().is_empty() { default.to_string() } else { chosen.trim().to_string() };
    let fast = pick(&s.fast_model, fast_default);
    let strong = if s.strong_model.trim().is_empty() && !s.fast_model.trim().is_empty() && provider == Provider::Compatible { fast.clone() } else { pick(&s.strong_model, strong_default) };
    if fast.is_empty() {
        return Err("Choose a model in Settings › AI.".to_string());
    }
    let base = if provider == Provider::Compatible {
        compatible_base(if s.base_url.trim().is_empty() { "http://localhost:11434" } else { &s.base_url })
    } else {
        default_base(provider).to_string()
    };
    let strong = if strong.is_empty() { fast.clone() } else { strong };
    Ok(Some(Resolved { provider, base, key, fast, strong, cap_usd: s.cost_cap_usd }))
}

impl Resolved {
    pub fn client(&self) -> ProviderLlm {
        ProviderLlm::new(self.provider, self.base.clone(), self.key.clone(), self.fast.clone(), self.strong.clone())
    }
}

/// The saved settings with the key looked up in the system's key storage.
pub fn resolved_from_disk() -> Result<Option<Resolved>, String> {
    let saved = settings::load(&paths::settings_file());
    resolve(&saved.ai.unwrap_or_default(), keys::get)
}

/// What each session has spent so far, kept in memory for the life of the app.
fn budgets() -> &'static Mutex<HashMap<String, Budget>> {
    static B: std::sync::OnceLock<Mutex<HashMap<String, Budget>>> = std::sync::OnceLock::new();
    B.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Runs `f` with the session's budget (a new one on the first rep), and keeps it for the next rep.
pub fn with_budget<T>(session: &str, provider: Provider, cap_usd: f64, f: impl FnOnce(&mut Budget) -> T) -> T {
    let mut taken = budgets().lock().unwrap_or_else(|e| e.into_inner()).remove(session).unwrap_or_else(|| Budget::new(provider, cap_usd));
    taken.cap_usd = cap_usd;
    let out = f(&mut taken);
    budgets().lock().unwrap_or_else(|e| e.into_inner()).insert(session.to_string(), taken);
    out
}

#[derive(Debug, Serialize)]
pub struct ProviderInfo {
    pub id: &'static str,
    pub name: &'static str,
    pub models: Vec<String>,
    pub fast_default: &'static str,
    pub strong_default: &'static str,
    pub has_key: bool,
    pub needs_key: bool,
    pub base_default: &'static str,
}

#[derive(Debug, Serialize)]
pub struct AiView {
    pub settings: AiSettings,
    pub providers: Vec<ProviderInfo>,
}

pub fn view_with(saved: &AiSettings, key_of: impl Fn(&str) -> Option<String>) -> AiView {
    AiView {
        settings: saved.clone(),
        providers: Provider::ALL
            .iter()
            .map(|p| {
                let (fast, strong) = default_models(*p);
                ProviderInfo {
                    id: p.key_id(),
                    name: p.name(),
                    models: catalog(*p).iter().map(|m| m.to_string()).collect(),
                    fast_default: fast,
                    strong_default: strong,
                    has_key: key_of(p.key_id()).is_some(),
                    needs_key: *p != Provider::Compatible,
                    base_default: default_base(*p),
                }
            })
            .collect(),
    }
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Cmd<T> + Send + 'static) -> Cmd<T> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ai_settings() -> Cmd<AiView> {
    blocking(|| Ok(view_with(&settings::load(&paths::settings_file()).ai.unwrap_or_default(), keys::get))).await
}

#[tauri::command]
pub async fn save_ai_settings(ai: AiSettings) -> Cmd<()> {
    blocking(move || {
        if !ai.provider.is_empty() && Provider::parse(&ai.provider).is_none() {
            return Err("That is not a feedback engine Ensayo knows.".to_string());
        }
        let path = paths::settings_file();
        let mut s = settings::load(&path);
        s.ai = Some(ai);
        settings::save(&path, &s).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn save_api_key(provider: String, key: String) -> Cmd<()> {
    blocking(move || {
        let p = Provider::parse(&provider).ok_or("Unknown provider")?;
        keys::set(p.key_id(), &key)
    })
    .await
}

#[tauri::command]
pub async fn clear_api_key(provider: String) -> Cmd<()> {
    blocking(move || keys::clear(Provider::parse(&provider).ok_or("Unknown provider")?.key_id())).await
}

#[derive(Debug, Serialize)]
pub struct TestResult {
    pub models: Vec<String>,
    pub recommended: Option<String>,
}

/// The Test button: asks the provider (or the local server) which models it offers. A bad key, a missing server and a
/// refused call each come back as one plain sentence. The key is never echoed.
#[tauri::command]
pub async fn test_ai(provider: String, base_url: Option<String>, key: Option<String>) -> Cmd<TestResult> {
    blocking(move || {
        let p = Provider::parse(&provider).ok_or("Unknown provider")?;
        let key = key.filter(|k| !k.trim().is_empty()).or_else(|| keys::get(p.key_id())).unwrap_or_default();
        if p != Provider::Compatible && key.is_empty() {
            return Err(format!("There is no {} API key to test yet.", p.name()));
        }
        let base = if p == Provider::Compatible { compatible_base(base_url.as_deref().filter(|b| !b.trim().is_empty()).unwrap_or("http://localhost:11434")) } else { default_base(p).to_string() };
        let models = list_models(p, &base, &key).map_err(|e| match e {
            AiError::Unavailable(m) | AiError::Failed(m) => m,
        })?;
        let recommended = recommended_model(p, &models);
        Ok(TestResult { models, recommended })
    })
    .await
}

#[tauri::command]
pub fn session_cost(session_id: String) -> f64 {
    budgets().lock().unwrap_or_else(|e| e.into_inner()).get(&session_id).map(|b| b.spend.usd).unwrap_or(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(provider: &str) -> AiSettings {
        AiSettings { provider: provider.into(), ..Default::default() }
    }

    fn no_keys(_: &str) -> Option<String> {
        None
    }

    #[test]
    fn no_provider_means_timing_only() {
        assert_eq!(resolve(&AiSettings::default(), no_keys), Ok(None));
    }

    #[test]
    fn a_cloud_provider_needs_a_saved_key_and_says_where_to_add_it() {
        let err = resolve(&s("claude"), no_keys).unwrap_err();
        assert!(err.contains("no Claude API key") && err.contains("Settings"), "{err}");
    }

    #[test]
    fn defaults_fill_in_the_fast_and_strong_models_and_the_providers_address() {
        let r = resolve(&s("claude"), |_| Some("k".into())).unwrap().unwrap();
        assert_eq!((r.fast.as_str(), r.strong.as_str()), ("claude-haiku-5-5", "claude-sonnet-5-5"));
        assert_eq!(r.base, "https://api.anthropic.com/v1");
        assert_eq!(r.cap_usd, 0.0, "AiSettings::default has no cap; saved settings carry 0.25 by serde default");
    }

    #[test]
    fn the_users_own_choices_win_over_the_defaults() {
        let mut a = s("openai");
        a.fast_model = "gpt-5.5".into();
        let r = resolve(&a, |_| Some("k".into())).unwrap().unwrap();
        assert_eq!((r.fast.as_str(), r.strong.as_str()), ("gpt-5.5", "gpt-6-sol"));
    }

    #[test]
    fn a_local_server_needs_no_key_but_needs_a_model_and_gets_the_v1_address() {
        assert!(resolve(&s("compatible"), no_keys).unwrap_err().contains("Choose a model"));
        let mut a = s("compatible");
        a.fast_model = "llama3.2:3b".into();
        let r = resolve(&a, no_keys).unwrap().unwrap();
        assert_eq!(r.base, "http://localhost:11434/v1");
        assert_eq!(r.strong, "llama3.2:3b", "one local model does both jobs");
        a.base_url = "localhost:1234".into();
        assert_eq!(resolve(&a, no_keys).unwrap().unwrap().base, "http://localhost:1234/v1");
    }

    #[test]
    fn an_unknown_provider_is_a_plain_error() {
        assert!(resolve(&s("nonsense"), no_keys).unwrap_err().contains("not one Ensayo knows"));
    }

    #[test]
    fn the_view_lists_every_provider_with_models_defaults_and_whether_a_key_is_saved() {
        let v = view_with(&s("claude"), |p| (p == "openai").then(|| "k".to_string()));
        assert_eq!(v.providers.len(), 8);
        let openai = v.providers.iter().find(|p| p.id == "openai").unwrap();
        assert!(openai.has_key && openai.needs_key && !openai.models.is_empty());
        assert!(!v.providers.iter().find(|p| p.id == "claude").unwrap().has_key);
        assert!(!v.providers.iter().find(|p| p.id == "compatible").unwrap().needs_key);
    }

    #[test]
    fn a_session_keeps_its_running_cost_between_reps() {
        use crate::ai::llm::LlmReply;
        let id = "ses_cost_test";
        with_budget(id, Provider::Claude, 1.0, |b| b.spend.add(&LlmReply { text: String::new(), input_tokens: 1_000_000, output_tokens: 0, model: "claude-haiku-5-5".into() }));
        let first = session_cost(id.into());
        assert!(first > 0.0);
        with_budget(id, Provider::Claude, 1.0, |b| assert!((b.spend.usd - first).abs() < 1e-12));
    }
}
