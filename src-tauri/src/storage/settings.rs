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
    /// Which computer this is, made once and kept here (machine-local, never in the data folder). The lock file uses
    /// it instead of the host name, which two computers can share and one computer can change.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub install_id: Option<String>,
    /// Keys a newer Ensayo wrote. Kept so an older build does not delete them when it saves.
    #[serde(flatten)]
    pub other: Map<String, Value>,
}

/// A new random install id. The standard library seeds each `RandomState` from the system's random source.
fn new_install_id() -> String {
    use std::hash::{BuildHasher, Hasher};
    let mut id = String::from("inst_");
    for _ in 0..2 {
        id.push_str(&format!("{:016x}", std::collections::hash_map::RandomState::new().build_hasher().finish()));
    }
    id
}

/// This install's id. Made and saved the first time it is asked for. Errors (a damaged settings file) are left to
/// the caller: it must not guess an id, or the lock would say another computer.
pub fn install_id(path: &Path) -> Result<String> {
    // Two commands can ask at the same moment on the first start: without this each would make its own id, and the
    // lock written with one would name a computer that the saved settings no longer know.
    static MAKING: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = MAKING.lock().unwrap_or_else(|e| e.into_inner());
    let mut s = load_for_update(path)?;
    if let Some(id) = s.install_id.as_deref().filter(|i| !i.trim().is_empty()) {
        return Ok(id.to_string());
    }
    let id = new_install_id();
    s.install_id = Some(id.clone());
    save(path, &s)?;
    Ok(id)
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

/// What the settings file is: not there yet, fine, or there but not readable as settings.
#[derive(Debug, PartialEq)]
enum Read {
    Missing,
    Good(LocalSettings),
    Damaged,
}

fn read(path: &Path) -> Read {
    match read_text(path) {
        Ok(None) => Read::Missing,
        Ok(Some(t)) => serde_json::from_str(&t).map(Read::Good).unwrap_or(Read::Damaged),
        Err(_) => Read::Damaged,
    }
}

/// The plain line shown when the settings file can't be read and there is no good copy.
pub const DAMAGED_LINE: &str = "Ensayo's settings file is damaged. Your data is safe. Choose your data folder again.";

fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.file_name().map(|n| n.to_os_string()).unwrap_or_default();
    name.push(suffix);
    path.with_file_name(name)
}

fn backup_path(path: &Path) -> PathBuf {
    sibling(path, ".bak")
}

/// Moves a damaged settings file to `settings.json.damaged-<time>`. It is never overwritten in place.
fn move_aside(path: &Path) {
    let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
    let mut target = sibling(path, &format!(".damaged-{stamp}"));
    let mut n = 2;
    while target.exists() {
        target = sibling(path, &format!(".damaged-{stamp}-{n}"));
        n += 1;
    }
    if std::fs::rename(path, &target).is_err() && std::fs::copy(path, &target).is_ok() {
        let _ = std::fs::remove_file(path);
    }
}

/// The settings file is damaged: put the last good copy (`.bak`) in its place when that parses, with the damaged
/// file kept beside it. None when there is no good copy.
fn restore_from_backup(path: &Path) -> Option<LocalSettings> {
    let text = read_text(&backup_path(path)).ok().flatten()?;
    let good: LocalSettings = serde_json::from_str(&text).ok()?;
    move_aside(path);
    atomic_write(path, text.as_bytes()).ok()?;
    log::warn!("The settings file was damaged; the last good copy was restored");
    Some(good)
}

/// Settings for reading. A missing file is the defaults; a damaged one is restored from the last good copy when
/// there is one. When there is none this still answers with defaults (so reading never stops the app), and nothing is
/// written: callers that change settings use `load_for_update`, and the app asks `is_damaged` at start.
pub fn load(path: &Path) -> LocalSettings {
    match read(path) {
        Read::Missing => LocalSettings::default(),
        Read::Good(s) => s,
        Read::Damaged => restore_from_backup(path).unwrap_or_default(),
    }
}

/// True when the settings file can't be read and has no good copy to restore. The app then asks for the data folder.
pub fn is_damaged(path: &Path) -> bool {
    read(path) == Read::Damaged && restore_from_backup(path).is_none()
}

/// Settings for load-modify-save. A damaged file with no good copy is an error, so defaults are never written over
/// it.
pub fn load_for_update(path: &Path) -> Result<LocalSettings> {
    match read(path) {
        Read::Missing => Ok(LocalSettings::default()),
        Read::Good(s) => Ok(s),
        Read::Damaged => restore_from_backup(path).ok_or_else(|| StorageError::Invalid(DAMAGED_LINE.into())),
    }
}

