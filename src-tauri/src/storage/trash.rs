//! The trash for practice sessions, stories and applications. Deleting a session moves its folder to
//! `<data folder>/trash/sessions/<id>/`, a story to `trash/stories/<id>/` (its file plus the methods that listed it)
//! and an application's whole folder to `trash/applications/<id>/`, each with a `deleted_at` stamp file in it; the
//! person has seven days to restore it. The trash sits inside the data
//! folder on purpose: a second computer on the same synced folder then sees the same state. The seven days are
//! counted from the stamp file, never from file times (a sync resets those). Nothing that reads history (the sessions
//! list, rep summaries, habit stats, streaks, readiness) looks in the trash, and the eval copies in `eval/` are never
//! touched here: a rep the person labelled for the eval set stays in the eval folder.

use super::io::{atomic_write, is_safe_id, read_text, rename_retrying};
use super::migrate;
use super::applications::AppRecord;
use super::model::Story;
use super::reps::Session;
use super::versioned::{load_record, save_record};
use super::{Result, Storage, StorageError};
use chrono::{DateTime, Duration, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
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

/// A story in the trash, in brief.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TrashedStory {
    pub id: String,
    /// RFC 3339, UTC: when it was deleted.
    pub deleted_at: String,
    pub title: String,
    pub employer: String,
}

/// An application in the trash, in brief.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TrashedApplication {
    pub id: String,
    /// RFC 3339, UTC: when it was deleted.
    pub deleted_at: String,
    pub company: String,
    pub role: String,
}

/// The methods (situations) that listed a story when it was deleted, so restoring puts it back in them.
#[derive(Debug, Default, Serialize, Deserialize)]
struct MethodLinks {
    situations: Vec<String>,
}

