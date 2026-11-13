//! Tauri commands for the data folder: profile, stories, methods and the state of the folder. The logic lives in
//! `storage`; these only pick the folder and turn errors into plain strings. Every command is async and does its
//! file work on a blocking thread (a long synchronous command freezes the window on Windows).

use crate::applications::view::{self, ApplicationView, ExtrasView};
use crate::paths;
use crate::storage::conflicts::{Conflict, Keep};
use crate::storage::lock::{machine_name, Identity, LockState, Me};
use crate::storage::model::{Method, Profile, Story};
use crate::storage::relocate;
use crate::storage::targets::{Target, You};
use crate::storage::settings;
use crate::storage::{Result as StorageResult, Storage, StorageError};
use chrono::{DateTime, Utc};
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

type Cmd<T> = std::result::Result<T, String>;

pub(crate) fn plain(e: StorageError) -> String {
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

/// True when the settings file is damaged and has no good copy, so the data folder choice is unknown. Never with
/// `ENSAYO_DATA_DIR` set: the choice doesn't come from the file then.
fn settings_damaged() -> bool {
    // Tests never read the real settings file.
    if cfg!(test) {
        return false;
    }
    std::env::var("ENSAYO_DATA_DIR").map_or(true, |v| v.trim().is_empty()) && settings::is_damaged(&paths::settings_file())
}

/// This computer, as the lock file knows it: its install id and its host name (a label only).
pub fn me() -> Me {
    Me { id: install_id(), label: machine_name() }
}

fn install_id() -> String {
    // Tests never touch the real settings file.
    #[cfg(test)]
    return "test-install".into();
    #[cfg(not(test))]
    {
        static ID: std::sync::OnceLock<String> = std::sync::OnceLock::new();
        if let Some(id) = ID.get() {
            return id.clone();
        }
        match settings::install_id(&paths::settings_file()) {
            Ok(id) => ID.get_or_init(|| id).clone(),
            // A damaged settings file is dealt with at start; until then the host name is the id the old locks used.
            Err(_) => machine_name(),
        }
    }
}

/// Tells the storage layer whether another computer holds this folder, so every save in it is refused while that is
/// so. Read from the lock each time a command opens the folder, so a save always sees the lock as it is now.
fn refresh_write_block(storage: &Storage) {
    let other = storage.held_by_other(&me(), Utc::now()).unwrap_or(false);
    crate::storage::io::set_write_block(storage.root(), other);
}

pub(crate) fn open_storage() -> StorageResult<Storage> {
    // With the choice unknown, the default folder must not be opened (or created empty) in its place.
    if settings_damaged() {
        return Err(StorageError::Invalid(settings::DAMAGED_LINE.into()));
    }
    let storage = open_for(&data_folder(), &paths::default_data_dir())?;
    refresh_write_block(&storage);
    Ok(storage)
}

#[derive(Debug, Serialize)]
pub struct DataStatus {
    pub folder: String,
    /// "ready", "missing", "other_machine" (another computer has it open), "stale_lock" (a lock left behind) or "settings_damaged" (the
    /// settings file can't be read and has no good copy: the person chooses the data folder again).
    pub state: &'static str,
    pub machine: Option<String>,
    pub age_secs: Option<i64>,
    pub conflicts: Vec<Conflict>,
}

pub fn status_for(root: &Path, default: &Path, me: impl Identity, now: DateTime<Utc>) -> DataStatus {
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
    /// The merged v0 view: you plus the active target, in the shape the screens had before targets. Null before setup.
    pub profile: Option<Profile>,
    pub you: Option<You>,
    /// Every target, archived ones included, in the order they were made.
    pub targets: Vec<Target>,
    /// The one-time note about targets has not been dismissed yet.
    #[serde(rename = "targetsNotePending")]
    pub targets_note_pending: bool,
    pub stories: Vec<Story>,
    pub methods: Vec<Method>,
    /// Applications in list order (active before closed, then the next interview), in the shape of `Application` in
    /// `src/data/types.ts`.
    pub applications: Vec<ApplicationView>,
    /// What the application screens keep next to each application, by application id.
    pub application_extras: BTreeMap<String, ExtrasView>,
    /// A plain-words line for each file that could not be read.
    pub problems: Vec<String>,
    /// The files behind the banner that names a damaged file and offers Show file: `you.json` and the methods.
    pub damaged: Vec<DamagedFile>,
}

/// A file Ensayo could not read. The name is shown; the path is only for "Show file".
#[derive(Debug, Serialize, PartialEq)]
pub struct DamagedFile {
    pub name: String,
    pub path: String,
}

impl DamagedFile {
    fn of(path: &Path) -> DamagedFile {
        DamagedFile { name: path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(), path: path.to_string_lossy().into_owned() }
    }
}

/// What was skipped while loading: a line for each, and the file where there is one to show.
#[derive(Default)]
struct Skipped {
    problems: Vec<String>,
    files: Vec<DamagedFile>,
}

impl Skipped {
    /// `fallback` stands for the file when the error doesn't name one.
    fn add(&mut self, fallback: PathBuf, e: &StorageError) {
        let path = e.file().map(Path::to_path_buf).unwrap_or(fallback);
        self.problems.push(crate::storage::damaged_line(&path, e));
        self.files.push(DamagedFile::of(&path));
    }
}

pub fn load_all_from(storage: &Storage) -> StorageResult<LoadAll> {
    load_all_at(storage, chrono::Local::now().naive_local())
}

pub fn load_all_at(storage: &Storage, now: chrono::NaiveDateTime) -> StorageResult<LoadAll> {
    let mut skipped = Skipped::default();
    // Targets first: reading them moves a v0 profile over, which the other reads depend on.
    let (you, you_failed) = match storage.you() {
        Ok(y) => (y, false),
        Err(e) => {
            skipped.add(storage.root().join("you.json"), &e);
            (None, true)
        }
    };
    let targets = storage.load_targets().unwrap_or_else(|e| {
        skipped.add(storage.root().join("targets"), &e);
        Default::default()
    });
    let mut stories = storage.load_stories()?;
    stories.items = storage.with_practice_by_target(stories.items)?;
    let apps = view::load_all(storage, now)?;
    let methods = storage.load_methods();
    for file in &methods.files {
        skipped.files.push(DamagedFile::of(file));
    }
    let profile = if you_failed { None } else { storage.profile().unwrap_or(None) };
    let Skipped { mut problems, files: damaged } = skipped;
    problems.extend(stories.problems);
    problems.extend(targets.problems);
    problems.extend(apps.problems);
    problems.extend(methods.problems);
    let pending = you.as_ref().is_some_and(|y| y.targets_note_pending);
    Ok(LoadAll { profile, you, targets: targets.items, targets_note_pending: pending, stories: stories.items, methods: methods.items, applications: apps.applications, application_extras: apps.extras, problems, damaged })
}

pub(crate) async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Cmd<T> + Send + 'static) -> Cmd<T> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn data_status() -> Cmd<DataStatus> {
    blocking(|| {
        if settings_damaged() {
            return Ok(DataStatus { folder: String::new(), state: "settings_damaged", machine: None, age_secs: None, conflicts: vec![] });
        }
        let root = data_folder();
        let status = status_for(&root, &paths::default_data_dir(), &me(), Utc::now());
        // The window asks when it gets focus and before saving: the answer also decides whether saves are refused.
        crate::storage::io::set_write_block(&root, status.state == "other_machine");
        Ok(status)
    })
    .await
}

