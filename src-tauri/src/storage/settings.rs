//! Machine-local settings: the few things that must differ per computer and so never live in the (possibly synced)
//! data folder. Today that is which folder holds the data.

use super::io::{atomic_write, read_text};
use super::{Result, StorageError};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

/// Which engine judges the answers. Empty `provider` means timing only (no AI). Keys never live here: they are in
/// the system's secure key storage (`keys.rs`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiSettings {
    /// A `Provider::key_id` ("claude", "openai", ..., "compatible"), or empty for timing only.
    #[serde(default)]
    pub provider: String,
    /// Model for classify, score, follow-up and parse. Empty means the provider's default.
    #[serde(default)]
    pub fast_model: String,
    /// Model for the coach note, job posting and resume. Empty means the provider's default.
    #[serde(default)]
    pub strong_model: String,
    /// Where an OpenAI-compatible or local server listens ("http://localhost:11434").
    #[serde(default)]
    pub base_url: String,
    /// Stop using AI for the rest of a session once its estimated cost passes this. 0 means no cap.
    #[serde(default = "default_cap")]
    pub cost_cap_usd: f64,
}

/// 1 dollar. On a middle model (Sonnet 5.5, GPT-6 Luna) an answer costs a few cents, a follow-up and each "Again" as
/// much again, so a five-question session with follow-ups and retries can reach 50 cents to a dollar; a Mock debrief
/// and a thinking model's reasoning add more. The cap is there to stop a runaway, not to cut a normal session short.
fn default_cap() -> f64 {
    1.0
}