/// What a purge removed.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct Purged {
    /// Session ids whose folders were removed.
    pub sessions: Vec<String>,
    /// Story ids removed.
    pub stories: Vec<String>,
    /// Application ids removed.
    pub applications: Vec<String>,
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
        self.ensure_writable()?;
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
        if let Err(e) = rename_retrying(&src, &dest) {
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
        self.ensure_writable()?;
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
        rename_retrying(&src, &dest).map_err(|e| io(&src, e))?;
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

    fn trash_stories_dir(&self) -> PathBuf {
        self.trash_dir().join("stories")
    }
    fn trash_applications_dir(&self) -> PathBuf {
        self.trash_dir().join("applications")
    }

    /// Moves a folder into `parent/<id>` after stamping it. A leftover with the same id is replaced (the newer wins).
    fn move_in(&self, src: &std::path::Path, parent: PathBuf, id: &str, now: DateTime<Utc>) -> Result<()> {
        let dest = parent.join(id);
        if dest.exists() {
            fs::remove_dir_all(&dest).map_err(|e| io(&dest, e))?;
        }
        fs::create_dir_all(&parent).map_err(|e| io(&parent, e))?;
        let stamp = src.join(STAMP);
        atomic_write(&stamp, stamp_text(now).as_bytes())?;
        if let Err(e) = rename_retrying(src, &dest) {
            let _ = fs::remove_file(&stamp);
            return Err(io(src, e));
        }
        Ok(())
    }

    /// Moves a story into the trash and takes it out of every method that listed it (remembering which).
    pub fn trash_story(&self, id: &str, now: DateTime<Utc>) -> Result<()> {
        self.ensure_writable()?;
        let path = self.root().join("bank/stories").join(format!("{}.json", checked(id)?));
        if !path.is_file() {
            return Err(StorageError::NotFound(format!("story {id}")));
        }
        let staging = self.trash_stories_dir().join(format!(".staging-{id}"));
        if staging.exists() {
            fs::remove_dir_all(&staging).map_err(|e| io(&staging, e))?;
        }
        fs::create_dir_all(&staging).map_err(|e| io(&staging, e))?;
        let mut links = MethodLinks::default();
        let methods = self.methods()?;
        for m in &methods {
            if m.story_ids.iter().any(|s| s == id) {
                links.situations.push(m.situation.clone());
            }
        }
        let bytes = fs::read(&path).map_err(|e| io(&path, e))?;
        atomic_write(&staging.join("story.json"), &bytes)?;
        save_record(&staging.join("methods.json"), &links)?;
        // The copy is complete before the live file goes, so a crash in between leaves the story in both places.
        self.move_in(&staging, self.trash_stories_dir(), id, now)?;
        fs::remove_file(&path).map_err(|e| io(&path, e))?;
        for mut m in methods {
            if m.story_ids.iter().any(|s| s == id) {
                m.story_ids.retain(|s| s != id);
                self.save_method(&m)?;
            }
        }
        Ok(())
    }

    /// The stories in the trash, most recently deleted first.
    pub fn trashed_stories(&self) -> Result<Vec<TrashedStory>> {
        let Ok(rd) = fs::read_dir(self.trash_stories_dir()) else { return Ok(vec![]) };
        let mut out = Vec::new();
        for entry in rd.flatten() {
            let dir = entry.path();
            if !dir.is_dir() || entry.file_name().to_string_lossy().starts_with('.') {
                continue;
            }
            let Ok(Some(s)) = load_record::<Story>(&dir.join("story.json"), migrate::story) else { continue };
            let deleted_at = self.stamp_of(&dir).map(stamp_text).unwrap_or_default();
            out.push(TrashedStory { id: s.id, deleted_at, title: s.title, employer: s.employer });
        }
        out.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at).then(a.id.cmp(&b.id)));
        Ok(out)
    }

    /// Puts a story back, and back into the methods that listed it (those that still exist). Refused when a story with
    /// that id exists again.
    pub fn restore_story(&self, id: &str) -> Result<Story> {
        self.ensure_writable()?;
        let src = self.trash_stories_dir().join(checked(id)?);
        let file = src.join("story.json");
        if !file.is_file() {
            return Err(StorageError::NotFound(format!("story {id}")));
        }
        let dest = self.root().join("bank/stories").join(format!("{id}.json"));
        if dest.exists() {
            return Err(StorageError::Invalid("That story is already back.".into()));
        }
        let links = load_record::<MethodLinks>(&src.join("methods.json"), migrate::unchanged).ok().flatten().unwrap_or_default();
        let bytes = fs::read(&file).map_err(|e| io(&file, e))?;
        atomic_write(&dest, &bytes)?;
        for mut m in self.methods()? {
            if links.situations.contains(&m.situation) && !m.story_ids.iter().any(|s| s == id) {
                m.story_ids.push(id.to_string());
                self.save_method(&m)?;
            }
        }
        fs::remove_dir_all(&src).map_err(|e| io(&src, e))?;
        self.story(id)
    }

    /// Moves an application's whole folder (posting, resume file, claims, notes) into the trash.
    pub fn trash_application(&self, id: &str, now: DateTime<Utc>) -> Result<()> {
        self.ensure_writable()?;
        let src = self.application_dir(id)?;
        if !src.is_dir() {
            return Err(StorageError::NotFound(format!("application {id}")));
        }
        self.move_in(&src, self.trash_applications_dir(), id, now)
    }

    /// The applications in the trash, most recently deleted first.
    pub fn trashed_applications(&self) -> Result<Vec<TrashedApplication>> {
        let Ok(rd) = fs::read_dir(self.trash_applications_dir()) else { return Ok(vec![]) };
        let mut out = Vec::new();
        for entry in rd.flatten() {
            let dir = entry.path();
            if !dir.is_dir() {
                continue;
            }
            let Ok(Some(a)) = load_record::<AppRecord>(&dir.join("application.json"), migrate::application) else { continue };
            let deleted_at = self.stamp_of(&dir).map(stamp_text).unwrap_or_default();
            out.push(TrashedApplication { id: a.id, deleted_at, company: a.company, role: a.role });
        }
        out.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at).then(a.id.cmp(&b.id)));
        Ok(out)
    }

    /// Moves an application's folder back. Refused when an application with that id exists again.
    pub fn restore_application(&self, id: &str) -> Result<AppRecord> {
        self.ensure_writable()?;
        let src = self.trash_applications_dir().join(checked(id)?);
        if !src.is_dir() {
            return Err(StorageError::NotFound(format!("application {id}")));
        }
        let dest = self.application_dir(id)?;
        if dest.exists() {
            return Err(StorageError::Invalid("That application is already back.".into()));
        }
        let stamp = src.join(STAMP);
        if stamp.exists() {
            fs::remove_file(&stamp).map_err(|e| io(&stamp, e))?;
        }
        fs::create_dir_all(self.applications_dir()).map_err(|e| io(&self.applications_dir(), e))?;
        rename_retrying(&src, &dest).map_err(|e| io(&src, e))?;
        self.application(id)
    }

    /// Removes what has been in the trash for more than seven days, by the stamp. A folder with no readable stamp
    /// (a sync cut it short) gets a fresh one, so its seven days start now.
    pub fn purge_trash(&self, now: DateTime<Utc>) -> Result<Purged> {
        self.ensure_writable()?;
        let mut out = Purged::default();
        out.sessions = self.purge_kind(self.trash_sessions_dir(), now)?;
        out.stories = self.purge_kind(self.trash_stories_dir(), now)?;
        out.applications = self.purge_kind(self.trash_applications_dir(), now)?;
        Ok(out)
    }

    fn purge_kind(&self, parent: PathBuf, now: DateTime<Utc>) -> Result<Vec<String>> {
        let mut gone = Vec::new();
        let Ok(rd) = fs::read_dir(parent) else { return Ok(gone) };
        for entry in rd.flatten() {
            let dir = entry.path();
            if !dir.is_dir() || entry.file_name().to_string_lossy().starts_with('.') {
                continue;
            }
            match self.stamp_of(&dir) {
                Some(at) if now - at > Duration::days(KEEP_DAYS) => {
                    fs::remove_dir_all(&dir).map_err(|e| io(&dir, e))?;
                    gone.push(entry.file_name().to_string_lossy().into_owned());
                }
                Some(_) => {}
                None => atomic_write(&dir.join(STAMP), stamp_text(now).as_bytes())?,
            }
        }
        gone.sort();
        Ok(gone)
    }

    /// Removes everything in the trash now.
    pub fn empty_trash(&self) -> Result<()> {
        self.ensure_writable()?;
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
    use crate::storage::model::Method;
    use chrono::{NaiveDate, TimeZone};

    fn storage() -> (tempfile::TempDir, Storage) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::init(dir.path().join("data")).unwrap();
        (dir, s)
    }

    fn session(id: &str, application: Option<&str>, started: &str) -> Session {
        Session { extra: Default::default(), id: id.into(), mode: "drill".into(), stage: "recruiter".into(), application_id: application.map(String::from), stage_id: application.map(|_| "stg_1".to_string()), started: started.into(), target_id: None }
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

    fn a_story(id: &str, title: &str) -> Story {
        let mut st: Story = serde_json::from_value(serde_json::json!({ "id": id, "title": title, "employer": "Fernhill" })).unwrap();
        st.direct_answer = "I did the thing.".into();
        st
    }

    #[test]
    fn a_deleted_story_goes_to_the_trash_and_comes_back_identical_into_its_methods() {
        let (_d, s) = storage();
        s.save_story(&a_story("st_a", "Pricing change")).unwrap();
        s.save_story(&a_story("st_b", "Other")).unwrap();
        s.save_method(&Method { situation: "problem_solving".into(), spoken: "x".into(), story_ids: vec!["st_a".into(), "st_b".into()], extra: Default::default() }).unwrap();
        let before = fs::read(s.root().join("bank/stories/st_a.json")).unwrap();
        s.trash_story("st_a", at(21, 9, 0, 0)).unwrap();
        assert!(!s.root().join("bank/stories/st_a.json").exists());
        assert!(s.story("st_a").is_err());
        assert_eq!(s.methods().unwrap()[0].story_ids, vec!["st_b".to_string()], "out of the method while deleted");
        assert_eq!(s.trashed_stories().unwrap(), vec![TrashedStory { id: "st_a".into(), deleted_at: "2026-10-21T09:00:00Z".into(), title: "Pricing change".into(), employer: "Fernhill".into() }]);
        s.restore_story("st_a").unwrap();
        assert_eq!(fs::read(s.root().join("bank/stories/st_a.json")).unwrap(), before, "identical content");
        assert!(s.methods().unwrap()[0].story_ids.contains(&"st_a".to_string()));
        assert!(s.trashed_stories().unwrap().is_empty());
        assert!(!s.root().join("trash/stories/st_a").exists());
    }

    #[test]
    fn delete_story_moves_to_the_trash_and_a_restore_is_refused_when_the_id_exists_again() {
        let (_d, s) = storage();
        s.save_story(&a_story("st_a", "One")).unwrap();
        s.delete_story("st_a").unwrap();
        assert_eq!(s.trashed_stories().unwrap().len(), 1);
        s.save_story(&a_story("st_a", "New one with the same id")).unwrap();
        match s.restore_story("st_a") {
            Err(StorageError::Invalid(m)) => assert_eq!(m, "That story is already back."),
            other => panic!("{other:?}"),
        }
        assert_eq!(s.story("st_a").unwrap().title, "New one with the same id", "the live story is untouched");
        assert!(matches!(s.restore_story("st_zzz"), Err(StorageError::NotFound(_))));
        assert!(matches!(s.restore_story("../x"), Err(StorageError::Invalid(_))));
    }

    #[test]
    fn a_deleted_application_moves_whole_and_comes_back_identical_and_is_refused_on_a_clash() {
        let (_d, s) = storage();
        let app = s.create_application(NewApplication { company: "Kestrel Pay".into(), role: "PM".into(), ..Default::default() }, NaiveDate::from_ymd_opt(2026, 10, 6).unwrap()).unwrap();
        s.save_application_text(&app.id, "jd.txt", "The posting").unwrap();
        s.save_application_bytes(&app.id, "resume/resume.pdf", b"%PDF-1").unwrap();
        s.save_application_text(&app.id, "notes.txt", "my notes").unwrap();
        let record_before = fs::read(s.root().join(format!("applications/{}/application.json", app.id))).unwrap();
        s.delete_application(&app.id, false).unwrap();
        assert!(!s.root().join("applications").join(&app.id).exists());
        assert!(s.load_applications(NaiveDate::from_ymd_opt(2026, 10, 21).unwrap().and_hms_opt(9, 0, 0).unwrap()).unwrap().items.is_empty());
        let listed = s.trashed_applications().unwrap();
        assert_eq!((listed[0].company.as_str(), listed[0].role.as_str()), ("Kestrel Pay", "PM"));
        let back = s.restore_application(&app.id).unwrap();
        assert_eq!(back.id, app.id);
        let dir = s.root().join("applications").join(&app.id);
        assert_eq!(fs::read(dir.join("application.json")).unwrap(), record_before);
        assert_eq!(fs::read_to_string(dir.join("jd.txt")).unwrap(), "The posting");
        assert_eq!(fs::read(dir.join("resume/resume.pdf")).unwrap(), b"%PDF-1");
        assert_eq!(fs::read_to_string(dir.join("notes.txt")).unwrap(), "my notes");
        assert!(!dir.join(STAMP).exists());
        // Delete again, make the id exist again (another computer), and restore is refused.
        s.delete_application(&app.id, false).unwrap();
        fs::create_dir_all(&dir).unwrap();
        match s.restore_application(&app.id) {
            Err(StorageError::Invalid(m)) => assert_eq!(m, "That application is already back."),
            other => panic!("{other:?}"),
        }
        assert!(s.root().join("trash/applications").join(&app.id).is_dir(), "still in the trash");
    }

    #[test]
    fn stories_and_applications_are_purged_after_seven_days_by_the_stamp() {
        let (_d, s) = storage();
        let app = s.create_application(NewApplication { company: "Kestrel Pay".into(), ..Default::default() }, NaiveDate::from_ymd_opt(2026, 10, 6).unwrap()).unwrap();
        s.save_story(&a_story("st_a", "One")).unwrap();
        s.trash_story("st_a", at(14, 9, 0, 0)).unwrap();
        s.trash_application(&app.id, at(14, 9, 0, 0)).unwrap();
        let p = s.purge_trash(at(21, 9, 0, 0)).unwrap();
        assert!(p.stories.is_empty() && p.applications.is_empty(), "exactly seven days stays");
        let p = s.purge_trash(at(21, 9, 0, 1)).unwrap();
        assert_eq!(p.stories, vec!["st_a".to_string()]);
        assert_eq!(p.applications, vec![app.id.clone()]);
        assert!(s.trashed_stories().unwrap().is_empty() && s.trashed_applications().unwrap().is_empty());
        assert!(matches!(s.restore_story("st_a"), Err(StorageError::NotFound(_))));
        assert!(matches!(s.restore_application(&app.id), Err(StorageError::NotFound(_))));
    }

    #[test]
    fn delete_all_removes_trashed_stories_and_applications_too() {
        let (_d, s) = storage();
        let app = s.create_application(NewApplication { company: "Kestrel Pay".into(), ..Default::default() }, NaiveDate::from_ymd_opt(2026, 10, 6).unwrap()).unwrap();
        s.save_story(&a_story("st_a", "One")).unwrap();
        s.delete_story("st_a").unwrap();
        s.delete_application(&app.id, false).unwrap();
        assert!(s.root().join("trash/stories/st_a").is_dir() && s.root().join("trash/applications").join(&app.id).is_dir());
        s.delete_all().unwrap();
        assert!(!s.root().join("trash").exists());
    }
}
