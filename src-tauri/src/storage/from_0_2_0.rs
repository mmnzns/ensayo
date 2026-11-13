//! Updating from Ensayo 0.2.0. What 0.2.0 wrote on disk must still open in this version, keep everything in it, and
//! be written as the current format on the next save. These tests build a 0.2.0 install in temporary folders and
//! run today's code over it. Nothing here touches a real settings file or data folder.

use super::lock::{LockState, Me};
use super::reps::Session;
use super::settings::{self, LocalSettings};
use super::Storage;
use chrono::{Duration, TimeZone, Utc};
use serde_json::{json, Value};
use std::fs;
use std::path::Path;

/// settings.json exactly as 0.2.0 wrote it: pretty JSON, no install id, no `.bak` beside it.
const SETTINGS_0_2_0: &str = r#"{
  "ai": {
    "provider": "claude",
    "fast_model": "claude-haiku-5",
    "strong_model": "",
    "base_url": "",
    "cost_cap_usd": 0.25
  },
  "data_folder": "/Users/dana/Google Drive/Ensayo data",
  "audio_retention": "90",
  "gpu": false
}
"#;

#[test]
fn a_settings_file_from_0_2_0_is_not_damaged_and_keeps_the_data_folder() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("settings.json");
    fs::write(&path, SETTINGS_0_2_0).unwrap();

    assert!(!settings::is_damaged(&path), "a valid 0.2.0 file is not damaged");
    let s = settings::load(&path);
    assert_eq!(s.data_folder.as_deref(), Some("/Users/dana/Google Drive/Ensayo data"));
    assert_eq!(s.audio_retention.as_deref(), Some("90"));
    assert_eq!(s.gpu, Some(false));
    let ai = s.ai.clone().unwrap();
    assert_eq!((ai.provider.as_str(), ai.fast_model.as_str(), ai.cost_cap_usd), ("claude", "claude-haiku-5", 0.25));
    assert_eq!(s.install_id, None, "0.2.0 never wrote one");
    assert!(settings::load_for_update(&path).is_ok());
    // The folder choice still wins when the environment names none.
    let default = Path::new("/default");
    assert_eq!(settings::resolve_data_folder(None, &s, default), Path::new("/Users/dana/Google Drive/Ensayo data"));

    // Loading changed nothing on disk and made no side files.
    assert_eq!(fs::read_to_string(&path).unwrap(), SETTINGS_0_2_0);
    let names: Vec<String> = fs::read_dir(dir.path()).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect();
    assert_eq!(names, vec!["settings.json"], "{names:?}");
}

#[test]
fn the_first_install_id_is_made_beside_the_0_2_0_settings_with_a_backup_of_the_old_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("settings.json");
    fs::write(&path, SETTINGS_0_2_0).unwrap();

    let id = settings::install_id(&path).unwrap();
    assert!(id.starts_with("inst_") && id.len() > 10, "{id}");
    // The very next save was the first one: the 0.2.0 file is kept, byte for byte, as the last good copy.
    assert_eq!(fs::read_to_string(dir.path().join("settings.json.bak")).unwrap(), SETTINGS_0_2_0);
    let after = settings::load(&path);
    assert_eq!(after.install_id.as_deref(), Some(id.as_str()));
    assert_eq!(after.data_folder.as_deref(), Some("/Users/dana/Google Drive/Ensayo data"), "the folder choice survives");
    assert_eq!(after.audio_retention.as_deref(), Some("90"));
    assert_eq!(after.ai.unwrap().cost_cap_usd, 0.25);
    assert!(!settings::is_damaged(&path));
    assert_eq!(settings::install_id(&path).unwrap(), id, "asked again, the same id");

    // A later change (the user picks another folder) writes a .bak first, holding the file as it was.
    let before_change = fs::read_to_string(&path).unwrap();
    let other = dir.path().join("elsewhere");
    fs::create_dir(&other).unwrap();
    settings::set_data_folder(&path, &other).unwrap();
    assert_eq!(fs::read_to_string(dir.path().join("settings.json.bak")).unwrap(), before_change);
    let last = settings::load(&path);
    assert_eq!(last.data_folder.as_deref(), Some(other.to_string_lossy().as_ref()));
    assert_eq!(last.install_id.as_deref(), Some(id.as_str()), "the id is never lost by a later save");
}

