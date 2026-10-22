//! Tauri commands for the data folder: profile, stories, methods and the state of the folder. The logic lives in
//! `storage`; these only pick the folder and turn errors into plain strings. Every command is async and does its
//! file work on a blocking thread (a long synchronous command freezes the window on Windows).

use crate::paths;
use crate::storage::conflicts::{Conflict, Keep};
use crate::storage::lock::{machine_name, LockState};
use crate::storage::model::{Method, Profile, Story};
use crate::storage::relocate;
use crate::storage::settings;
use crate::storage::{Result as StorageResult, Storage, StorageError};
use chrono::{DateTime, Utc};
use serde::Serialize;
use std::path::{Path, PathBuf};

type Cmd<T> = std::result::Result<T, String>;

fn plain(e: StorageError) -> String {
    match e {
        StorageError::Unavailable(p) => format!("The data folder isn't available: {}", p.display()),
        other => other.to_string(),
    }
}

/// `ENSAYO_DATA_DIR`, else the saved choice, else the default folder.
pub fn data_folder() -> PathBuf {
    settings::resolve_data_folder(std::env::var("ENSAYO_DATA_DIR").ok().as_deref(), &settings::load(&paths::settings_file()), &paths::default_data_dir())
}

/// Opens the data folder. The default folder is created on first run; a folder the user chose (or the environment
/// named) that is not there is an error, never an empty bank created in its place.
pub fn open_for(root: &Path, default: &Path) -> StorageResult<Storage> {
    if root == default && !root.exists() {
        Storage::init(root.to_path_buf())
    } else {
        Storage::open(root.to_path_buf())
    }
}

fn open_storage() -> StorageResult<Storage> {
    open_for(&data_folder(), &paths::default_data_dir())
}

#[derive(Debug, Serialize)]
pub struct DataStatus {
    pub folder: String,
    /// "ready", "missing", "other_machine" (another computer has it open) or "stale_lock" (a lock left behind).
    pub state: &'static str,
    pub machine: Option<String>,
    pub age_secs: Option<i64>,
    pub conflicts: Vec<Conflict>,
}

pub fn status_for(root: &Path, default: &Path, me: &str, now: DateTime<Utc>) -> DataStatus {
    let folder = root.to_string_lossy().into_owned();
    let Ok(storage) = open_for(root, default) else { return DataStatus { folder, state: "missing", machine: None, age_secs: None, conflicts: vec![] } };
    let (state, machine, age_secs) = match storage.lock_state(me, now) {
        Ok(LockState::Other { machine, age_secs }) => ("other_machine", Some(machine), Some(age_secs)),
        Ok(LockState::Stale { machine, age_secs }) => ("stale_lock", Some(machine), Some(age_secs)),
        _ => ("ready", None, None),
    };
    DataStatus { folder, state, machine, age_secs, conflicts: storage.conflicts().unwrap_or_default() }
}

#[derive(Debug, Serialize)]
pub struct LoadAll {
    pub profile: Option<Profile>,
    pub stories: Vec<Story>,
    pub methods: Vec<Method>,
    /// A plain-words line for each file that could not be read.
    pub problems: Vec<String>,
}

pub fn load_all_from(storage: &Storage) -> StorageResult<LoadAll> {
    let stories = storage.load_stories()?;
    Ok(LoadAll { profile: storage.profile()?, stories: stories.items, methods: storage.methods()?, problems: stories.problems })
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Cmd<T> + Send + 'static) -> Cmd<T> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn data_status() -> Cmd<DataStatus> {
    blocking(|| Ok(status_for(&data_folder(), &paths::default_data_dir(), &machine_name(), Utc::now()))).await
}

/// Takes the lock for this computer: nobody had it, or the user chose "Open anyway".
#[tauri::command]
pub async fn acquire_data_lock() -> Cmd<()> {
    blocking(|| open_storage().and_then(|s| s.acquire_lock(&machine_name(), Utc::now())).map_err(plain)).await
}

#[tauri::command]
pub async fn data_heartbeat() -> Cmd<()> {
    blocking(|| open_storage().and_then(|s| s.heartbeat(&machine_name(), Utc::now())).map_err(plain)).await
}

#[tauri::command]
pub async fn release_data_lock() -> Cmd<()> {
    blocking(|| open_storage().and_then(|s| s.release_lock(&machine_name())).map_err(plain)).await
}

#[tauri::command]
pub async fn load_all() -> Cmd<LoadAll> {
    blocking(|| open_storage().and_then(|s| load_all_from(&s)).map_err(plain)).await
}

#[tauri::command]
pub async fn save_profile(profile: Profile) -> Cmd<()> {
    blocking(move || open_storage().and_then(|s| s.save_profile(&profile)).map_err(plain)).await
}

#[tauri::command]
pub async fn save_story(story: Story) -> Cmd<Story> {
    blocking(move || open_storage().and_then(|s| s.save_story(&story)).map_err(plain)).await
}

#[tauri::command]
pub async fn delete_story(id: String) -> Cmd<()> {
    blocking(move || open_storage().and_then(|s| s.delete_story(&id)).map_err(plain)).await
}

#[tauri::command]
pub async fn set_proof_verified(story_id: String, label: String, verified: bool) -> Cmd<Story> {
    blocking(move || open_storage().and_then(|s| s.set_proof_verified(&story_id, &label, verified)).map_err(plain)).await
}

#[tauri::command]
pub async fn save_method(method: Method) -> Cmd<()> {
    blocking(move || open_storage().and_then(|s| s.save_method(&method)).map_err(plain)).await
}