/// Written by hand so a fresh setting has the cap too: the derived default was 0 (no cap), and setup saved that back,
/// so every new user ran with no cap at all.
impl Default for AiSettings {
    fn default() -> Self {
        AiSettings { provider: String::new(), fast_model: String::new(), strong_model: String::new(), base_url: String::new(), cost_cap_usd: default_cap() }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct LocalSettings {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ai: Option<AiSettings>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data_folder: Option<String>,
    /// How long answer audio is kept on this computer: "7", "30" (the default), "90", "forever" or "none".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub audio_retention: Option<String>,
    /// Use the graphics card for speech and the built-in local AI. None: the default (on for a Mac, on for Windows only
    /// with a discrete card). Machine-local, since the card is.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gpu: Option<bool>,
    /// Keys a newer Ensayo wrote. Kept so an older build does not delete them when it saves.
    #[serde(flatten)]
    pub other: Map<String, Value>,
}

/// Days to keep answer audio. None means forever; Some(0) means do not keep it at all.
pub fn retention_days(s: &LocalSettings) -> Option<u32> {
    match s.audio_retention.as_deref().map(str::trim) {
        Some("forever") => None,
        Some("none") => Some(0),
        Some(n) => n.parse().ok().or(Some(30)),
        None => Some(30),
    }
}

/// A missing or damaged file is just the defaults: settings must never stop the app from starting.
pub fn load(path: &Path) -> LocalSettings {
    read_text(path).ok().flatten().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

pub fn save(path: &Path, settings: &LocalSettings) -> Result<()> {
    let text = serde_json::to_string_pretty(settings).map_err(|e| StorageError::Json(path.to_path_buf(), e.to_string()))?;
    atomic_write(path, format!("{text}\n").as_bytes())
}

fn non_empty(s: Option<&str>) -> Option<&str> {
    s.map(str::trim).filter(|s| !s.is_empty())
}

/// The environment (`ENSAYO_DATA_DIR`, for tests and for pointing at a synced folder), then the saved choice, then
/// the default inside the app's local folder.
pub fn resolve_data_folder(env: Option<&str>, saved: &LocalSettings, default: &Path) -> PathBuf {
    non_empty(env).or_else(|| non_empty(saved.data_folder.as_deref())).map(PathBuf::from).unwrap_or_else(|| default.to_path_buf())
}

/// Saves a new data folder choice. The folder must already exist: a path that is not there (a drive that is not
/// mounted) is refused instead of being created empty.
pub fn set_data_folder(settings_path: &Path, folder: &Path) -> Result<()> {
    if !folder.is_dir() {
        return Err(StorageError::Unavailable(folder.to_path_buf()));
    }
    let mut s = load(settings_path);
    s.data_folder = Some(folder.to_string_lossy().into_owned());
    save(settings_path, &s)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn the_environment_beats_the_saved_setting_which_beats_the_default() {
        let default = PathBuf::from("/default/data");
        let saved = LocalSettings { data_folder: Some("/saved/data".into()), ..Default::default() };
        assert_eq!(resolve_data_folder(Some("/env/data"), &saved, &default), PathBuf::from("/env/data"));
        assert_eq!(resolve_data_folder(None, &saved, &default), PathBuf::from("/saved/data"));
        assert_eq!(resolve_data_folder(None, &LocalSettings::default(), &default), default);
    }

    #[test]
    fn audio_retention_defaults_to_thirty_days_and_reads_the_choices() {
        let with = |v: Option<&str>| LocalSettings { audio_retention: v.map(String::from), ..Default::default() };
        assert_eq!(retention_days(&with(None)), Some(30));
        assert_eq!(retention_days(&with(Some("7"))), Some(7));
        assert_eq!(retention_days(&with(Some("90"))), Some(90));
        assert_eq!(retention_days(&with(Some("forever"))), None);
        assert_eq!(retention_days(&with(Some("none"))), Some(0));
        assert_eq!(retention_days(&with(Some("garbage"))), Some(30));
    }

    #[test]
    fn ai_settings_round_trip_beside_the_data_folder_and_default_to_a_quarter_cap() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let mut s = LocalSettings::default();
        s.data_folder = Some("/x".into());
        s.ai = Some(AiSettings { provider: "claude".into(), cost_cap_usd: 1.0, ..Default::default() });
        save(&path, &s).unwrap();
        let back = load(&path);
        assert_eq!(back.data_folder.as_deref(), Some("/x"));
        assert_eq!(back.ai.as_ref().unwrap().provider, "claude");
        assert_eq!(back.ai.unwrap().cost_cap_usd, 1.0);
        let partial: LocalSettings = serde_json::from_str(r#"{"ai": {"provider": "openai"}}"#).unwrap();
        assert_eq!(partial.ai.unwrap().cost_cap_usd, 1.0);
    }

    #[test]
    fn the_graphics_card_choice_is_unset_until_made_and_survives_a_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        assert_eq!(load(&path).gpu, None, "no file: the default");
        save(&path, &LocalSettings::default()).unwrap();
        assert!(!fs::read_to_string(&path).unwrap().contains("gpu"), "unset is not written");
        for choice in [true, false] {
            save(&path, &LocalSettings { gpu: Some(choice), ..Default::default() }).unwrap();
            assert_eq!(load(&path).gpu, Some(choice));
        }
    }

    #[test]
    fn an_empty_value_counts_as_not_set() {
        let default = PathBuf::from("/default/data");
        let blank = LocalSettings { data_folder: Some("  ".into()), ..Default::default() };
        assert_eq!(resolve_data_folder(Some(""), &blank, &default), default);
    }

    #[test]
    fn settings_round_trip_and_keep_keys_this_version_does_not_know() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, r#"{"data_folder": "/x", "future_setting": {"a": 1}}"#).unwrap();
        let mut s = load(&path);
        assert_eq!(s.data_folder.as_deref(), Some("/x"));
        s.data_folder = Some("/y".into());
        save(&path, &s).unwrap();
        let text = fs::read_to_string(&path).unwrap();
        assert!(text.contains("future_setting"), "{text}");
        assert_eq!(load(&path).data_folder.as_deref(), Some("/y"));
    }

    #[test]
    fn a_missing_or_damaged_settings_file_is_just_the_defaults() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load(&dir.path().join("nope.json")).data_folder, None);
        let bad = dir.path().join("bad.json");
        fs::write(&bad, "garbage").unwrap();
        assert_eq!(load(&bad).data_folder, None);
    }

    #[test]
    fn choosing_a_folder_that_is_not_there_is_refused_and_saves_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let err = set_data_folder(&path, &dir.path().join("not-mounted")).unwrap_err();
        assert!(matches!(err, StorageError::Unavailable(_)), "{err:?}");
        assert!(!path.exists());
    }

    #[test]
    fn choosing_an_existing_folder_saves_it() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let chosen = dir.path().join("Drive Data");
        fs::create_dir(&chosen).unwrap();
        set_data_folder(&path, &chosen).unwrap();
        assert_eq!(load(&path).data_folder.as_deref(), Some(chosen.to_string_lossy().as_ref()));
    }

    #[test]
    fn the_default_folder_is_inside_the_app_local_folder() {
        assert!(crate::paths::default_data_dir().starts_with(crate::paths::app_local()));
    }
}
