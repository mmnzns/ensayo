//! Sessions and reps in the data folder: `sessions/<id>/session.json` and `sessions/<id>/reps/<n>/{rep,transcript,metrics}.json`.
//! Answer audio is machine-local and handled by the caller (`paths::audio_dir`), never stored here.
//! "That note was wrong" copies the rep to `eval/<session>-<n>.json` for the eval set (M5).

use super::io::{is_safe_id, list_json};
use super::migrate;
use super::versioned::{load_record, save_record};
use super::{Loaded, Result, Storage, StorageError};
use crate::metrics::Metrics;
use crate::speech::words::Word;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    /// "drill" or "mock".
    pub mode: String,
    pub stage: String,
    pub application_id: Option<String>,
    /// RFC 3339, UTC.
    pub started: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Feedback {
    /// The user tapped "That note was wrong".
    pub note_was_wrong: bool,
    pub at: String,
}

/// Everything about one attempt except the words and the measurements, which sit in their own files.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Rep {
    pub n: u32,
    pub question_id: String,
    pub question_text: String,
    pub question_type: String,
    /// 1, 2 or 3: tries at the same question.
    pub attempt: u32,
    pub recorded_at: String,
    /// The check the note was about, picked by code.
    pub fix: Option<String>,
    pub feedback: Option<Feedback>,
}

/// A rep with its words and measurements, as the screens read it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FullRep {
    #[serde(flatten)]
    pub rep: Rep,
    pub transcript: Vec<Word>,
    pub metrics: Metrics,
}

/// The transcript file: a record is always a JSON object, so the words sit under a key.
#[derive(Serialize, Deserialize)]
struct TranscriptFile {
    words: Vec<Word>,
}

fn checked(id: &str) -> Result<&str> {
    if is_safe_id(id) {
        Ok(id)
    } else {
        Err(StorageError::Invalid(format!("\"{id}\" is not a valid id")))
    }
}

impl Storage {
    fn session_dir(&self, id: &str) -> PathBuf {
        self.root().join("sessions").join(id)
    }
    fn rep_dir(&self, session: &str, n: u32) -> PathBuf {
        self.session_dir(session).join("reps").join(n.to_string())
    }
    fn eval_path(&self, session: &str, n: u32) -> PathBuf {
        self.root().join("eval").join(format!("{session}-{n}.json"))
    }

    pub fn save_session(&self, s: &Session) -> Result<()> {
        save_record(&self.session_dir(checked(&s.id)?).join("session.json"), s)
    }

    pub fn session(&self, id: &str) -> Result<Option<Session>> {
        load_record(&self.session_dir(checked(id)?).join("session.json"), migrate::unchanged)
    }

    /// Newest first. A session folder whose file cannot be read is reported, not hidden.
    pub fn sessions(&self) -> Result<Loaded<Session>> {
        let mut out = Loaded::<Session>::default();
        let dir = self.root().join("sessions");
        let Ok(rd) = fs::read_dir(&dir) else { return Ok(out) };
        for entry in rd.flatten() {
            if !entry.path().is_dir() {
                continue;
            }
            let file = entry.path().join("session.json");
            match load_record::<Session>(&file, migrate::unchanged) {
                Ok(Some(s)) => out.items.push(s),
                Ok(None) => {}
                Err(e) => out.problems.push(format!("{}: {e}", entry.file_name().to_string_lossy())),
            }
        }
        out.items.sort_by(|a, b| b.started.cmp(&a.started));
        Ok(out)
    }

    /// The number the next rep in this session gets: one more than the highest so far.
    pub fn next_rep_number(&self, session: &str) -> Result<u32> {
        Ok(self.rep_numbers(checked(session)?).into_iter().max().unwrap_or(0) + 1)
    }

    fn rep_numbers(&self, session: &str) -> Vec<u32> {
        let Ok(rd) = fs::read_dir(self.session_dir(session).join("reps")) else { return vec![] };
        let mut v: Vec<u32> = rd.flatten().filter_map(|e| e.file_name().to_string_lossy().parse().ok()).collect();
        v.sort_unstable();
        v
    }

    pub fn save_rep(&self, session: &str, full: &FullRep) -> Result<()> {
        let dir = self.rep_dir(checked(session)?, full.rep.n);
        save_record(&dir.join("transcript.json"), &TranscriptFile { words: full.transcript.clone() })?;
        save_record(&dir.join("metrics.json"), &full.metrics)?;
        save_record(&dir.join("rep.json"), &full.rep)
    }