#[test]
fn a_0_2_0_settings_file_with_a_key_this_version_does_not_know_keeps_it_through_a_save() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("settings.json");
    fs::write(&path, r#"{"data_folder": "/x", "something_else": {"a": 1}}"#).unwrap();
    settings::install_id(&path).unwrap();
    let text = fs::read_to_string(&path).unwrap();
    assert!(text.contains("something_else") && text.contains("\"data_folder\""), "{text}");
    let _: LocalSettings = serde_json::from_str(&text).unwrap();
}

#[test]
fn many_windows_asking_for_the_install_id_at_once_all_get_the_same_one() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("settings.json");
    fs::write(&path, SETTINGS_0_2_0).unwrap();
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(8));
    let handles: Vec<_> = (0..8)
        .map(|_| {
            let (path, barrier) = (path.clone(), barrier.clone());
            std::thread::spawn(move || {
                barrier.wait();
                settings::install_id(&path).unwrap()
            })
        })
        .collect();
    let ids: Vec<String> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    assert!(ids.iter().all(|i| i == &ids[0]), "{ids:?}");
    assert_eq!(settings::load(&path).install_id.as_deref(), Some(ids[0].as_str()), "and it is the one on disk");
}

// ---------- the lock ----------

fn t0() -> chrono::DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 11, 10, 9, 0, 0).unwrap()
}

fn this_computer() -> Me {
    Me { id: "inst_this".into(), label: "Danas-MacBook-Pro".into() }
}

/// lock.json exactly as 0.2.0 wrote it: the host name, the process, when it started and its last heartbeat.
fn lock_0_2_0(s: &Storage, host: &str, heartbeat: chrono::DateTime<Utc>) {
    let text = format!(
        "{{\n  \"machine\": \"{host}\",\n  \"pid\": 4242,\n  \"started\": \"{}\",\n  \"heartbeat\": \"{}\"\n}}",
        (heartbeat - Duration::hours(1)).to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        heartbeat.to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
    );
    fs::write(s.root().join("lock.json"), text).unwrap();
}

#[test]
fn a_fresh_0_2_0_lock_from_this_computer_is_ours_and_saving_is_never_refused() {
    let dir = tempfile::tempdir().unwrap();
    let s = Storage::init(dir.path().join("data")).unwrap();
    let me = this_computer();
    lock_0_2_0(&s, "Danas-MacBook-Pro", t0());
    assert_eq!(s.lock_state(&me, t0() + Duration::seconds(20)).unwrap(), LockState::Mine);
    assert!(!s.held_by_other(&me, t0() + Duration::seconds(20)).unwrap());
    s.acquire_lock(&me, t0() + Duration::seconds(20)).unwrap();
    assert!(fs::read_to_string(s.root().join("lock.json")).unwrap().contains("inst_this"), "the new lock names the install");
    assert_eq!(s.lock_state(&me, t0() + Duration::seconds(30)).unwrap(), LockState::Mine);
}

#[test]
fn a_stale_0_2_0_lock_from_this_computer_is_acquired_whether_we_asked_before_or_after() {
    let dir = tempfile::tempdir().unwrap();
    let s = Storage::init(dir.path().join("data")).unwrap();
    let me = this_computer();
    lock_0_2_0(&s, "Danas-MacBook-Pro", t0());
    // The Mac slept for 20 minutes: the heartbeat is old, the lock is still this computer's.
    let later = t0() + Duration::minutes(20);
    assert_eq!(s.lock_state(&me, later).unwrap(), LockState::Mine);
    assert!(!s.held_by_other(&me, later).unwrap());
    s.heartbeat(&me, later).unwrap();
    assert_eq!(s.lock_state(&me, later + Duration::minutes(1)).unwrap(), LockState::Mine);
    s.acquire_lock(&me, later).unwrap();
    assert_eq!(s.lock_state(&me, later).unwrap(), LockState::Mine);
}

