//! Deleting history with a way back (Spec: seven days to change your mind). A deleted session's folder moves to the
//! trash in the data folder (`storage::trash`) and its recordings to the machine-local audio trash
//! (`audio_retention`); restoring moves both back, and a purge on start removes what has sat there more than seven
//! days, by the stamp file. Every command is async and does its file work on a blocking thread.

use crate::audio_retention;
use crate::data_commands::{blocking, open_storage, plain as plain_storage};
use crate::paths;
use crate::storage::trash::TrashedSession;
use crate::storage::{Result as StorageResult, Storage, StorageError};
use chrono::{DateTime, Utc};
use serde::Serialize;
use std::path::Path;

type Cmd<T> = std::result::Result<T, String>;

/// What the person reads when the session is not in the folder any more (the other computer purged or deleted it).
pub const GONE: &str = "That session is no longer here";

fn say(e: StorageError) -> String {
    match e {
        StorageError::NotFound(_) => GONE.to_string(),
        other => plain_storage(other),
    }
}

/// Moves one session and its recordings to the trash.
pub fn delete_session_with(storage: &Storage, audio: &Path, trash_audio: &Path, id: &str, now: DateTime<Utc>) -> StorageResult<()> {
    storage.trash_session(id, now)?;
    let _ = audio_retention::move_to_trash(audio, trash_audio, id);
    Ok(())
}

#[derive(Debug, Serialize, PartialEq)]
pub struct PracticeDeleted {
    pub sessions: usize,
    pub reps: usize,
}

/// Moves every session of an application to the trash, with the count for the screen.
pub fn delete_practice_with(storage: &Storage, audio: &Path, trash_audio: &Path, application_id: &str, now: DateTime<Utc>) -> StorageResult<PracticeDeleted> {
    let mut out = PracticeDeleted { sessions: 0, reps: 0 };
    for s in storage.sessions_of_application(application_id)? {
        let reps = storage.rep_count(&s.id);
        delete_session_with(storage, audio, trash_audio, &s.id, now)?;
        out.sessions += 1;
        out.reps += reps;
    }
    Ok(out)
}

/// Moves a session back, and its recordings too when they are still on this computer.
pub fn restore_with(storage: &Storage, audio: &Path, trash_audio: &Path, id: &str) -> StorageResult<()> {
    storage.restore_session(id)?;
    let _ = audio_retention::restore_from_trash(audio, trash_audio, id);
    Ok(())
}

#[derive(Debug, Default, Serialize, PartialEq)]
pub struct PurgeResult {
    /// Sessions removed from the trash.
    pub sessions: usize,
    /// Recording folders removed from the audio trash.
    pub audio: usize,
}