    pub fn rep(&self, session: &str, n: u32) -> Result<Option<FullRep>> {
        let dir = self.rep_dir(checked(session)?, n);
        let Some(rep) = load_record::<Rep>(&dir.join("rep.json"), migrate::unchanged)? else { return Ok(None) };
        let transcript = load_record::<TranscriptFile>(&dir.join("transcript.json"), migrate::unchanged)?.map(|t| t.words).unwrap_or_default();
        let metrics = load_record::<Metrics>(&dir.join("metrics.json"), migrate::unchanged)?.ok_or_else(|| StorageError::NotFound(format!("metrics for rep {n}")))?;
        Ok(Some(FullRep { rep, transcript, metrics }))
    }

    /// In the order they were made.
    pub fn reps(&self, session: &str) -> Result<Loaded<FullRep>> {
        let mut out = Loaded::<FullRep>::default();
        for n in self.rep_numbers(checked(session)?) {
            match self.rep(session, n) {
                Ok(Some(r)) => out.items.push(r),
                Ok(None) => {}
                Err(e) => out.problems.push(format!("rep {n}: {e}")),
            }
        }
        Ok(out)
    }

    /// "That note was wrong": records it on the rep and copies the rep into `eval/`. Tapping again with `false`
    /// removes the label and the copy.
    pub fn label_rep(&self, session: &str, n: u32, wrong: bool, at: &str) -> Result<()> {
        let mut full = self.rep(session, n)?.ok_or_else(|| StorageError::NotFound(format!("rep {n} of {session}")))?;
        let eval = self.eval_path(session, n);
        if wrong {
            full.rep.feedback = Some(Feedback { note_was_wrong: true, at: at.to_string() });
            save_record(&self.rep_dir(session, n).join("rep.json"), &full.rep)?;
            save_record(&eval, &full)
        } else {
            full.rep.feedback = None;
            save_record(&self.rep_dir(session, n).join("rep.json"), &full.rep)?;
            if eval.exists() {
                fs::remove_file(&eval).map_err(|e| StorageError::Io(eval, e.to_string()))?;
            }
            Ok(())
        }
    }

    /// Reps copied into the eval set, oldest name first.
    pub fn eval_reps(&self) -> Result<Loaded<FullRep>> {
        let mut out = Loaded::<FullRep>::default();
        for path in list_json(&self.root().join("eval"))? {
            match load_record::<FullRep>(&path, migrate::unchanged) {
                Ok(Some(r)) => out.items.push(r),
                Ok(None) => {}
                Err(e) => out.problems.push(format!("{}: {e}", path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default())),
            }
        }
        Ok(out)
    }

    /// Removes a rep's transcript, measurements and eval copy. The caller removes the audio.
    pub fn delete_rep(&self, session: &str, n: u32) -> Result<()> {
        let dir = self.rep_dir(checked(session)?, n);
        if !dir.is_dir() {
            return Err(StorageError::NotFound(format!("rep {n} of {session}")));
        }
        fs::remove_dir_all(&dir).map_err(|e| StorageError::Io(dir, e.to_string()))?;
        let eval = self.eval_path(session, n);
        if eval.exists() {
            fs::remove_file(&eval).map_err(|e| StorageError::Io(eval, e.to_string()))?;
        }
        Ok(())
    }