/// Takes the lock for this computer: nobody had it, or the user chose "Open anyway".
#[tauri::command]
pub async fn acquire_data_lock() -> Cmd<()> {
    blocking(|| open_storage().and_then(|s| s.acquire_lock(&me(), Utc::now())).map_err(plain)).await
}

#[tauri::command]
pub async fn data_heartbeat() -> Cmd<()> {
    blocking(|| open_storage().and_then(|s| s.heartbeat(&me(), Utc::now())).map_err(plain)).await
}

#[tauri::command]
pub async fn release_data_lock() -> Cmd<()> {
    blocking(release_lock_now).await
}

/// Gives the data folder back. Run when Ensayo quits, so the other computer can open it straight away instead of
/// seeing "open on another computer" until the lock goes stale. Only ever removes this computer's own lock.
pub fn release_lock_now() -> Cmd<()> {
    open_storage().and_then(|s| s.release_lock(&me())).map_err(plain)
}

#[tauri::command]
pub async fn load_all() -> Cmd<LoadAll> {
    blocking(|| open_storage().and_then(|s| load_all_from(&s)).map_err(plain)).await
}

#[tauri::command]
pub async fn save_profile(profile: Profile) -> Cmd<()> {
    blocking(move || open_storage().and_then(|s| s.save_profile(&profile)).map_err(plain)).await
}