/// The start-up sweep: sessions more than seven days in the trash go, with their recordings. Recordings in the audio
/// trash whose session was restored on another computer go back to the audio folder; recordings whose session is no
/// longer in the trash at all (purged on another computer) are removed.
pub fn purge_with(storage: &Storage, audio: &Path, trash_audio: &Path, now: DateTime<Utc>) -> StorageResult<PurgeResult> {
    let purged = storage.purge_trash(now)?;
    let mut out = PurgeResult { sessions: purged.sessions.len(), audio: 0 };
    for id in &purged.sessions {
        if trash_audio.join(id).is_dir() {
            audio_retention::remove_trashed(trash_audio, id);
            out.audio += 1;
        }
    }
    let waiting: Vec<String> = storage.trashed_sessions()?.into_iter().map(|t| t.id).collect();
    for id in audio_retention::trashed_ids(trash_audio) {
        if waiting.contains(&id) {
            continue;
        }
        if storage.session(&id).ok().flatten().is_some() {
            let _ = audio_retention::restore_from_trash(audio, trash_audio, &id);
        } else {
            audio_retention::remove_trashed(trash_audio, &id);
            out.audio += 1;
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn delete_session(session_id: String) -> Cmd<()> {
    blocking(move || {
        let storage = open_storage().map_err(plain_storage)?;
        delete_session_with(&storage, &paths::audio_dir(), &paths::audio_trash_dir(), &session_id, Utc::now()).map_err(say)
    })
    .await
}

#[tauri::command]
pub async fn delete_application_practice(application_id: String) -> Cmd<PracticeDeleted> {
    blocking(move || {
        let storage = open_storage().map_err(plain_storage)?;
        delete_practice_with(&storage, &paths::audio_dir(), &paths::audio_trash_dir(), &application_id, Utc::now()).map_err(say)
    })
    .await
}

#[tauri::command]
pub async fn trashed_sessions() -> Cmd<Vec<TrashedSession>> {
    blocking(|| open_storage().and_then(|s| s.trashed_sessions()).map_err(plain_storage)).await
}

#[tauri::command]
pub async fn restore_session(session_id: String) -> Cmd<()> {
    blocking(move || {
        let storage = open_storage().map_err(plain_storage)?;
        restore_with(&storage, &paths::audio_dir(), &paths::audio_trash_dir(), &session_id).map_err(say)
    })
    .await
}

/// Run on start, next to the audio sweep.
#[tauri::command]
pub async fn purge_trash() -> Cmd<PurgeResult> {
    blocking(|| {
        let storage = open_storage().map_err(plain_storage)?;
        purge_with(&storage, &paths::audio_dir(), &paths::audio_trash_dir(), Utc::now()).map_err(plain_storage)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio_retention::audio_path;
    use crate::storage::reps::Session;
    use chrono::TimeZone;
    use std::fs;

    fn at(day: u32, h: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 10, day, h, 0, 0).unwrap()
    }

    fn setup() -> (tempfile::TempDir, Storage) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::init(dir.path().join("data")).unwrap();
        (dir, s)
    }

    fn make(s: &Storage, audio: &Path, id: &str, application: Option<&str>, reps: u32) {
        s.save_session(&Session { id: id.into(), mode: "drill".into(), stage: "recruiter".into(), application_id: application.map(String::from), stage_id: None, started: "2026-10-01T10:00:00Z".into(), target_id: None }).unwrap();
        for n in 1..=reps {
            fs::create_dir_all(s.root().join(format!("sessions/{id}/reps/{n}"))).unwrap();
            fs::create_dir_all(audio.join(id)).unwrap();
            fs::write(audio_path(audio, id, n), b"RIFF").unwrap();
        }
    }

    #[test]
    fn deleting_all_of_an_applications_practice_trashes_only_its_sessions_and_counts_them() {
        let (d, s) = setup();
        let (audio, trash) = (d.path().join("audio"), d.path().join("trash/audio"));
        make(&s, &audio, "ses_1", Some("app_a"), 3);
        make(&s, &audio, "ses_2", Some("app_a"), 2);
        make(&s, &audio, "ses_3", Some("app_b"), 1);
        make(&s, &audio, "ses_4", None, 1);
        let out = delete_practice_with(&s, &audio, &trash, "app_a", at(21, 9)).unwrap();
        assert_eq!(out, PracticeDeleted { sessions: 2, reps: 5 });
        let mut left: Vec<String> = s.sessions().unwrap().items.into_iter().map(|x| x.id).collect();
        left.sort();
        assert_eq!(left, vec!["ses_3", "ses_4"]);
        assert!(audio_path(&trash, "ses_1", 3).is_file() && audio_path(&audio, "ses_3", 1).is_file());
        assert_eq!(delete_practice_with(&s, &audio, &trash, "app_a", at(21, 9)).unwrap(), PracticeDeleted { sessions: 0, reps: 0 });
    }

    #[test]
    fn the_purge_removes_sessions_and_audio_after_seven_days_by_the_stamp_and_not_before() {
        let (d, s) = setup();
        let (audio, trash) = (d.path().join("audio"), d.path().join("trash/audio"));
        make(&s, &audio, "ses_a", None, 1);
        delete_session_with(&s, &audio, &trash, "ses_a", at(14, 9)).unwrap();
        // Touching the folder now would make its file time "today"; the stamp is what counts.
        fs::write(s.root().join("trash/sessions/ses_a/session.json.tmp"), "x").unwrap();
        assert_eq!(purge_with(&s, &audio, &trash, at(21, 9)).unwrap(), PurgeResult::default());
        assert!(audio_path(&trash, "ses_a", 1).is_file());
        assert_eq!(purge_with(&s, &audio, &trash, at(21, 10)).unwrap(), PurgeResult { sessions: 1, audio: 1 });
        assert!(!s.root().join("trash/sessions/ses_a").exists());
        assert!(!trash.join("ses_a").exists());
    }

    #[test]
    fn the_purge_cleans_up_after_the_other_computer() {
        let (d, s) = setup();
        let (audio, trash) = (d.path().join("audio"), d.path().join("trash/audio"));
        make(&s, &audio, "ses_purged", None, 1);
        make(&s, &audio, "ses_restored", None, 1);
        make(&s, &audio, "ses_waiting", None, 1);
        for id in ["ses_purged", "ses_restored", "ses_waiting"] {
            delete_session_with(&s, &audio, &trash, id, at(20, 9)).unwrap();
        }
        // The other computer purged one and restored another from the shared trash.
        fs::remove_dir_all(s.root().join("trash/sessions/ses_purged")).unwrap();
        s.restore_session("ses_restored").unwrap();
        assert_eq!(purge_with(&s, &audio, &trash, at(21, 9)).unwrap(), PurgeResult { sessions: 0, audio: 1 });
        assert!(!trash.join("ses_purged").exists(), "its session is gone for good");
        assert!(audio_path(&audio, "ses_restored", 1).is_file(), "its recording goes back beside it");
        assert!(audio_path(&trash, "ses_waiting", 1).is_file(), "still in the trash, so still restorable");
    }

    #[test]
    fn restoring_something_the_other_computer_purged_says_it_is_no_longer_here() {
        let (d, s) = setup();
        let (audio, trash) = (d.path().join("audio"), d.path().join("trash/audio"));
        let err = restore_with(&s, &audio, &trash, "ses_gone").unwrap_err();
        assert_eq!(say(err), GONE);
        let err = delete_session_with(&s, &audio, &trash, "ses_gone", at(21, 9)).unwrap_err();
        assert_eq!(say(err), GONE);
    }
}