    /// Removes a whole session and every eval copy that came from it. The caller removes the audio.
    pub fn delete_session(&self, session: &str) -> Result<()> {
        for n in self.rep_numbers(checked(session)?) {
            let eval = self.eval_path(session, n);
            if eval.exists() {
                fs::remove_file(&eval).map_err(|e| StorageError::Io(eval, e.to_string()))?;
            }
        }
        let dir = self.session_dir(session);
        if !dir.is_dir() {
            return Err(StorageError::NotFound(format!("session {session}")));
        }
        fs::remove_dir_all(&dir).map_err(|e| StorageError::Io(dir, e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::metrics::{compute, numbers, Inputs};

    fn storage() -> (tempfile::TempDir, Storage) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::init(dir.path().join("data")).unwrap();
        (dir, s)
    }

    fn session(id: &str, started: &str) -> Session {
        Session { id: id.into(), mode: "drill".into(), stage: "recruiter".into(), application_id: None, started: started.into() }
    }

    fn rep(n: u32) -> FullRep {
        let words: Vec<Word> = (0..12).map(|i| Word { text: if i == 11 { "it." } else { "word" }.into(), start_ms: i * 500, end_ms: i * 500 + 400 }).collect();
        let metrics = compute(Inputs { words: words.clone(), stage: "recruiter", question_type: "behavioral", bank: numbers::extract("24%"), keep_restart: false });
        FullRep {
            rep: Rep { n, question_id: "gen-001".into(), question_text: "Tell me about yourself.".into(), question_type: "tell_me_about_yourself".into(), attempt: 1, recorded_at: "2026-10-21T10:00:00Z".into(), fix: Some("proof".into()), feedback: None },
            transcript: words,
            metrics,
        }
    }

    #[test]
    fn a_session_round_trips_and_the_list_is_newest_first() {
        let (_d, s) = storage();
        s.save_session(&session("ses_a", "2026-10-20T09:00:00Z")).unwrap();
        s.save_session(&session("ses_b", "2026-10-21T09:00:00Z")).unwrap();
        assert_eq!(s.session("ses_a").unwrap().unwrap().stage, "recruiter");
        assert!(s.session("ses_zzz").unwrap().is_none());
        let ids: Vec<_> = s.sessions().unwrap().items.into_iter().map(|x| x.id).collect();
        assert_eq!(ids, vec!["ses_b", "ses_a"]);
    }

    #[test]
    fn reps_save_read_and_number_in_order() {
        let (_d, s) = storage();
        s.save_session(&session("ses_a", "2026-10-21T09:00:00Z")).unwrap();
        assert_eq!(s.next_rep_number("ses_a").unwrap(), 1);
        s.save_rep("ses_a", &rep(1)).unwrap();
        s.save_rep("ses_a", &rep(2)).unwrap();
        s.save_rep("ses_a", &rep(10)).unwrap();
        assert_eq!(s.next_rep_number("ses_a").unwrap(), 11);
        let got = s.reps("ses_a").unwrap();
        assert_eq!(got.items.iter().map(|r| r.rep.n).collect::<Vec<_>>(), vec![1, 2, 10]);
        assert_eq!(got.items[0], rep(1));
        assert!(s.rep("ses_a", 3).unwrap().is_none());
    }

    #[test]
    fn the_files_sit_where_the_build_plan_says() {
        let (_d, s) = storage();
        s.save_session(&session("ses_a", "2026-10-21T09:00:00Z")).unwrap();
        s.save_rep("ses_a", &rep(1)).unwrap();
        for f in ["session.json", "reps/1/rep.json", "reps/1/transcript.json", "reps/1/metrics.json"] {
            assert!(s.root().join("sessions/ses_a").join(f).is_file(), "{f}");
        }
    }

    #[test]
    fn that_note_was_wrong_copies_the_rep_into_eval_and_can_be_taken_back() {
        let (_d, s) = storage();
        s.save_session(&session("ses_a", "2026-10-21T09:00:00Z")).unwrap();
        s.save_rep("ses_a", &rep(1)).unwrap();
        s.label_rep("ses_a", 1, true, "2026-10-21T10:05:00Z").unwrap();
        assert!(s.root().join("eval/ses_a-1.json").is_file());
        assert!(s.rep("ses_a", 1).unwrap().unwrap().rep.feedback.unwrap().note_was_wrong);
        assert_eq!(s.eval_reps().unwrap().items.len(), 1);
        s.label_rep("ses_a", 1, false, "2026-10-21T10:06:00Z").unwrap();
        assert!(!s.root().join("eval/ses_a-1.json").exists());
        assert!(s.rep("ses_a", 1).unwrap().unwrap().rep.feedback.is_none());
    }

    #[test]
    fn labelling_a_rep_that_is_not_there_is_not_found() {
        let (_d, s) = storage();
        assert!(matches!(s.label_rep("ses_a", 1, true, "x"), Err(StorageError::NotFound(_))));
    }

    #[test]
    fn deleting_a_rep_or_a_session_leaves_nothing_behind() {
        let (_d, s) = storage();
        s.save_session(&session("ses_a", "2026-10-21T09:00:00Z")).unwrap();
        s.save_rep("ses_a", &rep(1)).unwrap();
        s.save_rep("ses_a", &rep(2)).unwrap();
        s.label_rep("ses_a", 1, true, "x").unwrap();
        s.label_rep("ses_a", 2, true, "x").unwrap();
        s.delete_rep("ses_a", 1).unwrap();
        assert!(!s.root().join("eval/ses_a-1.json").exists());
        assert!(s.root().join("eval/ses_a-2.json").exists());
        s.delete_session("ses_a").unwrap();
        assert!(!s.root().join("sessions/ses_a").exists());
        assert!(!s.root().join("eval/ses_a-2.json").exists());
        assert!(matches!(s.delete_rep("ses_a", 1), Err(StorageError::NotFound(_))));
    }

    #[test]
    fn ids_from_outside_are_rejected() {
        let (_d, s) = storage();
        assert!(matches!(s.next_rep_number("../x"), Err(StorageError::Invalid(_))));
        assert!(matches!(s.save_session(&session("../x", "t")), Err(StorageError::Invalid(_))));
    }

    #[test]
    fn delete_all_removes_sessions_and_eval() {
        let (_d, s) = storage();
        s.save_session(&session("ses_a", "2026-10-21T09:00:00Z")).unwrap();
        s.save_rep("ses_a", &rep(1)).unwrap();
        s.label_rep("ses_a", 1, true, "x").unwrap();
        s.delete_all().unwrap();
        assert!(!s.root().join("sessions").exists());
        assert!(!s.root().join("eval").exists());
    }
}