/// Saves. The current good file is first copied to `settings.json.bak`, so there is always a last good copy. A
/// damaged file is moved aside first and never overwritten in place.
pub fn save(path: &Path, settings: &LocalSettings) -> Result<()> {
    let text = serde_json::to_string_pretty(settings).map_err(|e| StorageError::Json(path.to_path_buf(), e.to_string()))?;
    match read(path) {
        Read::Good(_) => {
            if let Ok(Some(current)) = read_text(path) {
                let _ = atomic_write(&backup_path(path), current.as_bytes());
            }
        }
        Read::Damaged => move_aside(path),
        Read::Missing => {}
    }
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
    // The way out of a damaged file: it is moved aside and the choice starts a fresh one.
    let mut s = match read(settings_path) {
        Read::Damaged => restore_from_backup(settings_path).unwrap_or_else(|| {
            move_aside(settings_path);
            LocalSettings::default()
        }),
        Read::Good(s) => s,
        Read::Missing => LocalSettings::default(),
    };
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

    fn damaged_siblings(dir: &Path) -> Vec<String> {
        let mut v: Vec<String> = fs::read_dir(dir).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into_owned()).filter(|n| n.contains(".damaged-")).collect();
        v.sort();
        v
    }

    #[test]
    fn a_save_keeps_the_previous_good_file_as_the_backup() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        save(&path, &LocalSettings { data_folder: Some("/one".into()), ..Default::default() }).unwrap();
        assert!(!dir.path().join("settings.json.bak").exists(), "nothing to back up on the first save");
        save(&path, &LocalSettings { data_folder: Some("/two".into()), ..Default::default() }).unwrap();
        assert_eq!(load(&path).data_folder.as_deref(), Some("/two"));
        let bak: LocalSettings = serde_json::from_str(&fs::read_to_string(dir.path().join("settings.json.bak")).unwrap()).unwrap();
        assert_eq!(bak.data_folder.as_deref(), Some("/one"));
    }

    #[test]
    fn a_missing_file_is_defaults_and_not_damaged() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        assert_eq!(load(&path), LocalSettings::default());
        assert!(!is_damaged(&path));
        assert!(load_for_update(&path).is_ok());
    }

    #[test]
    fn a_damaged_file_is_restored_from_the_backup_and_kept_aside() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        save(&path, &LocalSettings { data_folder: Some("/one".into()), ..Default::default() }).unwrap();
        save(&path, &LocalSettings { data_folder: Some("/two".into()), ..Default::default() }).unwrap();
        fs::write(&path, "{ not json").unwrap();
        assert!(!is_damaged(&path), "a good backup means no question for the person");
        assert_eq!(load(&path).data_folder.as_deref(), Some("/one"), "the last good copy");
        assert_eq!(load(&path).data_folder.as_deref(), Some("/one"), "and it stays restored");
        let aside = damaged_siblings(dir.path());
        assert_eq!(aside.len(), 1, "{aside:?}");
        assert_eq!(fs::read_to_string(dir.path().join(&aside[0])).unwrap(), "{ not json");
    }

    #[test]
    fn a_damaged_file_without_a_backup_is_flagged_and_never_overwritten_by_an_update() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, "{ not json").unwrap();
        assert!(is_damaged(&path));
        let err = load_for_update(&path).unwrap_err().to_string();
        assert_eq!(err, DAMAGED_LINE);
        assert_eq!(fs::read_to_string(&path).unwrap(), "{ not json", "the file is untouched");
        assert!(damaged_siblings(dir.path()).is_empty());
        // Reading still answers, with defaults.
        assert_eq!(load(&path), LocalSettings::default());
    }

    #[test]
    fn a_damaged_backup_does_not_count_as_a_good_copy() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, "nope").unwrap();
        fs::write(dir.path().join("settings.json.bak"), "also nope").unwrap();
        assert!(is_damaged(&path));
    }

    #[test]
    fn choosing_the_folder_again_moves_the_damaged_file_aside_and_starts_a_fresh_one() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let folder = dir.path().join("data");
        fs::create_dir_all(&folder).unwrap();
        fs::write(&path, "{ not json").unwrap();
        set_data_folder(&path, &folder).unwrap();
        assert!(!is_damaged(&path));
        assert_eq!(load(&path).data_folder.as_deref(), Some(folder.to_string_lossy().as_ref()));
        let aside = damaged_siblings(dir.path());
        assert_eq!(aside.len(), 1);
        assert_eq!(fs::read_to_string(dir.path().join(&aside[0])).unwrap(), "{ not json");
    }

    #[test]
    fn save_never_overwrites_a_damaged_file_in_place() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, "{ not json").unwrap();
        save(&path, &LocalSettings::default()).unwrap();
        let aside = damaged_siblings(dir.path());
        assert_eq!(aside.len(), 1);
        assert_eq!(fs::read_to_string(dir.path().join(&aside[0])).unwrap(), "{ not json");
    }

    #[test]
    fn the_install_id_is_made_once_kept_and_not_lost_by_other_saves() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let id = install_id(&path).unwrap();
        assert!(id.starts_with("inst_") && id.len() > 20);
        assert_eq!(install_id(&path).unwrap(), id);
        let mut s = load_for_update(&path).unwrap();
        s.audio_retention = Some("7".into());
        save(&path, &s).unwrap();
        assert_eq!(install_id(&path).unwrap(), id);
        assert_ne!(install_id(&dir.path().join("other.json")).unwrap(), id, "each install gets its own");
    }

    #[test]
    fn the_install_id_is_never_guessed_over_a_damaged_settings_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, "{ nope").unwrap();
        assert!(install_id(&path).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "{ nope");
    }
}
