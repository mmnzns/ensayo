//! The trash for practice sessions. Deleting a session moves its folder to `<data folder>/trash/sessions/<id>/` and
//! writes a `deleted_at` stamp file in it; the person has seven days to restore it. The trash sits inside the data
//! folder on purpose: a second computer on the same synced folder then sees the same state. The seven days are
//! counted from the stamp file, never from file times (a sync resets those). Nothing that reads history (the sessions
//! list, rep summaries, habit stats, streaks, readiness) looks in the trash, and the eval copies in `eval/` are never
//! touched here: a rep the person labelled for the eval set stays in the eval folder.

use super::io::{atomic_write, is_safe_id, read_text};
use super::migrate;
use super::reps::Session;
use super::versioned::{load_record, save_record};
use super::{Result, Storage, StorageError};
use chrono::{DateTime, Duration, SecondsFormat, Utc};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;

/// How long a deleted session stays restorable.
pub const KEEP_DAYS: i64 = 7;
const STAMP: &str = "deleted_at";

/// A session in the trash, in brief, for "Recently deleted".
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TrashedSession {
    pub id: String,
    /// RFC 3339, UTC: when it was deleted.
    pub deleted_at: String,
    pub started: String,
    pub stage: String,
    pub application_id: Option<String>,
    /// How many answers it has.
    pub reps: usize,
}

/// What a purge removed.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct Purged {
    /// Session ids whose folders were removed.
    pub sessions: Vec<String>,
}

fn checked(id: &str) -> Result<&str> {
    if is_safe_id(id) {
        Ok(id)
    } else {
        Err(StorageError::Invalid(format!("\"{id}\" is not a valid id")))
    }
}

fn io(path: &std::path::Path, e: std::io::Error) -> StorageError {
    StorageError::Io(path.to_path_buf(), e.to_string())
}

fn stamp_text(at: DateTime<Utc>) -> String {
    at.to_rfc3339_opts(SecondsFormat::Secs, true)
}

impl Storage {
    fn trash_dir(&self) -> PathBuf {
        self.root().join("trash")
    }
    fn trash_sessions_dir(&self) -> PathBuf {
        self.trash_dir().join("sessions")
    }
    fn trashed_dir(&self, id: &str) -> PathBuf {
        self.trash_sessions_dir().join(id)
    }

    /// Moves a session's folder into the trash and stamps it. The eval copies stay where they are.
    pub fn trash_session(&self, id: &str, now: DateTime<Utc>) -> Result<()> {
        let src = self.root().join("sessions").join(checked(id)?);
        if !src.is_dir() {
            return Err(StorageError::NotFound(format!("session {id}")));
        }
        let dest = self.trashed_dir(id);
        if dest.exists() {
            // An older copy with the same id (restored on another computer and deleted again): the newer one wins.
            fs::remove_dir_all(&dest).map_err(|e| io(&dest, e))?;
        }
        fs::create_dir_all(self.trash_sessions_dir()).map_err(|e| io(&self.trash_sessions_dir(), e))?;
        let stamp = src.join(STAMP);
        atomic_write(&stamp, stamp_text(now).as_bytes())?;
        if let Err(e) = fs::rename(&src, &dest) {
            let _ = fs::remove_file(&stamp);
            return Err(io(&src, e));
        }
        Ok(())
    }

