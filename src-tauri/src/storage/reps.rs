//! Sessions and reps in the data folder: `sessions/<id>/session.json` and `sessions/<id>/reps/<n>/{rep,transcript,metrics}.json`.
//! Answer audio is machine-local and handled by the caller (`paths::audio_dir`), never stored here.
//! "That note was wrong" copies the rep to `eval/<session>-<n>.json` for the eval set (M5).

use super::io::{is_safe_id, list_json};
use super::migrate;
use super::versioned::{load_record, save_record};
use super::{Loaded, Result, Storage, StorageError};
use crate::metrics::Metrics;
use crate::scoring::coach::Rewrite;
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
    /// How the question was tagged, kept so a rep can be measured again (a kept restart) the same way.
    #[serde(default)]
    pub behavioral_situation: Option<String>,
    #[serde(default)]
    pub commitment_check: bool,
    #[serde(default)]
    pub builder_operator_check: bool,
    #[serde(default = "yes")]
    pub is_major_story: bool,
    #[serde(default)]
    pub founder_variant: bool,
    /// 1, 2 or 3: tries at the same question.
    pub attempt: u32,
    pub recorded_at: String,
    /// Stories whose numbers this answer is measured against, picked by code when the question was asked.
    #[serde(default)]
    pub story_ids: Vec<String>,
    /// Set when this answer is to a follow-up question: which rep it follows and what was asked.
    #[serde(default)]
    pub follow_up: Option<FollowUpMeta>,
    /// The check the note was about, picked by code.
    pub fix: Option<String>,
    /// The coach's note and the one line to say instead. None when the rep was measured by rules only.
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub rewrite: Option<Rewrite>,
    /// How the AI judged it, for the score log. None for a rules-only rep.
    #[serde(default)]
    pub ai: Option<AiMeta>,
    pub feedback: Option<Feedback>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FollowUpMeta {
    /// The rep this follow-up probes.
    pub parent_n: u32,
    /// "ownership_probe", "skeptic_push", ...
    pub kind: String,
    pub question: String,
    /// 1 or 2: which follow-up of the question this is.
    pub number: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiMeta {
    /// "score-answer v1", "coach-note v1": versions kept so old scores keep their meaning.
    pub prompts: Vec<String>,
    pub rubric_version: u32,
    /// Estimated cost of the AI calls for this rep so far, in US dollars.
    pub cost_usd: f64,
}

/// A rep with its words and measurements, as the screens read it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FullRep {
    /// The session this rep belongs to (needed for eval copies, which sit outside the session folder).
    #[serde(default)]
    pub session_id: String,
    #[serde(flatten)]
    pub rep: Rep,
    pub transcript: Vec<Word>,
    pub metrics: Metrics,
}

/// A rep in the eval set (`eval/<session>-<n>.json`): the rep as it was scored, plus the user's own judgement per
/// criterion ("pass" or "fail"). A rep tapped "That note was wrong" is in the set with no labels yet.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EvalRecord {
    #[serde(flatten)]
    pub full: FullRep,
    #[serde(default)]
    pub labels: std::collections::BTreeMap<String, String>,
    #[serde(default)]
    pub labelled_at: Option<String>,
}

/// The transcript file: a record is always a JSON object, so the words sit under a key.
#[derive(Serialize, Deserialize)]
struct TranscriptFile {
    words: Vec<Word>,
}