/// The story as the screens read it: with how many answers were practiced with it per target.
fn with_practice(storage: &Storage, story: Story) -> StorageResult<Story> {
    Ok(storage.with_practice_by_target(vec![story])?.remove(0))
}

#[tauri::command]
pub async fn save_story(story: Story) -> Cmd<Story> {
    blocking(move || open_storage().and_then(|s| with_practice(&s, s.save_story(&story)?)).map_err(plain)).await
}

#[tauri::command]
pub async fn delete_story(id: String) -> Cmd<()> {
    blocking(move || open_storage().and_then(|s| s.delete_story(&id)).map_err(plain)).await
}

#[tauri::command]
pub async fn set_proof_verified(story_id: String, label: String, verified: bool) -> Cmd<Story> {
    blocking(move || open_storage().and_then(|s| with_practice(&s, s.set_proof_verified(&story_id, &label, verified)?)).map_err(plain)).await
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
    let busy = crate::busy::hold();
    blocking(move || {
        let _busy = busy;
        let _t = crate::logging::Timer::new("move_data_folder");
        let from = data_folder();
        let moved = relocate::prepare_move(&from, &folder).map_err(plain)?;
        // Let go of the old folder's "open here" note before switching, or it would read as another computer's.
        if let Ok(old) = Storage::open(from) {
            let _ = old.release_lock(&me());
        }
        settings::set_data_folder(&paths::settings_file(), &folder).map_err(plain)?;
        Ok(if moved == relocate::Moved::Copied { "copied" } else { "existing" })
    })
    .await
}

/// Ensayo lets go of every model it uses. The first problem is reported in words; the rest are still attempted.
fn release_models(store: &voice_engine_models::SharedStore) -> Cmd<()> {
    store.release_all().map_err(|e| format!("Couldn't remove Ensayo's models ({}). Close other apps that use them and try again.", e.kind()))
}

/// What "Delete all Ensayo data" could not remove, in plain words (names only, never paths). Empty means all gone.
#[derive(Debug, Default, Serialize, PartialEq)]
pub struct DeleteReport {
    pub left_behind: Vec<String>,
}

/// Removes a file or folder; false when it is there and could not be removed.
fn remove_path(path: &Path) -> bool {
    let result = if path.is_dir() { std::fs::remove_dir_all(path) } else { std::fs::remove_file(path) };
    match result {
        Ok(()) => true,
        Err(e) => e.kind() == std::io::ErrorKind::NotFound,
    }
}

/// The line shown when the data folder could not be opened. The folder's name only, never its full path.
fn unreachable_line(folder: &Path) -> String {
    let name = folder.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "the data folder".into());
    format!("Ensayo couldn't reach your data folder (\"{name}\"), so your stories and other saved work there were not deleted. Everything stored on this computer was removed. Reconnect the folder and run Delete all Ensayo data again to remove the rest.")
}

