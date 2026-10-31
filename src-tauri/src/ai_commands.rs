//! Settings for the feedback engine and the commands the Settings screen uses: which provider and models, the API
//! key (kept in the system's secure key storage, never in a file), the Test button, and the spending cap. Also builds
//! the model client the rep loop uses, and keeps each session's running cost.

use crate::ai::chat::ProviderLlm;
use crate::ai::llm::Llm;
use crate::ai::local;
use crate::ai::local_models::{self, LocalModel};
use crate::ai::providers::{catalog, compatible_base, default_base, list_models, recommended_model, AiError, Provider};
use crate::keys;
use crate::models_store;
use crate::paths;
use crate::scoring::run::Budget;
use crate::storage::settings::{self, AiSettings};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use voice_engine_models::Status;

type Cmd<T> = std::result::Result<T, String>;

/// The fast and the strong model Ensayo uses for a provider when the user has not picked one: the fast one judges
/// and classifies (most calls), the strong one words the note and reads postings and resumes.
pub fn default_models(p: Provider) -> (&'static str, &'static str) {
    match p {
        // Middle models for the per-answer work too (decided 2026-10-27): the judgement is the point of a key, and a
        // session on Sonnet is still cents. Haiku and the smaller ones stay in the list for anyone who wants cheaper.
        Provider::Claude => ("claude-sonnet-5-5", "claude-sonnet-5-5"),
        Provider::OpenAi => ("gpt-6-luna", "gpt-6-sol"),
        Provider::Gemini => ("gemini-3.8-flash", "gemini-3.1-pro-preview"),
        Provider::Groq => ("openai/gpt-oss-120b", "openai/gpt-oss-120b"),
        Provider::Cerebras => ("gpt-oss-120b", "gpt-oss-120b"),
        Provider::Mistral => ("mistral-small-latest", "mistral-medium-latest"),
        Provider::OpenRouter => ("anthropic/claude-sonnet-5.5", "anthropic/claude-sonnet-5.5"),
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
    let provider = Provider::parse(s.provider.trim()).ok_or_else(|| format!("The feedback engine saved in Settings (\"{}\") is not one Ensayo knows. Pick one again in Settings › AI.", s.provider.trim()))?;
    let key = key_of(provider.key_id()).unwrap_or_default();
    if provider != Provider::Compatible && key.is_empty() {
        return Err(format!("There is no {} API key saved. Add one in Settings › AI.", provider.name()));
    }
    let (fast_default, strong_default) = default_models(provider);
    let pick = |chosen: &str, default: &str| if chosen.trim().is_empty() { default.to_string() } else { chosen.trim().to_string() };
    let fast = pick(&s.fast_model, fast_default);
    let strong = if s.strong_model.trim().is_empty() && !s.fast_model.trim().is_empty() && provider == Provider::Compatible { fast.clone() } else { pick(&s.strong_model, strong_default) };
    if fast.is_empty() {
        return Err(format!("No {} model is chosen. Choose one in Settings › AI.", provider.name()));
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

/// The `AiSettings::provider` value that means the built-in local AI (the `ensayo-llm` helper).
pub const LOCAL: &str = "local";

/// The built-in local AI, ready to run: which model, and where its file is.
#[derive(Debug, Clone, PartialEq)]
pub struct LocalChoice {
    pub id: &'static str,
    pub name: &'static str,
    pub file: PathBuf,
}

/// Which engine judges the answers.
#[derive(Debug, Clone, PartialEq)]
pub enum Engine {
    Cloud(Resolved),
    Local(LocalChoice),
}

impl Engine {
    /// The model client for this engine. The local one is shared, so the loaded model stays warm between answers.
    pub fn client(&self) -> Box<dyn Llm> {
        match self {
            Engine::Cloud(r) => Box::new(crate::logging::LoggedLlm::new(Box::new(r.client()), r.provider.key_id())),
            Engine::Local(l) => Box::new(crate::logging::LoggedLlm::new(Box::new(local::shared(&local::helper_path(), &l.file, l.id)), "local")),
        }
    }

    /// The provider and spending cap a session's budget is kept with. Local use costs nothing, so it is counted
    /// like a local server (`Provider::Compatible` is free) with no cap.
    pub fn budget_basis(&self) -> (Provider, f64) {
        match self {
            Engine::Cloud(r) => (r.provider, r.cap_usd),
            Engine::Local(_) => (Provider::Compatible, 0.0),
        }
    }
}

/// `resolve`, plus the built-in local AI (provider "local"): it needs no key but needs its model on this computer,
/// in the shared models folder (Ensayo's or another app's copy). `locate` finds a model (the real one asks the store).
/// The model is named by `fast_model` (empty, or anything that is not a local model id, means the recommended one);
/// Fast and Strong tasks use the same model.
pub fn resolve_engine(s: &AiSettings, key_of: impl Fn(&str) -> Option<String>, locate: impl Fn(&LocalModel) -> Status) -> Result<Option<Engine>, String> {
    if s.provider.trim() != LOCAL {
        return resolve(s, key_of).map(|r| r.map(Engine::Cloud));
    }
    let model = local_models::choose(&s.fast_model);
    let file = model.file_in(&locate(model)).ok_or_else(|| format!("The local AI model ({}) isn't downloaded yet. Download it in Settings › AI.", model.info.name))?;
    Ok(Some(Engine::Local(LocalChoice { id: model.info.id, name: model.info.name, file })))
}

/// The saved settings with the key looked up in the system's key storage.
pub fn resolved_from_disk() -> Result<Option<Engine>, String> {
    let saved = settings::load(&paths::settings_file());
    let store = models_store::store()?;
    let engine = resolve_engine(&saved.ai.unwrap_or_default(), keys::get, |m| store.status(m.info.id));
    // Ensayo is using the model it just found: another app's Delete must leave it alone.
    if let Ok(Some(Engine::Local(l))) = &engine {
        let _ = store.use_model(l.id);
    }
    engine
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
    // Settings may have changed engine since the last rep (cloud to local, say): the new one's prices apply.
    taken.provider = provider;
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
        if !ai.provider.is_empty() && ai.provider != LOCAL && Provider::parse(&ai.provider).is_none() {
            return Err("That is not a feedback engine Ensayo knows.".to_string());
        }
        // Leaving the built-in local AI frees its memory now instead of after its idle minutes.
        if ai.provider != LOCAL {
            local::stop_shared();
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
        let _t = crate::logging::Timer::new("test_ai");
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

/// One model a local server offers, with the context size it says it has.
#[derive(Debug, Serialize, PartialEq)]
pub struct DetectedModel {
    pub id: String,
    pub context_length: Option<u32>,
}

/// A local AI server (Ollama or LM Studio) found on this computer.
#[derive(Debug, Serialize, PartialEq)]
pub struct DetectedServer {
    /// "ollama" or "lm_studio".
    pub kind: &'static str,
    /// The address to type in Settings, such as `http://127.0.0.1:11434`.
    pub base_url: String,
    /// The same with `/v1`: where the chat requests go.
    pub api_base: String,
    /// False when something answers there but its model list couldn't be read.
    pub running: bool,
    pub models: Vec<DetectedModel>,
}

/// What the Settings screen needs from the engine's list of running servers.
pub fn detected(servers: Vec<voice_engine_client::servers::LocalServer>) -> Vec<DetectedServer> {
    use voice_engine_client::servers::{ServerKind, ServerState};
    servers
        .into_iter()
        .map(|s| DetectedServer {
            kind: match s.kind {
                ServerKind::Ollama => "ollama",
                ServerKind::LmStudio => "lm_studio",
            },
            running: s.state == ServerState::Running,
            base_url: s.base_url,
            api_base: s.api_base,
            models: s.models.into_iter().map(|m| DetectedModel { id: m.id, context_length: m.context_length }).collect(),
        })
        .collect()
}

/// Looks for Ollama and LM Studio on this computer and lists their models. Settings › AI asks only when the person opens
/// the Ollama or LM Studio screen: it connects to the two usual ports and gives up quickly on one that isn't there.
/// Model names are the person's own, so none is logged.
#[tauri::command]
pub async fn detect_local_servers() -> Cmd<Vec<DetectedServer>> {
    blocking(|| {
        let _t = crate::logging::Timer::new("detect_local_servers");
        Ok(detected(voice_engine_client::servers::detect()))
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
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use voice_engine_client::servers::{detect_at, Probe, ServerKind};

    /// A server on this computer that answers each request with `answer(method, path)`, until the test ends.
    fn fake_server(answer: fn(&str, &str) -> String) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { break };
                std::thread::spawn(move || {
                    let mut head = Vec::new();
                    let mut byte = [0u8; 1];
                    while !head.ends_with(b"\r\n\r\n") && stream.read(&mut byte).map(|n| n > 0).unwrap_or(false) {
                        head.push(byte[0]);
                    }
                    let head = String::from_utf8_lossy(&head).to_string();
                    let mut first = head.lines().next().unwrap_or("").split(' ');
                    let (method, path) = (first.next().unwrap_or(""), first.next().unwrap_or(""));
                    let length = head.lines().find_map(|l| l.to_ascii_lowercase().strip_prefix("content-length:").and_then(|v| v.trim().parse::<usize>().ok())).unwrap_or(0);
                    let mut body = vec![0u8; length];
                    let _ = stream.read_exact(&mut body);
                    let text = answer(method, path);
                    let _ = write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{text}", text.len());
                });
            }
        });
        format!("http://{addr}")
    }

    fn ollama(_method: &str, path: &str) -> String {
        match path {
            "/api/tags" => r#"{"models":[{"name":"llama3.2:3b","size":2019393189}]}"#.into(),
            "/api/show" => r#"{"model_info":{"general.architecture":"llama","llama.context_length":131072}}"#.into(),
            _ => "{}".into(),
        }
    }

    fn lm_studio(_method: &str, path: &str) -> String {
        match path {
            "/api/v0/models" => r#"{"data":[{"id":"qwen3-8b","type":"llm","max_context_length":40960},{"id":"embed","type":"embeddings","max_context_length":2048}]}"#.into(),
            _ => "{}".into(),
        }
    }

    #[test]
    fn running_servers_come_back_with_their_models_and_context_sizes_and_the_ones_not_there_are_left_out() {
        let gone = {
            let l = TcpListener::bind("127.0.0.1:0").unwrap();
            format!("http://{}", l.local_addr().unwrap())
        };
        let probes = [
            Probe { kind: ServerKind::Ollama, base_url: fake_server(ollama) },
            Probe { kind: ServerKind::LmStudio, base_url: fake_server(lm_studio) },
            Probe { kind: ServerKind::LmStudio, base_url: gone },
        ];
        let found = detected(detect_at(&probes));
        assert_eq!(found.len(), 2, "the one that isn't there is left out");
        assert_eq!((found[0].kind, found[0].running), ("ollama", true));
        assert_eq!(found[0].models, [DetectedModel { id: "llama3.2:3b".into(), context_length: Some(131_072) }]);
        assert_eq!((found[1].kind, found[1].running), ("lm_studio", true));
        assert_eq!(found[1].models, [DetectedModel { id: "qwen3-8b".into(), context_length: Some(40_960) }], "an embeddings model can't chat");
        assert_eq!(found[0].api_base, format!("{}/v1", found[0].base_url));
    }

    #[test]
    fn a_server_that_answers_with_something_else_is_listed_as_not_readable() {
        let probes = [Probe { kind: ServerKind::Ollama, base_url: fake_server(|_, _| "not what we expect".into()) }];
        let found = detected(detect_at(&probes));
        assert_eq!(found.len(), 1);
        assert!(!found[0].running && found[0].models.is_empty());
    }

    #[test]
    fn the_answer_has_the_shape_the_screen_reads() {
        let found = detected(detect_at(&[Probe { kind: ServerKind::Ollama, base_url: fake_server(ollama) }]));
        let json = serde_json::to_value(&found).unwrap();
        assert_eq!(json[0]["kind"], "ollama");
        assert_eq!(json[0]["running"], true);
        assert!(json[0]["api_base"].as_str().unwrap().ends_with("/v1"));
        assert_eq!(json[0]["models"][0]["id"], "llama3.2:3b");
        assert_eq!(json[0]["models"][0]["context_length"], 131_072);
    }

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
        assert_eq!((r.fast.as_str(), r.strong.as_str()), ("claude-sonnet-5-5", "claude-sonnet-5-5"));
        assert_eq!(r.base, "https://api.anthropic.com/v1");
        assert_eq!(r.cap_usd, 1.0, "a fresh setting has the 1 dollar cap, saved or not");
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
        assert!(resolve(&s("compatible"), no_keys).unwrap_err().contains("Choose one in Settings"));
        let mut a = s("compatible");
        a.fast_model = "llama3.2:3b".into();
        let r = resolve(&a, no_keys).unwrap().unwrap();
        assert_eq!(r.base, "http://localhost:11434/v1");
        assert_eq!(r.strong, "llama3.2:3b", "one local model does both jobs");
        a.base_url = "localhost:1234".into();
        assert_eq!(resolve(&a, no_keys).unwrap().unwrap().base, "http://localhost:1234/v1");
    }

    fn found(m: &LocalModel) -> Status {
        Status::Installed { dir: PathBuf::from("/models").join(m.info.id), users: vec![voice_engine_models::App::Ensayo], used_by_me: true }
    }

    fn not_found(_: &LocalModel) -> Status {
        Status::Missing
    }

    #[test]
    fn the_local_engine_needs_its_model_and_says_where_to_download_it() {
        let err = resolve_engine(&s("local"), no_keys, not_found).unwrap_err();
        assert!(err.contains("isn't downloaded yet") && err.contains("Settings › AI"), "{err}");
    }

    #[test]
    fn the_local_engine_needs_no_key_and_runs_the_model_where_it_was_found() {
        let Some(Engine::Local(l)) = resolve_engine(&s("local"), no_keys, found).unwrap() else { panic!("expected the local engine") };
        assert_eq!((l.id, l.name), ("qwen3.5-4b", "Qwen3.5 4B"));
        assert_eq!(l.file, PathBuf::from("/models/qwen3.5-4b/Qwen3.5-4B-Q4_K_M.gguf"));
        // A copy another app downloaded counts too.
        let other = |m: &LocalModel| Status::Installed { dir: PathBuf::from("/shared").join(m.info.id), users: vec![voice_engine_models::App::Talaan], used_by_me: false };
        let Some(Engine::Local(l)) = resolve_engine(&s("local"), no_keys, other).unwrap() else { panic!() };
        assert_eq!(l.file, PathBuf::from("/shared/qwen3.5-4b/Qwen3.5-4B-Q4_K_M.gguf"));
        // A half-finished download is not a model.
        let half = |_: &LocalModel| Status::Partial { fraction: 0.5, bytes: 1, cancelled: false };
        assert!(resolve_engine(&s("local"), no_keys, half).is_err());
    }

    #[test]
    fn the_saved_model_picks_the_local_size_and_a_cloud_leftover_means_the_recommended_one() {
        let mut a = s("local");
        a.fast_model = "qwen3.5-9b".into();
        let Some(Engine::Local(l)) = resolve_engine(&a, no_keys, found).unwrap() else { panic!() };
        assert_eq!(l.id, "qwen3.5-9b");
        a.fast_model = "claude-haiku-5-5".into();
        let Some(Engine::Local(l)) = resolve_engine(&a, no_keys, found).unwrap() else { panic!() };
        assert_eq!(l.id, "qwen3.5-4b");
        // Only the chosen model has to be there.
        a.fast_model = "qwen3.5-9b".into();
        assert!(resolve_engine(&a, no_keys, |m| if m.recommended { found(m) } else { Status::Missing }).is_err());
    }

    #[test]
    fn the_other_engines_resolve_as_before() {
        assert_eq!(resolve_engine(&AiSettings::default(), no_keys, not_found), Ok(None));
        assert!(resolve_engine(&s("claude"), no_keys, found).unwrap_err().contains("no Claude API key"));
        let Some(Engine::Cloud(r)) = resolve_engine(&s("claude"), |_| Some("k".into()), not_found).unwrap() else { panic!() };
        assert_eq!(Some(r), resolve(&s("claude"), |_| Some("k".into())).unwrap());
    }

    #[test]
    fn local_use_is_free_and_uncapped() {
        use crate::ai::llm::LlmReply;
        let local = Engine::Local(LocalChoice { id: "qwen3.5-4b", name: "Qwen3.5 4B", file: PathBuf::from("/m.gguf") });
        let (provider, cap) = local.budget_basis();
        assert_eq!(cap, 0.0);
        // Even a model id that is in the price table (a local server or a mislabelled reply) costs nothing here.
        let reply = LlmReply { text: String::new(), input_tokens: 5_000_000, output_tokens: 1_000_000, model: "claude-opus-5-5".into() };
        with_budget("ses_local_free", provider, cap, |b| {
            b.spend.add_from(b.provider, &reply);
            assert_eq!((b.spend.usd, b.spend.calls, b.spend.input_tokens, b.spend.approx), (0.0, 1, 5_000_000, false));
            assert!(!b.spend.would_exceed(0.25));
        });
        assert_eq!(session_cost("ses_local_free".into()), 0.0);
        let cloud = Engine::Cloud(resolve(&s("claude"), |_| Some("k".into())).unwrap().unwrap());
        assert_eq!(cloud.budget_basis().0, Provider::Claude);
    }

    #[test]
    fn switching_engine_mid_session_uses_the_new_engines_prices() {
        use crate::ai::llm::LlmReply;
        let id = "ses_switch_test";
        let reply = LlmReply { text: String::new(), input_tokens: 1_000_000, output_tokens: 0, model: "claude-haiku-5-5".into() };
        with_budget(id, Provider::Compatible, 0.0, |b| b.spend.add_from(b.provider, &reply));
        assert_eq!(session_cost(id.into()), 0.0);
        with_budget(id, Provider::Claude, 1.0, |b| b.spend.add_from(b.provider, &reply));
        assert!(session_cost(id.into()) > 0.0, "a session that started on a free engine still counts Claude's price once it switches");
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