fn yes() -> bool {
    true
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
        let full = &FullRep { session_id: session.to_string(), ..full.clone() };
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
        Ok(Some(FullRep { session_id: session.to_string(), rep, transcript, metrics }))
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

    fn eval_record(&self, session: &str, n: u32) -> Result<Option<EvalRecord>> {
        load_record::<EvalRecord>(&self.eval_path(session, n), migrate::unchanged)
    }

    /// "That note was wrong": records it on the rep and copies the rep into `eval/`. Tapping again with `false`
    /// removes the tap, and the copy too unless it has the user's own labels.
    pub fn label_rep(&self, session: &str, n: u32, wrong: bool, at: &str) -> Result<()> {
        let mut full = self.rep(session, n)?.ok_or_else(|| StorageError::NotFound(format!("rep {n} of {session}")))?;
        let eval = self.eval_path(session, n);
        let existing = self.eval_record(session, n)?;
        if wrong {
            full.rep.feedback = Some(Feedback { note_was_wrong: true, at: at.to_string() });
            save_record(&self.rep_dir(session, n).join("rep.json"), &full.rep)?;
            let (labels, labelled_at) = existing.map(|e| (e.labels, e.labelled_at)).unwrap_or_default();
            save_record(&eval, &EvalRecord { full, labels, labelled_at })
        } else {
            full.rep.feedback = None;
            save_record(&self.rep_dir(session, n).join("rep.json"), &full.rep)?;
            match existing {
                Some(e) if !e.labels.is_empty() => save_record(&eval, &EvalRecord { full, labels: e.labels, labelled_at: e.labelled_at }),
                Some(_) => fs::remove_file(&eval).map_err(|e| StorageError::Io(eval, e.to_string())),
                None => Ok(()),
            }
        }
    }

    /// The user's own pass or fail per criterion for a rep ("Label this rep"). Replaces any earlier labels; an empty set
    /// removes the record unless the rep is also tapped "That note was wrong".
    pub fn save_labels(&self, session: &str, n: u32, labels: std::collections::BTreeMap<String, String>, at: &str) -> Result<()> {
        if let Some((id, v)) = labels.iter().find(|(_, v)| !matches!(v.as_str(), "pass" | "fail")) {
            return Err(StorageError::Invalid(format!("label for {id} must be pass or fail, not {v}")));
        }
        let full = self.rep(session, n)?.ok_or_else(|| StorageError::NotFound(format!("rep {n} of {session}")))?;
        let eval = self.eval_path(session, n);
        if labels.is_empty() && full.rep.feedback.is_none() {
            if eval.exists() {
                fs::remove_file(&eval).map_err(|e| StorageError::Io(eval, e.to_string()))?;
            }
            return Ok(());
        }
        let labelled_at = (!labels.is_empty()).then(|| at.to_string());
        save_record(&eval, &EvalRecord { full, labels, labelled_at })
    }

    /// The reps in the eval set, oldest name first.
    pub fn eval_reps(&self) -> Result<Loaded<EvalRecord>> {
        let mut out = Loaded::<EvalRecord>::default();
        for path in list_json(&self.root().join("eval"))? {
            match load_record::<EvalRecord>(&path, migrate::unchanged) {
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
            session_id: "ses_a".into(),
            rep: Rep { n, question_id: "gen-001".into(), question_text: "Tell me about yourself.".into(), question_type: "tell_me_about_yourself".into(), behavioral_situation: None, commitment_check: false, builder_operator_check: false, is_major_story: true, founder_variant: false, attempt: 1, recorded_at: "2026-10-21T10:00:00Z".into(), story_ids: vec![], fix: Some("proof".into()), note: None, rewrite: None, ai: None, follow_up: None, feedback: None },
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
    fn per_criterion_labels_are_saved_with_the_rep_and_can_be_replaced_or_cleared() {
        let (_d, s) = storage();
        s.save_session(&session("ses_a", "2026-10-21T09:00:00Z")).unwrap();
        s.save_rep("ses_a", &rep(1)).unwrap();
        let labels: std::collections::BTreeMap<String, String> = [("answer_first".to_string(), "fail".to_string()), ("proof".to_string(), "pass".to_string())].into();
        s.save_labels("ses_a", 1, labels.clone(), "2026-10-21T11:00:00Z").unwrap();
        let rec = &s.eval_reps().unwrap().items[0];
        assert_eq!(rec.labels, labels);
        assert_eq!(rec.labelled_at.as_deref(), Some("2026-10-21T11:00:00Z"));
        assert_eq!(rec.full.rep.n, 1);
        s.save_labels("ses_a", 1, std::collections::BTreeMap::new(), "x").unwrap();
        assert!(s.eval_reps().unwrap().items.is_empty(), "no labels and no note-was-wrong tap: out of the set");
    }

    #[test]
    fn labels_must_be_pass_or_fail() {
        let (_d, s) = storage();
        s.save_session(&session("ses_a", "2026-10-21T09:00:00Z")).unwrap();
        s.save_rep("ses_a", &rep(1)).unwrap();
        let bad: std::collections::BTreeMap<String, String> = [("proof".to_string(), "maybe".to_string())].into();
        assert!(matches!(s.save_labels("ses_a", 1, bad, "x"), Err(StorageError::Invalid(_))));
    }

    #[test]
    fn taking_back_that_note_was_wrong_keeps_a_rep_that_has_labels() {
        let (_d, s) = storage();
        s.save_session(&session("ses_a", "2026-10-21T09:00:00Z")).unwrap();
        s.save_rep("ses_a", &rep(1)).unwrap();
        s.label_rep("ses_a", 1, true, "x").unwrap();
        s.save_labels("ses_a", 1, [("proof".to_string(), "pass".to_string())].into(), "y").unwrap();
        s.label_rep("ses_a", 1, false, "z").unwrap();
        let rec = &s.eval_reps().unwrap().items[0];
        assert_eq!(rec.labels.len(), 1);
        assert!(rec.full.rep.feedback.is_none());
    }

    #[test]
    fn an_old_eval_file_with_no_labels_still_loads() {
        let (_d, s) = storage();
        s.save_session(&session("ses_a", "2026-10-21T09:00:00Z")).unwrap();
        s.save_rep("ses_a", &rep(1)).unwrap();
        // Written the M3 way: a plain rep copy.
        save_record(&s.root().join("eval/ses_a-1.json"), &rep(1)).unwrap();
        let rec = &s.eval_reps().unwrap().items[0];
        assert!(rec.labels.is_empty());
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