/// The machine-local parts and the data folder, with every location passed in so tests can use temporary folders.
/// `local` is `(what the person would call it, where)`. The settings file is the pointer to the data folder, so it
/// is kept when that folder could not be reached: otherwise the folder could not be found again to finish.
fn delete_everything_in(root: &Path, default: &Path, local: &[(&str, PathBuf)], settings_file: &Path, keys_left: &[&str]) -> Cmd<DeleteReport> {
    let mut left = vec![];
    for (label, dir) in local {
        if !remove_path(dir) {
            left.push((*label).to_string());
        }
    }
    for account in keys_left {
        left.push(format!("The saved {account} key"));
    }
    let data = open_for(root, default);
    match &data {
        Ok(storage) => left.extend(storage.delete_all_report().into_iter().map(|n| format!("{n} in your data folder"))),
        Err(_) => return Err(unreachable_line(root)),
    }
    if !remove_path(settings_file) {
        left.push("Ensayo's settings file".into());
    }
    Ok(DeleteReport { left_behind: left })
}

/// Delete all Ensayo data: what Ensayo wrote in the data folder, saved keys, answer audio, backups, the models only
/// Ensayo uses and the machine-local settings. A model another app also uses stays for that app. Returns what it
/// could not remove; when the data folder can't be reached the machine-local parts are still removed, then it is an
/// error saying the stories were not deleted.
#[tauri::command]
pub async fn delete_all_data() -> Cmd<DeleteReport> {
    let busy = crate::busy::hold();
    blocking(move || {
        let _busy = busy;
        // The built-in local AI holds its model file open (Windows will not delete it then); so may the speech model.
        crate::ai::local::stop_shared();
        crate::speech::loaded::unload();
        // Ensayo stops using its models; each is erased unless another app uses it or has it open.
        let models = match crate::models_store::store() {
            Ok(store) => release_models(store),
            Err(e) => {
                log::warn!("{e}");
                Ok(())
            }
        };
        let keys_left = crate::keys::clear_all();
        // The log folder goes too, and nothing writes it again until Ensayo restarts.
        let logs_ok = crate::logging::remove_all_in(&paths::logs_dir()).is_ok();
        // The old models folder only holds hard links and leftovers after the move to the shared folder.
        let local = [
            ("Recordings", paths::audio_dir()),
            ("Recently deleted items", paths::trash_dir()),
            ("Models folder", paths::models_dir()),
            ("Backups made before a restore", paths::app_local().join("backups")),
        ];
        let result = delete_everything_in(&data_folder(), &paths::default_data_dir(), &local, &paths::settings_file(), &keys_left);
        let mut report = result?;
        if !logs_ok {
            report.left_behind.push("Log files".into());
        }
        if models.is_err() {
            report.left_behind.push("Speech or AI models another app has open".into());
        }
        Ok(report)
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
        Story { extra: Default::default(), id: id.into(), title: id.into(), employer: "".into(), best_for: vec![], direct_answer: "".into(), context: "".into(), approach: "".into(), action: "".into(), ownership: "".into(), result: "".into(), proof_points: vec![], scale: "".into(), competencies: vec![], great_eight: vec![], branches: vec![], verified: false, headline: "".into(), usage: Usage::default(), year: None, angles: vec![] }
    }

    #[test]
    fn delete_all_releases_ensayos_models_and_keeps_the_ones_another_app_uses() {
        use voice_engine_models::{catalog, App, SharedStore};
        let dir = tempfile::tempdir().unwrap();
        let mine = SharedStore::open_at(App::Ensayo, dir.path().to_path_buf()).unwrap();
        let talaan = SharedStore::open_at(App::Talaan, dir.path().to_path_buf()).unwrap();
        for id in ["whisper-tiny", "whisper-base"] {
            for f in catalog::find(id).unwrap().files {
                std::fs::create_dir_all(mine.model_dir(id)).unwrap();
                std::fs::File::create(mine.model_dir(id).join(f.name)).unwrap().set_len(f.size).unwrap();
            }
            mine.use_model(id).unwrap();
        }
        talaan.use_model("whisper-base").unwrap();
        release_models(&mine).unwrap();
        assert!(!mine.model_dir("whisper-tiny").exists(), "only Ensayo used it");
        assert!(mine.model_dir("whisper-base").exists(), "Talaan still uses it");
    }

    fn local_dirs(base: &Path) -> Vec<(&'static str, PathBuf)> {
        ["audio", "trash", "models", "backups"].iter().map(|n| (match *n { "audio" => "Recordings", "trash" => "Recently deleted items", "models" => "Models folder", _ => "Backups made before a restore" }, base.join(n))).collect()
    }

    #[test]
    fn delete_all_removes_the_backups_and_every_machine_local_folder_and_reports_nothing_left() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("local");
        let root = dir.path().join("data");
        let storage = Storage::init(root.clone()).unwrap();
        storage.save_story(&story("st_a")).unwrap();
        let local = local_dirs(&base);
        for (_, d) in &local {
            std::fs::create_dir_all(d.join("x")).unwrap();
            std::fs::write(d.join("x/f"), "1").unwrap();
        }
        let settings_file = base.join("settings.json");
        std::fs::write(&settings_file, "{}").unwrap();
        let report = delete_everything_in(&root, &root, &local, &settings_file, &[]).unwrap();
        assert_eq!(report, DeleteReport::default());
        for (_, d) in &local {
            assert!(!d.exists());
        }
        assert!(!settings_file.exists() && !root.join("bank").exists());
    }

    #[test]
    fn delete_all_lists_a_key_it_could_not_clear() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("data");
        Storage::init(root.clone()).unwrap();
        let report = delete_everything_in(&root, &root, &[], &dir.path().join("settings.json"), &["claude"]).unwrap();
        assert_eq!(report.left_behind, vec!["The saved claude key".to_string()]);
    }

    #[test]
    fn delete_all_with_an_unreachable_data_folder_still_clears_this_computer_then_says_the_stories_were_not_deleted() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("local");
        let local = local_dirs(&base);
        for (_, d) in &local {
            std::fs::create_dir_all(d).unwrap();
        }
        let settings_file = base.join("settings.json");
        std::fs::write(&settings_file, "{}").unwrap();
        let missing = dir.path().join("Drive").join("EnsayoData");
        let err = delete_everything_in(&missing, &dir.path().join("default"), &local, &settings_file, &[]).unwrap_err();
        assert!(err.contains("EnsayoData") && err.contains("not deleted"), "{err}");
        assert!(!err.contains(dir.path().to_string_lossy().as_ref()), "no full path: {err}");
        for (_, d) in &local {
            assert!(!d.exists(), "machine-local parts still go");
        }
        assert!(settings_file.exists(), "the pointer to the data folder stays so the delete can be finished");
        assert!(!missing.exists(), "nothing is created in its place");
    }

    #[test]
    fn saves_are_refused_while_another_computer_holds_the_lock_and_allowed_when_it_is_ours_free_or_stale() {
        let dir = tempfile::tempdir().unwrap();
        let storage = Storage::init(dir.path().join("data")).unwrap();
        // Nobody holds it: saving works.
        refresh_write_block(&storage);
        storage.save_story(&story("st_a")).unwrap();
        // Another computer took it a moment ago.
        storage.acquire_lock("pc", Utc::now()).unwrap();
        refresh_write_block(&storage);
        let err = plain(storage.save_story(&story("st_b")).unwrap_err());
        assert!(err.starts_with("Another computer has Ensayo open"), "{err}");
        assert!(storage.delete_story("st_a").is_err(), "deleting is a save too");
        assert!(storage.save_method(&Method { situation: "motivation".into(), spoken: "x".into(), story_ids: vec![], extra: Default::default() }).is_err());
        assert!(!storage.root().join("bank/stories/st_b.json").exists());
        assert!(storage.root().join("bank/stories/st_a.json").exists());
        // Its lock is old: it closed without releasing.
        storage.acquire_lock("pc", Utc::now() - Duration::minutes(30)).unwrap();
        refresh_write_block(&storage);
        storage.save_story(&story("st_b")).unwrap();
        // Ours again.
        storage.acquire_lock(&me(), Utc::now()).unwrap();
        refresh_write_block(&storage);
        storage.save_story(&story("st_c")).unwrap();
    }

    #[test]
    fn the_lock_names_this_computer_by_its_install_id_and_shows_the_host_name_as_a_label() {
        let dir = tempfile::tempdir().unwrap();
        let storage = Storage::init(dir.path().join("data")).unwrap();
        storage.acquire_lock(&me(), Utc::now()).unwrap();
        let text = std::fs::read_to_string(storage.root().join("lock.json")).unwrap();
        assert!(text.contains("test-install") && text.contains(&machine_name()), "{text}");
        assert_eq!(status_for(storage.root(), storage.root(), &me(), Utc::now()).state, "ready");
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
        storage.save_method(&Method { extra: Default::default(), situation: "motivation".into(), spoken: "x".into(), story_ids: vec![] }).unwrap();
        std::fs::write(storage.root().join("bank/stories/st_bad.json"), "nope").unwrap();
        let all = load_all_from(&storage).unwrap();
        assert!(all.profile.is_none());
        assert_eq!(all.stories.len(), 1);
        assert_eq!(all.methods.len(), 1);
        assert_eq!(all.problems.len(), 1);
        let p = Profile { extra: Default::default(), name: "D".into(), full_name: "D O".into(), target_role: "".into(), seniority: "senior".into(), industry: "".into(), sells_to: "b2c".into(), identity_statement: "".into(), focus_habits: vec![] };
        storage.save_profile(&p).unwrap();
        assert_eq!(load_all_from(&storage).unwrap().profile, Some(p));
    }

    #[test]
    fn load_all_carries_you_the_targets_the_note_flag_and_the_merged_profile() {
        use crate::storage::targets::Target;
        let dir = tempfile::tempdir().unwrap();
        let storage = Storage::init(dir.path().join("data")).unwrap();
        let before = serde_json::to_value(load_all_from(&storage).unwrap()).unwrap();
        assert!(before["you"].is_null() && before["profile"].is_null() && before["targets"] == serde_json::json!([]) && before["targetsNotePending"] == false, "{before}");
        storage.save_profile(&Profile { extra: Default::default(), name: "D".into(), full_name: "D O".into(), target_role: "Lifecycle Manager".into(), seniority: "senior".into(), industry: "Fintech".into(), sells_to: "b2c".into(), identity_statement: "I fix funnels.".into(), focus_habits: vec!["numbers".into()] }).unwrap();
        let second = storage.save_target(&Target { role: "Marketing Operations Manager".into(), sells_to: "b2b".into(), pitch: "I run the stack.".into(), ..Target::default() }).unwrap();
        let json = serde_json::to_value(load_all_from(&storage).unwrap()).unwrap();
        assert_eq!(json["you"]["name"], "D");
        assert_eq!(json["you"]["activeTargetId"], json["targets"][0]["id"]);
        assert_eq!(json["targets"].as_array().unwrap().len(), 2);
        assert_eq!(json["targets"][1]["id"], second.id.as_str());
        assert_eq!(json["profile"]["targetRole"], "Lifecycle Manager", "the merged view is today's shape: you plus the active target");
        assert_eq!(json["profile"]["identityStatement"], "I fix funnels.");
        storage.set_active_target(&second.id).unwrap();
        assert_eq!(serde_json::to_value(load_all_from(&storage).unwrap()).unwrap()["profile"]["identityStatement"], "I run the stack.");
        assert_eq!(load_all_from(&storage).unwrap().targets_note_pending, false);
    }

    #[test]
    fn load_all_tells_each_story_how_often_it_was_practiced_per_target_and_saving_never_keeps_it() {
        use crate::storage::reps::{Rep, Session};
        let dir = tempfile::tempdir().unwrap();
        let storage = Storage::init(dir.path().join("data")).unwrap();
        storage.save_profile(&Profile { extra: Default::default(), name: "D".into(), full_name: "".into(), target_role: "Lifecycle".into(), seniority: "senior".into(), industry: "".into(), sells_to: "b2c".into(), identity_statement: "".into(), focus_habits: vec![] }).unwrap();
        let target = storage.targets().unwrap().remove(0);
        storage.save_story(&story("st_a")).unwrap();
        storage.save_session(&Session { extra: Default::default(), resume: None, id: "ses_1".into(), mode: "drill".into(), stage: "recruiter".into(), application_id: None, stage_id: None, started: "2026-10-20T10:00:00Z".into(), target_id: Some(target.id.clone()) }).unwrap();
        let words: Vec<crate::speech::words::Word> = (0..12).map(|i| crate::speech::words::Word { text: "word".into(), start_ms: i * 500, end_ms: i * 500 + 400 }).collect();
        let metrics = crate::metrics::compute(crate::metrics::Inputs { words: words.clone(), stage: "recruiter", question_type: "behavioral", bank: vec![], keep_restart: false });
        let rep = Rep { extra: Default::default(), n: 1, question_id: "q".into(), question_text: "?".into(), question_type: "behavioral".into(), behavioral_situation: None, commitment_check: false, builder_operator_check: false, is_major_story: true, founder_variant: false, attempt: 1, recorded_at: "2026-10-20T10:00:00Z".into(), story_ids: vec!["st_a".into()], fix: None, note: None, rewrite: None, ai: None, follow_up: None, feedback: None };
        storage.save_rep("ses_1", &crate::storage::reps::FullRep { session_id: "ses_1".into(), rep, transcript: words, metrics }).unwrap();
        let all = load_all_from(&storage).unwrap();
        assert_eq!(all.stories[0].usage.by_target.get(&target.id), Some(&1));
        assert_eq!(serde_json::to_value(&all).unwrap()["stories"][0]["usage"]["byTarget"][target.id.as_str()], 1);
        // The screens send the story back as they read it: the count is not saved with it.
        let saved = storage.save_story(&all.stories[0]).unwrap();
        assert!(saved.usage.by_target.is_empty());
        assert!(!std::fs::read_to_string(storage.root().join("bank/stories/st_a.json")).unwrap().contains("byTarget"));
        assert!(with_practice(&storage, saved).unwrap().usage.by_target.contains_key(&target.id));
    }

    #[test]
    fn load_all_reports_the_pending_note_after_a_migration_and_a_target_file_that_cannot_be_read() {
        let dir = tempfile::tempdir().unwrap();
        let storage = Storage::init(dir.path().join("data")).unwrap();
        crate::storage::versioned::save_record(&storage.root().join("profile.json"), &Profile { extra: Default::default(), name: "D".into(), full_name: "D O".into(), target_role: "Lifecycle".into(), seniority: "senior".into(), industry: "".into(), sells_to: "b2c".into(), identity_statement: "".into(), focus_habits: vec![] }).unwrap();
        std::fs::create_dir_all(storage.root().join("targets")).unwrap();
        std::fs::write(storage.root().join("targets/tg_bad.json"), "nope").unwrap();
        let all = load_all_from(&storage).unwrap();
        assert!(all.targets_note_pending);
        assert_eq!(all.targets.len(), 1);
        assert_eq!(all.problems.len(), 1, "{:?}", all.problems);
        let bundle = crate::target_commands::bundle_of(&storage).unwrap();
        let json = serde_json::to_value(&bundle).unwrap();
        assert_eq!(json["targetsNotePending"], true);
        assert!(json["you"]["name"] == "D" && json["targets"].is_array());
    }

    #[test]
    fn load_all_carries_the_applications_in_list_order_with_their_extras_and_reports_a_damaged_one() {
        use crate::storage::applications::NewApplication;
        let dir = tempfile::tempdir().unwrap();
        let storage = Storage::init(dir.path().join("data")).unwrap();
        let day = |d| chrono::NaiveDate::from_ymd_opt(2026, 10, d).unwrap();
        let first = storage.create_application(NewApplication { company: "Older".into(), ..Default::default() }, day(1)).unwrap();
        let second = storage.create_application(NewApplication { company: "Newer".into(), ..Default::default() }, day(15)).unwrap();
        std::fs::create_dir_all(storage.root().join("applications/app_bad")).unwrap();
        std::fs::write(storage.root().join("applications/app_bad/application.json"), "nope").unwrap();
        let all = load_all_at(&storage, day(21).and_hms_opt(12, 0, 0).unwrap()).unwrap();
        assert_eq!(all.applications.iter().map(|a| a.company.as_str()).collect::<Vec<_>>(), vec!["Newer", "Older"]);
        assert!(all.application_extras.contains_key(&first.id) && all.application_extras.contains_key(&second.id));
        assert_eq!(all.problems.len(), 1);
        let json = serde_json::to_value(&all).unwrap();
        assert!(json["applications"].is_array() && json["application_extras"].is_object());
        assert!(json.get("profile").is_some() && json.get("stories").is_some() && json.get("methods").is_some(), "the existing fields stay");
    }

    #[test]
    fn a_damaged_you_file_loads_as_empty_with_a_banner_naming_the_file_and_everything_else_loads() {
        let dir = tempfile::tempdir().unwrap();
        let storage = Storage::init(dir.path().join("data")).unwrap();
        storage.save_story(&story("st_a")).unwrap();
        std::fs::write(storage.root().join("you.json"), "{ not json").unwrap();
        let all = load_all_from(&storage).unwrap();
        assert!(all.you.is_none() && all.profile.is_none());
        assert_eq!(all.stories.len(), 1, "the rest loads");
        assert_eq!(all.damaged.iter().map(|d| d.name.as_str()).collect::<Vec<_>>(), vec!["you.json"]);
        assert!(all.problems.iter().any(|p| p.starts_with("you.json is damaged")), "{:?}", all.problems);
        for line in &all.problems {
            assert!(!line.contains(dir.path().to_string_lossy().as_ref()), "no full path in a line: {line}");
        }
        assert!(all.damaged[0].path.ends_with("you.json"), "the path is there for Show file");
        // Saving a new you never destroys the damaged one.
        storage.save_you(&crate::storage::targets::You { name: "D".into(), full_name: "".into(), focus_habits: vec![], active_target_id: None, targets_note_pending: false, extra: Default::default() }).unwrap();
        let aside = std::fs::read_dir(storage.root()).unwrap().flatten().filter(|e| e.file_name().to_string_lossy().starts_with("you.json.damaged-")).count();
        assert_eq!(aside, 1);
    }

    #[test]
    fn a_damaged_or_newer_method_is_skipped_with_a_banner_and_the_other_methods_load() {
        let dir = tempfile::tempdir().unwrap();
        let storage = Storage::init(dir.path().join("data")).unwrap();
        storage.save_method(&Method { situation: "motivation".into(), spoken: "ok".into(), story_ids: vec![], extra: Default::default() }).unwrap();
        std::fs::write(storage.root().join("bank/methods/disagreement.json"), "nope").unwrap();
        std::fs::write(storage.root().join("bank/methods/influence.json"), r#"{"schema_version": 99, "situation": "influence", "spoken": "x"}"#).unwrap();
        let all = load_all_from(&storage).unwrap();
        assert_eq!(all.methods.len(), 1);
        let mut names: Vec<&str> = all.damaged.iter().map(|d| d.name.as_str()).collect();
        names.sort();
        assert_eq!(names, vec!["disagreement.json", "influence.json"]);
        assert!(all.problems.iter().any(|p| p.starts_with("influence.json was saved by a newer Ensayo")), "{:?}", all.problems);
        // Nothing is wrong with a healthy folder.
        let ok = Storage::init(dir.path().join("fine")).unwrap();
        assert!(load_all_from(&ok).unwrap().damaged.is_empty());
    }
}