#[test]
fn a_stale_0_2_0_lock_from_another_computer_can_be_taken_and_a_fresh_one_is_refused() {
    let dir = tempfile::tempdir().unwrap();
    let s = Storage::init(dir.path().join("data")).unwrap();
    let me = this_computer();
    lock_0_2_0(&s, "Office-PC", t0());
    assert!(matches!(s.lock_state(&me, t0() + Duration::minutes(2)).unwrap(), LockState::Other { .. }));
    assert!(s.held_by_other(&me, t0() + Duration::minutes(2)).unwrap(), "fresh and another computer's: saves refused");
    let later = t0() + Duration::minutes(30);
    assert!(matches!(s.lock_state(&me, later).unwrap(), LockState::Stale { .. }));
    assert!(!s.held_by_other(&me, later).unwrap());
    s.acquire_lock(&me, later).unwrap();
    assert_eq!(s.lock_state(&me, later).unwrap(), LockState::Mine);
}

// ---------- the records ----------

fn put(root: &Path, rel: &str, v: &Value) {
    let p = root.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, serde_json::to_string_pretty(v).unwrap() + "\n").unwrap();
}

fn get(root: &Path, rel: &str) -> Value {
    serde_json::from_str(&fs::read_to_string(root.join(rel)).unwrap()).unwrap()
}

/// A saved file is the old one at format 2: every key it had is still there with the same value (an unknown one
/// included), and the format number moved from 1 to 2.
fn assert_kept_and_upgraded(root: &Path, rel: &str, old: &Value) {
    let now = get(root, rel);
    assert_eq!(now["schema_version"], 2, "{rel}: written as format 2");
    for (k, v) in old.as_object().unwrap() {
        if k != "schema_version" {
            assert_eq!(now.get(k), Some(v), "{rel}: `{k}` was lost or changed");
        }
    }
    assert_eq!(now["from_a_later_idea"], json!({"keep": ["me", 1, null]}).clone(), "{rel}: the unknown field survives");
}

fn with_unknown(mut v: Value) -> Value {
    v["from_a_later_idea"] = json!({"keep": ["me", 1, null]});
    v
}

/// The v1 files a 0.2.0 install holds (the repo's v1 fixtures, plus `you.json` and a target, which 0.2.0 wrote
/// after its own migration from the profile), each with one field this version has never heard of.
fn install_0_2_0(root: &Path) -> Vec<(&'static str, Value)> {
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/v0-data");
    let read = |rel: &str| -> Value { serde_json::from_str(&fs::read_to_string(fixtures.join(rel)).unwrap()).unwrap() };
    let target = json!({
        "schema_version": 1, "id": "tg_1", "name": "B2C lifecycle", "color": "coral", "role": "Senior Lifecycle Marketing Manager",
        "roleFamily": "lifecycle", "seniority": "senior", "industry": "Fintech", "sellsTo": "b2c", "companyStage": "growth",
        "pitch": "I find where activation breaks and build the fix.", "leadWith": ["activation"], "pinnedStoryIds": ["st_activation"],
        "hiddenStoryIds": [], "defaultProcess": ["recruiter", "hiring_manager"], "baseResume": null, "payRange": {"low": 150000.0, "high": 180000.0, "currency": "USD"},
        "archived": false, "createdAt": "2026-10-22T09:00:00Z"
    });
    let you = json!({"schema_version": 1, "name": "Dana", "fullName": "Dana Ortiz", "focusHabits": ["to_the_point"], "activeTargetId": "tg_1", "targetsNotePending": false});
    let mut files: Vec<(&'static str, Value)> = vec![
        ("targets/tg_1.json", target),
        ("you.json", you),
        ("bank/stories/st_activation.json", read("bank/stories/st_activation.json")),
        ("sessions/ses_app/session.json", read("sessions/ses_app/session.json")),
        ("sessions/ses_app/reps/1/rep.json", read("sessions/ses_app/reps/1/rep.json")),
        ("sessions/ses_app/reps/1/metrics.json", read("sessions/ses_app/reps/1/metrics.json")),
        ("sessions/ses_app/reps/1/transcript.json", read("sessions/ses_app/reps/1/transcript.json")),
        ("applications/app_kestrel/application.json", read("applications/app_kestrel/application.json")),
    ];
    for (rel, v) in &mut files {
        assert_eq!(v["schema_version"], 1, "{rel} is a format 1 file");
        *v = with_unknown(v.take());
        put(root, rel, v);
    }
    files
}