    /// The sessions in the trash, most recently deleted first.
    pub fn trashed_sessions(&self) -> Result<Vec<TrashedSession>> {
        let Ok(rd) = fs::read_dir(self.trash_sessions_dir()) else { return Ok(vec![]) };
        let mut out = Vec::new();
        for entry in rd.flatten() {
            let dir = entry.path();
            if !dir.is_dir() {
                continue;
            }
            let Ok(Some(s)) = load_record::<Session>(&dir.join("session.json"), migrate::unchanged) else { continue };
            let deleted_at = self.stamp_of(&dir).map(stamp_text).unwrap_or_default();
            let reps = fs::read_dir(dir.join("reps")).map(|r| r.flatten().filter(|e| e.file_name().to_string_lossy().parse::<u32>().is_ok()).count()).unwrap_or(0);
            out.push(TrashedSession { id: s.id, deleted_at, started: s.started, stage: s.stage, application_id: s.application_id, reps });
        }
        out.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at).then(a.id.cmp(&b.id)));
        Ok(out)
    }

    /// The moment a trashed folder was deleted, from its stamp file. None when the file is missing or unreadable.
    fn stamp_of(&self, dir: &std::path::Path) -> Option<DateTime<Utc>> {
        let text = read_text(&dir.join(STAMP)).ok().flatten()?;
        DateTime::parse_from_rfc3339(text.trim()).ok().map(|t| t.with_timezone(&Utc))
    }

    /// Moves a session back into `sessions/`. When its application was deleted in the meantime it comes back as
    /// practice without an application. `NotFound` when it is no longer in the trash (the other computer purged it).
    pub fn restore_session(&self, id: &str) -> Result<Session> {
        let src = self.trashed_dir(checked(id)?);
        if !src.is_dir() {
            return Err(StorageError::NotFound(format!("session {id}")));
        }
        let dest = self.root().join("sessions").join(id);
        if dest.exists() {
            return Err(StorageError::Invalid("That session is already back.".into()));
        }
        let stamp = src.join(STAMP);
        if stamp.exists() {
            fs::remove_file(&stamp).map_err(|e| io(&stamp, e))?;
        }
        fs::create_dir_all(self.root().join("sessions")).map_err(|e| io(&self.root().join("sessions"), e))?;
        fs::rename(&src, &dest).map_err(|e| io(&src, e))?;
        let mut session = load_record::<Session>(&dest.join("session.json"), migrate::unchanged)?.ok_or_else(|| StorageError::NotFound(format!("session {id}")))?;
        if let Some(app) = session.application_id.clone() {
            if !self.application_dir(&app)?.is_dir() {
                session.application_id = None;
                session.stage_id = None;
                save_record(&dest.join("session.json"), &session)?;
            }
        }
        Ok(session)
    }

    /// Removes sessions that have been in the trash for more than seven days, by their stamp. A folder with no
    /// readable stamp (a sync cut it short) gets a fresh one, so its seven days start now.
    pub fn purge_trash(&self, now: DateTime<Utc>) -> Result<Purged> {
        let mut out = Purged::default();
        let Ok(rd) = fs::read_dir(self.trash_sessions_dir()) else { return Ok(out) };
        for entry in rd.flatten() {
            let dir = entry.path();
            if !dir.is_dir() {
                continue;
            }
            match self.stamp_of(&dir) {
                Some(at) if now - at > Duration::days(KEEP_DAYS) => {
                    fs::remove_dir_all(&dir).map_err(|e| io(&dir, e))?;
                    out.sessions.push(entry.file_name().to_string_lossy().into_owned());
                }
                Some(_) => {}
                None => atomic_write(&dir.join(STAMP), stamp_text(now).as_bytes())?,
            }
        }
        out.sessions.sort();
        Ok(out)
    }

    /// Removes everything in the trash now.
    pub fn empty_trash(&self) -> Result<()> {
        let dir = self.trash_dir();
        match fs::remove_dir_all(&dir) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(io(&dir, e)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::applications::NewApplication;
    use chrono::{NaiveDate, TimeZone};

    fn storage() -> (tempfile::TempDir, Storage) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::init(dir.path().join("data")).unwrap();
        (dir, s)
    }

    fn session(id: &str, application: Option<&str>, started: &str) -> Session {
        Session { id: id.into(), mode: "drill".into(), stage: "recruiter".into(), application_id: application.map(String::from), stage_id: application.map(|_| "stg_1".to_string()), started: started.into(), target_id: None }
    }

    /// A session folder with `reps` numbered rep folders (a file each) and a debrief.
    fn make(s: &Storage, id: &str, application: Option<&str>, reps: u32) {
        s.save_session(&session(id, application, "2026-10-20T10:00:00Z")).unwrap();
        for n in 1..=reps {
            let dir = s.root().join(format!("sessions/{id}/reps/{n}"));
            fs::create_dir_all(&dir).unwrap();
            fs::write(dir.join("rep.json"), "{}").unwrap();
        }
        fs::write(s.root().join(format!("sessions/{id}/debrief.json")), "{}").unwrap();
    }

    fn at(day: u32, h: u32, m: u32, sec: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 10, day, h, m, sec).unwrap()
    }

    #[test]
    fn a_deleted_session_moves_to_the_trash_with_a_stamp_and_comes_back_whole() {
        let (_d, s) = storage();
        make(&s, "ses_a", None, 2);
        s.trash_session("ses_a", at(21, 9, 0, 0)).unwrap();
        assert!(!s.root().join("sessions/ses_a").exists());
        assert!(s.root().join("trash/sessions/ses_a/session.json").is_file());
        assert!(s.root().join("trash/sessions/ses_a/reps/2/rep.json").is_file(), "the whole folder moved");
        assert_eq!(fs::read_to_string(s.root().join("trash/sessions/ses_a/deleted_at")).unwrap().trim(), "2026-10-21T09:00:00Z");
        assert!(s.session("ses_a").unwrap().is_none());
        assert!(s.sessions().unwrap().items.is_empty(), "the sessions list never reads the trash");
        let listed = s.trashed_sessions().unwrap();
        assert_eq!(listed, vec![TrashedSession { id: "ses_a".into(), deleted_at: "2026-10-21T09:00:00Z".into(), started: "2026-10-20T10:00:00Z".into(), stage: "recruiter".into(), application_id: None, reps: 2 }]);

        let back = s.restore_session("ses_a").unwrap();
        assert_eq!(back.id, "ses_a");
        assert!(s.root().join("sessions/ses_a/debrief.json").is_file());
        assert!(s.root().join("sessions/ses_a/reps/1/rep.json").is_file());
        assert!(!s.root().join("sessions/ses_a/deleted_at").exists(), "the stamp goes when it is restored");
        assert!(!s.root().join("trash/sessions/ses_a").exists());
        assert_eq!(s.sessions().unwrap().items.len(), 1);
        assert!(s.trashed_sessions().unwrap().is_empty());
    }

    #[test]
    fn eval_copies_are_not_touched_by_trashing_restoring_or_purging() {
        let (_d, s) = storage();
        make(&s, "ses_a", None, 1);
        fs::create_dir_all(s.root().join("eval")).unwrap();
        fs::write(s.root().join("eval/ses_a-1.json"), "labelled").unwrap();
        s.trash_session("ses_a", at(21, 9, 0, 0)).unwrap();
        assert_eq!(fs::read_to_string(s.root().join("eval/ses_a-1.json")).unwrap(), "labelled");
        s.restore_session("ses_a").unwrap();
        s.trash_session("ses_a", at(21, 9, 0, 0)).unwrap();
        s.purge_trash(at(30, 9, 0, 0)).unwrap();
        assert!(!s.root().join("trash/sessions/ses_a").exists());
        assert_eq!(fs::read_to_string(s.root().join("eval/ses_a-1.json")).unwrap(), "labelled", "the eval folder keeps what was labelled for it");
    }

    #[test]
    fn the_trash_is_purged_after_seven_days_by_the_stamp_and_not_before() {
        let (_d, s) = storage();
        make(&s, "ses_a", None, 1);
        s.trash_session("ses_a", at(14, 9, 0, 0)).unwrap();
        // File times say "just now" (they always do after a sync), but the stamp says otherwise: exactly seven days stays.
        assert!(s.purge_trash(at(21, 9, 0, 0)).unwrap().sessions.is_empty());
        assert!(s.root().join("trash/sessions/ses_a").is_dir());
        assert!(s.purge_trash(at(15, 9, 0, 0)).unwrap().sessions.is_empty());
        // One second over seven days goes.
        assert_eq!(s.purge_trash(at(21, 9, 0, 1)).unwrap().sessions, vec!["ses_a".to_string()]);
        assert!(!s.root().join("trash/sessions/ses_a").exists());
        assert!(matches!(s.restore_session("ses_a"), Err(StorageError::NotFound(_))), "purged elsewhere reads as not found");
    }

    #[test]
    fn the_clock_is_the_stamp_so_a_newer_folder_next_to_an_older_one_is_kept() {
        let (_d, s) = storage();
        make(&s, "ses_old", None, 1);
        make(&s, "ses_new", None, 1);
        s.trash_session("ses_old", at(10, 9, 0, 0)).unwrap();
        s.trash_session("ses_new", at(20, 9, 0, 0)).unwrap();
        assert_eq!(s.purge_trash(at(21, 9, 0, 0)).unwrap().sessions, vec!["ses_old".to_string()]);
        assert_eq!(s.trashed_sessions().unwrap().iter().map(|t| t.id.as_str()).collect::<Vec<_>>(), vec!["ses_new"]);
    }

    #[test]
    fn a_folder_without_a_readable_stamp_starts_its_seven_days_when_the_purge_finds_it() {
        let (_d, s) = storage();
        make(&s, "ses_a", None, 1);
        s.trash_session("ses_a", at(1, 9, 0, 0)).unwrap();
        fs::write(s.root().join("trash/sessions/ses_a/deleted_at"), "not a date").unwrap();
        assert!(s.purge_trash(at(21, 9, 0, 0)).unwrap().sessions.is_empty(), "never purged on a guess");
        assert_eq!(fs::read_to_string(s.root().join("trash/sessions/ses_a/deleted_at")).unwrap().trim(), "2026-10-21T09:00:00Z");
        assert!(s.purge_trash(at(28, 9, 0, 0)).unwrap().sessions.is_empty());
        assert_eq!(s.purge_trash(at(28, 9, 0, 1)).unwrap().sessions.len(), 1);
    }

    #[test]
    fn restoring_a_session_whose_application_was_deleted_makes_it_practice_without_an_application() {
        let (_d, s) = storage();
        let app = s.create_application(NewApplication { company: "Kestrel Pay".into(), ..Default::default() }, NaiveDate::from_ymd_opt(2026, 10, 6).unwrap()).unwrap();
        make(&s, "ses_a", Some(&app.id), 1);
        make(&s, "ses_b", Some(&app.id), 1);
        s.trash_session("ses_a", at(21, 9, 0, 0)).unwrap();
        // The application is still there: the session goes back to it.
        let kept = s.restore_session("ses_a").unwrap();
        assert_eq!(kept.application_id.as_deref(), Some(app.id.as_str()));
        s.trash_session("ses_a", at(21, 9, 0, 0)).unwrap();
        s.delete_application(&app.id, false).unwrap();
        let back = s.restore_session("ses_a").unwrap();
        assert_eq!((back.application_id, back.stage_id), (None, None));
        assert_eq!(s.session("ses_a").unwrap().unwrap().application_id, None, "saved that way");
    }

    #[test]
    fn deleting_an_application_with_its_practice_goes_through_the_trash() {
        let (_d, s) = storage();
        let app = s.create_application(NewApplication { company: "Kestrel Pay".into(), ..Default::default() }, NaiveDate::from_ymd_opt(2026, 10, 6).unwrap()).unwrap();
        make(&s, "ses_a", Some(&app.id), 2);
        make(&s, "ses_free", None, 1);
        let out = s.delete_application(&app.id, true).unwrap();
        assert_eq!(out.trashed_sessions, vec!["ses_a".to_string()]);
        assert!(s.session("ses_a").unwrap().is_none());
        assert!(s.session("ses_free").unwrap().is_some());
        let listed = s.trashed_sessions().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].reps, 2);
        let back = s.restore_session("ses_a").unwrap();
        assert_eq!(back.application_id, None, "its application is gone, so it comes back as general practice");
    }

    #[test]
    fn restoring_something_that_is_not_there_or_is_already_back_is_refused() {
        let (_d, s) = storage();
        assert!(matches!(s.restore_session("ses_zzz"), Err(StorageError::NotFound(_))));
        assert!(matches!(s.trash_session("ses_zzz", at(21, 9, 0, 0)), Err(StorageError::NotFound(_))));
        assert!(matches!(s.restore_session("../x"), Err(StorageError::Invalid(_))));
        assert!(matches!(s.trash_session("../x", at(21, 9, 0, 0)), Err(StorageError::Invalid(_))));
        make(&s, "ses_a", None, 1);
        s.trash_session("ses_a", at(21, 9, 0, 0)).unwrap();
        make(&s, "ses_a", None, 1); // the other computer restored it, and it is live again
        assert!(matches!(s.restore_session("ses_a"), Err(StorageError::Invalid(_))));
    }

    #[test]
    fn delete_all_empties_the_trash_and_nothing_else_in_the_folder_is_named_trash_by_accident() {
        let (_d, s) = storage();
        make(&s, "ses_a", None, 1);
        s.trash_session("ses_a", at(21, 9, 0, 0)).unwrap();
        fs::write(s.root().join("notes.txt"), "mine").unwrap();
        s.delete_all().unwrap();
        assert!(!s.root().join("trash").exists());
        assert!(s.root().join("notes.txt").exists());
        s.empty_trash().unwrap(); // nothing left: still fine
    }
}