#[tauri::command]
pub async fn delete_method(situation: String) -> Cmd<()> {
    blocking(move || open_storage().and_then(|s| s.delete_method(&situation)).map_err(plain)).await
}

#[tauri::command]
pub async fn resolve_conflict(copy: PathBuf, keep: Keep) -> Cmd<()> {
    blocking(move || open_storage().and_then(|s| s.resolve_conflict(&copy, keep)).map_err(plain)).await
}

#[tauri::command]
pub async fn set_data_folder(folder: PathBuf) -> Cmd<()> {
    blocking(move || settings::set_data_folder(&paths::settings_file(), &folder).map_err(plain)).await
}

/// Changes the data folder to `folder`: copies the data there when it is empty, or switches to the Ensayo data already
/// in it. Answers "copied" or "existing". The old folder is left as it was. The window reloads afterwards.
#[tauri::command]
pub async fn move_data_folder(folder: PathBuf) -> Cmd<&'static str> {
    blocking(move || {
        let from = data_folder();
        let moved = relocate::prepare_move(&from, &folder).map_err(plain)?;
        // Let go of the old folder's "open here" note before switching, or it would read as another computer's.
        if let Ok(old) = Storage::open(from) {
            let _ = old.release_lock(&machine_name());
        }
        settings::set_data_folder(&paths::settings_file(), &folder).map_err(plain)?;
        Ok(if moved == relocate::Moved::Copied { "copied" } else { "existing" })
    })
    .await
}

/// Delete all Ensayo data: what Ensayo wrote in the data folder, saved keys, answer audio, Ensayo's own speech models
/// and the machine-local settings. Models other apps downloaded are never touched.
#[tauri::command]
pub async fn delete_all_data() -> Cmd<()> {
    blocking(|| {
        // The built-in local AI holds its model file open (Windows will not delete it then).
        crate::ai::local::stop_shared();
        if let Ok(storage) = open_storage() {
            storage.delete_all().map_err(plain)?;
        }
        crate::keys::clear_all();
        for dir in [paths::audio_dir(), paths::models_dir()] {
            match std::fs::remove_dir_all(&dir) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(format!("Couldn't remove {}: {e}", dir.display())),
            }
        }
        match std::fs::remove_file(paths::settings_file()) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!("Couldn't remove the settings file: {e}")),
        }
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::model::{Method, Profile, Story, Usage};
    use chrono::{Duration, TimeZone, Utc};

    fn now() -> chrono::DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 10, 21, 20, 0, 0).unwrap()
    }

    fn story(id: &str) -> Story {
        Story { id: id.into(), title: id.into(), employer: "".into(), best_for: vec![], direct_answer: "".into(), context: "".into(), approach: "".into(), action: "".into(), ownership: "".into(), result: "".into(), proof_points: vec![], scale: "".into(), competencies: vec![], great_eight: vec![], branches: vec![], verified: false, headline: "".into(), usage: Usage::default(), year: None }
    }

    #[test]
    fn the_default_folder_is_created_on_first_run_but_a_chosen_missing_folder_is_not() {
        let dir = tempfile::tempdir().unwrap();
        let default = dir.path().join("default");
        assert!(open_for(&default, &default).is_ok());
        assert!(default.is_dir());
        let chosen = dir.path().join("Drive");
        assert!(open_for(&chosen, &default).is_err());
        assert!(!chosen.exists(), "a missing chosen folder is never created empty");
    }

    #[test]
    fn status_says_missing_when_the_chosen_folder_is_not_there() {
        let dir = tempfile::tempdir().unwrap();
        let st = status_for(&dir.path().join("Drive"), &dir.path().join("default"), "mac", now());
        assert_eq!(st.state, "missing");
        assert!(st.conflicts.is_empty());
    }

    #[test]
    fn status_reflects_the_lock_and_lists_conflicts() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("data");
        let storage = Storage::init(root.clone()).unwrap();
        assert_eq!(status_for(&root, &root, "mac", now()).state, "ready");
        storage.acquire_lock("pc", now()).unwrap();
        let s = status_for(&root, &root, "mac", now() + Duration::minutes(2));
        assert_eq!((s.state, s.machine.as_deref(), s.age_secs), ("other_machine", Some("pc"), Some(120)));
        assert_eq!(status_for(&root, &root, "mac", now() + Duration::minutes(30)).state, "stale_lock");
        std::fs::write(root.join("bank/stories/st_a.json"), "{}").unwrap();
        std::fs::write(root.join("bank/stories/st_a (1).json"), "{}").unwrap();
        assert_eq!(status_for(&root, &root, "pc", now()).conflicts.len(), 1);
    }

    #[test]
    fn load_all_returns_what_was_saved_and_counts_unreadable_files() {
        let dir = tempfile::tempdir().unwrap();
        let storage = Storage::init(dir.path().join("data")).unwrap();
        storage.save_story(&story("st_a")).unwrap();
        storage.save_method(&Method { situation: "motivation".into(), spoken: "x".into(), story_ids: vec![] }).unwrap();
        std::fs::write(storage.root().join("bank/stories/st_bad.json"), "nope").unwrap();
        let all = load_all_from(&storage).unwrap();
        assert!(all.profile.is_none());
        assert_eq!(all.stories.len(), 1);
        assert_eq!(all.methods.len(), 1);
        assert_eq!(all.problems.len(), 1);
        let p = Profile { name: "D".into(), full_name: "D O".into(), target_role: "".into(), seniority: "senior".into(), industry: "".into(), sells_to: "b2c".into(), identity_statement: "".into(), focus_habits: vec![] };
        storage.save_profile(&p).unwrap();
        assert_eq!(load_all_from(&storage).unwrap().profile, Some(p));
    }
}