fn old<'a>(files: &'a [(&'static str, Value)], rel: &str) -> &'a Value {
    &files.iter().find(|(r, _)| *r == rel).unwrap().1
}

#[test]
fn every_kind_of_format_1_file_loads_and_is_saved_as_format_2_without_losing_a_field() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("data");
    let s = Storage::init(root.clone()).unwrap();
    let files = install_0_2_0(&root);
    let before_load: Vec<_> = files.iter().map(|(r, _)| (r, fs::read(root.join(r)).unwrap())).collect();

    // Everything loads, nothing is reported damaged.
    let stories = s.load_stories().unwrap();
    assert!(stories.problems.is_empty() && stories.items.len() == 1, "{:?}", stories.problems);
    let targets = s.load_targets().unwrap();
    assert!(targets.problems.is_empty() && targets.items.len() == 1, "{:?}", targets.problems);
    let you = s.you().unwrap().unwrap();
    assert_eq!((you.name.as_str(), you.active_target_id.as_deref()), ("Dana", Some("tg_1")));
    let sessions = s.sessions().unwrap();
    assert!(sessions.problems.is_empty() && sessions.items.len() == 1, "{:?}", sessions.problems);
    let session: Session = sessions.items[0].clone();
    assert!(session.resume.is_none(), "a session from before 0.3.0 has no plan and is never offered to continue");
    assert!(s.resumable_session(Utc::now()).unwrap().is_none());
    let rep = s.rep("ses_app", 1).unwrap().unwrap();
    let app = s.application("app_kestrel").unwrap();
    assert_eq!(app.company, "Kestrel Pay");
    assert_eq!(s.load_applications(chrono::Local::now().naive_local()).unwrap().items.len(), 1);
    // Reading is read-only: no file was touched until something saves it.
    for (r, bytes) in &before_load {
        assert_eq!(&fs::read(root.join(r)).unwrap(), bytes, "{r} was rewritten by a read");
    }

    // Each save writes format 2 and keeps every key.
    s.save_story(&stories.items[0]).unwrap();
    assert_kept_and_upgraded(&root, "bank/stories/st_activation.json", old(&files, "bank/stories/st_activation.json"));
    s.save_target(&targets.items[0]).unwrap();
    assert_kept_and_upgraded(&root, "targets/tg_1.json", old(&files, "targets/tg_1.json"));
    s.save_you(&you).unwrap();
    assert_kept_and_upgraded(&root, "you.json", old(&files, "you.json"));
    s.save_session(&session).unwrap();
    assert_kept_and_upgraded(&root, "sessions/ses_app/session.json", old(&files, "sessions/ses_app/session.json"));
    s.save_rep("ses_app", &rep).unwrap();
    for f in ["rep", "metrics"] {
        let rel = format!("sessions/ses_app/reps/1/{f}.json");
        let now = get(&root, &rel);
        assert_eq!(now["schema_version"], 2, "{rel}");
        for (k, v) in old(&files, &rel).as_object().unwrap() {
            if k != "schema_version" && k != "from_a_later_idea" {
                assert_eq!(now.get(k), Some(v), "{rel}: `{k}`");
            }
        }
    }
    assert_eq!(get(&root, "sessions/ses_app/reps/1/rep.json")["from_a_later_idea"], json!({"keep": ["me", 1, null]}));
    s.save_application_record(&app).unwrap();
    assert_kept_and_upgraded(&root, "applications/app_kestrel/application.json", old(&files, "applications/app_kestrel/application.json"));
}

#[test]
fn a_file_from_a_newer_ensayo_than_this_one_is_still_refused_and_never_overwritten() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("data");
    let s = Storage::init(root.clone()).unwrap();
    install_0_2_0(&root);
    let story: crate::storage::model::Story = serde_json::from_value(json!({"id": "st_activation", "title": "x"})).unwrap();
    let mut newer = get(&root, "bank/stories/st_activation.json");
    newer["schema_version"] = json!(3);
    put(&root, "bank/stories/st_activation.json", &newer);
    assert_eq!(s.load_stories().unwrap().problems.len(), 1, "format 3 is too new");
    assert!(s.save_story(&story).is_err());
    assert_eq!(get(&root, "bank/stories/st_activation.json"), newer);
}
