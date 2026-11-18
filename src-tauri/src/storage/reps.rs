//! Sessions and reps in the data folder: `sessions/<id>/session.json` and `sessions/<id>/reps/<n>/{rep,transcript,metrics}.json`.
//! Answer audio is machine-local and handled by the caller (`paths::audio_dir`), never stored here.
//! "That note was wrong" copies the rep to `eval/<session>-<n>.json` for the eval set (M5).

use super::io::{is_safe_id, list_json};
use super::migrate;
use super::versioned::{load_record, save_record};
use super::{Loaded, Result, Storage, StorageError};
use crate::metrics::Metrics;
use crate::scoring::coach::Rewrite;
use crate::scoring::smart_coach::SmartCoach;
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
    /// The stage of the application's process this session practiced (a stage may repeat, so the type in `stage` is
    /// not enough). Stays as it was when the stage is later removed; the session keeps its old `stage` name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stage_id: Option<String>,
    /// RFC 3339, UTC.
    pub started: String,
    /// The target this practice was for. Missing (a session from before targets) means the target of its application,
    /// else the first target that is not archived, decided when it is read.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_id: Option<String>,
    /// What "Continue where you left off" needs: the plan of questions and how far the session got. Sessions from
    /// before 0.3.0 have none and are never offered.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resume: Option<Resume>,
    /// Fields a newer Ensayo added to this file. Kept so saving never drops them.
    #[serde(flatten, default, skip_serializing_if = "serde_json::Map::is_empty")]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

/// The plan of a session and where it stopped. A mid-answer state is not kept: only whole answers move `next_index`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Resume {
    /// The questions in the order they are asked, as the screen's question objects (opaque here).
    pub plan: Vec<serde_json::Value>,
    /// 0-based index of the next question to ask: one past the furthest question answered.
    #[serde(default)]
    pub next_index: u32,
    /// Tries per question in a Drill.
    #[serde(default = "three")]
    pub tries: u32,
    /// A Drill offers follow-ups.
    #[serde(default = "yes")]
    pub follow_ups: bool,
    #[serde(default)]
    pub founder_variant: bool,
    /// The person ended the session, or it ran to its last question.
    #[serde(default)]
    pub ended: bool,
    /// Fields a newer Ensayo added. Kept so saving never drops them.
    #[serde(flatten, default, skip_serializing_if = "serde_json::Map::is_empty")]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

fn three() -> u32 {
    3
}

/// What starts a session's `Resume`: the plan and the settings it was started with.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct ResumeSeed {
    pub plan: Vec<serde_json::Value>,
    #[serde(default = "three")]
    pub tries: u32,
    #[serde(default = "yes")]
    pub follow_ups: bool,
    #[serde(default)]
    pub founder_variant: bool,
}

/// A session is offered for "Continue where you left off" for this long after it started.
pub const RESUME_HOURS: i64 = 24;

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
    /// The Smart coach's whole reply, when a coach-level model coached this answer (the screens show it; `note`,
    /// `fix` and `rewrite` carry the same advice in short form). None for answers judged the older way.
    #[serde(default)]
    pub coach: Option<SmartCoach>,
    pub feedback: Option<Feedback>,
    /// Fields a newer Ensayo added to this file. Kept so saving never drops them.
    #[serde(flatten, default, skip_serializing_if = "serde_json::Map::is_empty")]
    pub extra: serde_json::Map<String, serde_json::Value>,
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
    /// The model that judged it, as the provider reported it. Reps saved before 0.3.0 have none.
    #[serde(default)]
    pub model: Option<String>,
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

    /// The Mock debrief the model wrote for a session (question quality and the must-say check), kept so reopening it costs nothing.
    pub fn save_debrief(&self, session: &str, debrief: &serde_json::Value) -> Result<()> {
        save_record(&self.session_dir(checked(session)?).join("debrief.json"), debrief)
    }

    pub fn debrief(&self, session: &str) -> Result<Option<serde_json::Value>> {
        load_record(&self.session_dir(checked(session)?).join("debrief.json"), migrate::unchanged)
    }

    pub fn save_session(&self, s: &Session) -> Result<()> {
        save_record(&self.session_dir(checked(&s.id)?).join("session.json"), s)
    }

    pub fn session(&self, id: &str) -> Result<Option<Session>> {
        load_record(&self.session_dir(checked(id)?).join("session.json"), migrate::unchanged)
    }

    /// Records that the answer at `question_index` is saved: the next question is the one after it. The first call
    /// for a session also keeps its plan (`seed`); later calls only move `next_index` forward. A session without a plan
    /// (made before 0.3.0) stays without one.
    pub fn note_progress(&self, id: &str, question_index: u32, seed: Option<&ResumeSeed>) -> Result<()> {
        let Some(mut s) = self.session(id)? else { return Err(StorageError::NotFound(format!("session {id}"))) };
        let next = question_index.saturating_add(1);
        match (&mut s.resume, seed) {
            (Some(r), _) => {
                if next <= r.next_index {
                    return Ok(());
                }
                r.next_index = next;
            }
            (None, Some(seed)) => {
                s.resume = Some(Resume { plan: seed.plan.clone(), next_index: next, tries: seed.tries, follow_ups: seed.follow_ups, founder_variant: seed.founder_variant, ended: false, extra: Default::default() });
            }
            (None, None) => return Ok(()),
        }
        self.save_session(&s)
    }

    /// Marks a session ended (the person ended it, or it ran to its last question). A session without a plan is left alone.
    pub fn end_session(&self, id: &str) -> Result<()> {
        let Some(mut s) = self.session(id)? else { return Ok(()) };
        match &mut s.resume {
            Some(r) if !r.ended => r.ended = true,
            _ => return Ok(()),
        }
        self.save_session(&s)
    }

    /// The newest session started less than 24 hours ago that was not ended and still has questions left.
    pub fn resumable_session(&self, now: chrono::DateTime<chrono::Utc>) -> Result<Option<Session>> {
        let fresh = |s: &Session| {
            let Ok(started) = chrono::DateTime::parse_from_rfc3339(&s.started) else { return false };
            let age = now - started.with_timezone(&chrono::Utc);
            age >= chrono::Duration::zero() && age < chrono::Duration::hours(RESUME_HOURS)
        };
        Ok(self.sessions()?.items.into_iter().find(|s| fresh(s) && s.resume.as_ref().is_some_and(|r| !r.ended && (r.next_index as usize) < r.plan.len())))
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

    /// How many reps (answers) a session has, without reading their transcripts.
    pub fn rep_count(&self, session: &str) -> usize {
        checked(session).map(|s| self.rep_numbers(s).len()).unwrap_or(0)
    }

    /// The number the next rep in this session gets: one more than the highest so far.
    pub fn next_rep_number(&self, session: &str) -> Result<u32> {
        Ok(self.rep_numbers(checked(session)?).into_iter().max().unwrap_or(0) + 1)
    }

    pub(crate) fn rep_numbers(&self, session: &str) -> Vec<u32> {
        let Ok(rd) = fs::read_dir(self.session_dir(session).join("reps")) else { return vec![] };
        let mut v: Vec<u32> = rd.flatten().filter_map(|e| e.file_name().to_string_lossy().parse().ok()).collect();
        v.sort_unstable();
        v
    }

    /// Only the `rep.json` files of a session, without the words and measurements.
    pub(crate) fn rep_records(&self, session: &str) -> Vec<Rep> {
        let Ok(session) = checked(session) else { return vec![] };
        self.rep_numbers(session).into_iter().filter_map(|n| load_record::<Rep>(&self.rep_dir(session, n).join("rep.json"), migrate::unchanged).ok().flatten()).collect()
    }

    /// Answers practiced per story and target: `story id -> target id -> answers`. A follow-up and the candidate's own
    /// questions are not answers with a story. A session counts for its target (see `session_target`).
    pub fn story_practice_by_target(&self) -> Result<std::collections::BTreeMap<String, std::collections::BTreeMap<String, u32>>> {
        let mut out: std::collections::BTreeMap<String, std::collections::BTreeMap<String, u32>> = Default::default();
        for session in self.sessions()?.items {
            let Some(target) = self.session_target(&session)? else { continue };
            for rep in self.rep_records(&session.id) {
                if rep.follow_up.is_some() || rep.question_type == "candidate_questions" {
                    continue;
                }
                for story in &rep.story_ids {
                    *out.entry(story.clone()).or_default().entry(target.clone()).or_default() += 1;
                }
            }
        }
        Ok(out)
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
        self.ensure_writable()?;
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
        self.ensure_writable()?;
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
        self.ensure_writable()?;
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
    use chrono::TimeZone;

    fn storage() -> (tempfile::TempDir, Storage) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::init(dir.path().join("data")).unwrap();
        (dir, s)
    }

    #[test]
    fn a_rep_saved_before_the_model_was_recorded_still_loads() {
        let old: AiMeta = serde_json::from_str(r#"{"prompts": ["score-answer v3"], "rubric_version": 2, "cost_usd": 0.01}"#).unwrap();
        assert_eq!(old.model, None);
        let new: AiMeta = serde_json::from_str(r#"{"prompts": [], "rubric_version": 2, "cost_usd": 0.0, "model": "claude-sonnet-5-5"}"#).unwrap();
        assert_eq!(new.model.as_deref(), Some("claude-sonnet-5-5"));
    }

    fn session(id: &str, started: &str) -> Session {
        Session { extra: Default::default(), resume: None, id: id.into(), mode: "drill".into(), stage: "recruiter".into(), application_id: None, stage_id: None, started: started.into(), target_id: None }
    }

    fn rep(n: u32) -> FullRep {
        let words: Vec<Word> = (0..12).map(|i| Word { text: if i == 11 { "it." } else { "word" }.into(), start_ms: i * 500, end_ms: i * 500 + 400 }).collect();
        let metrics = compute(Inputs { words: words.clone(), stage: "recruiter", question_type: "behavioral", bank: numbers::extract("24%"), keep_restart: false });
        FullRep {
            session_id: "ses_a".into(),
            rep: Rep { extra: Default::default(), n, question_id: "gen-001".into(), question_text: "Tell me about yourself.".into(), question_type: "tell_me_about_yourself".into(), behavioral_situation: None, commitment_check: false, builder_operator_check: false, is_major_story: true, founder_variant: false, attempt: 1, recorded_at: "2026-10-21T10:00:00Z".into(), story_ids: vec![], fix: Some("proof".into()), note: None, rewrite: None, ai: None, coach: None, follow_up: None, feedback: None },
            transcript: words,
            metrics,
        }
    }

    #[test]
    fn answers_practiced_with_a_story_are_counted_per_target_of_their_session() {
        use crate::storage::targets::Target;
        let (_d, s) = storage();
        let a = s.save_target(&Target::default()).unwrap();
        let b = s.save_target(&Target::default()).unwrap();
        let sess = |id: &str, target: Option<&str>| Session { extra: Default::default(), resume: None, id: id.into(), mode: "drill".into(), stage: "recruiter".into(), application_id: None, stage_id: None, started: "2026-10-21T09:00:00Z".into(), target_id: target.map(String::from) };
        s.save_session(&sess("ses_a", Some(&a.id))).unwrap();
        s.save_session(&sess("ses_b", Some(&b.id))).unwrap();
        s.save_session(&sess("ses_old", None)).unwrap();
        let with = |n: u32, stories: &[&str], follow_up: bool| {
            let mut r = rep(n);
            r.rep.story_ids = stories.iter().map(|x| x.to_string()).collect();
            if follow_up {
                r.rep.follow_up = Some(FollowUpMeta { parent_n: 1, kind: "ownership_probe".into(), question: "?".into(), number: 1 });
            }
            r
        };
        s.save_rep("ses_a", &with(1, &["st_x"], false)).unwrap();
        s.save_rep("ses_a", &with(2, &["st_x", "st_y"], false)).unwrap();
        s.save_rep("ses_a", &with(3, &["st_x"], true)).unwrap();
        s.save_rep("ses_b", &with(1, &["st_x"], false)).unwrap();
        s.save_rep("ses_old", &with(1, &["st_y"], false)).unwrap();
        let by = s.story_practice_by_target().unwrap();
        assert_eq!(by["st_x"], [(a.id.clone(), 2), (b.id.clone(), 1)].into_iter().collect(), "a follow-up is not counted");
        assert_eq!(by["st_y"], [(a.id.clone(), 2)].into_iter().collect(), "a session with no target is the first target's");
        let stories = s.with_practice_by_target(vec![crate::storage::model::Story { id: "st_x".into(), ..crate::storage::targets::story_for_tests("st_x") }, crate::storage::targets::story_for_tests("st_none")]).unwrap();
        assert_eq!(stories[0].usage.by_target.get(&a.id), Some(&2));
        assert!(stories[1].usage.by_target.is_empty());
        let json = serde_json::to_value(&stories[0].usage).unwrap();
        assert_eq!(json["byTarget"][a.id.as_str()], 2);
        assert!(serde_json::to_value(&stories[1].usage).unwrap().get("byTarget").is_none());
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

    fn seed(n: usize) -> ResumeSeed {
        ResumeSeed { plan: (0..n).map(|i| serde_json::json!({ "id": format!("q{i}") })).collect(), tries: 3, follow_ups: true, founder_variant: false }
    }

    fn at(day: u32, h: u32) -> chrono::DateTime<chrono::Utc> {
        use chrono::TimeZone;
        chrono::Utc.with_ymd_and_hms(2026, 10, day, h, 0, 0).unwrap()
    }

    #[test]
    fn next_index_is_saved_after_each_answer_and_never_goes_back() {
        let (_d, s) = storage();
        s.save_session(&session("ses_a", "2026-10-21T09:00:00Z")).unwrap();
        s.note_progress("ses_a", 0, Some(&seed(5))).unwrap();
        assert_eq!(s.session("ses_a").unwrap().unwrap().resume.unwrap().next_index, 1);
        s.note_progress("ses_a", 2, None).unwrap();
        s.note_progress("ses_a", 1, None).unwrap();
        let r = s.session("ses_a").unwrap().unwrap().resume.unwrap();
        assert_eq!((r.next_index, r.plan.len()), (3, 5));
        // A session without a plan (from before 0.3.0) stays without one.
        s.save_session(&session("ses_old", "2026-10-21T09:00:00Z")).unwrap();
        s.note_progress("ses_old", 0, None).unwrap();
        assert!(s.session("ses_old").unwrap().unwrap().resume.is_none());
    }

    #[test]
    fn the_resume_fields_survive_a_save_and_an_unknown_field_next_to_them() {
        let (_d, s) = storage();
        s.save_session(&session("ses_a", "2026-10-21T09:00:00Z")).unwrap();
        s.note_progress("ses_a", 0, Some(&seed(2))).unwrap();
        let path = s.root().join("sessions/ses_a/session.json");
        let mut v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        v["from_a_newer_ensayo"] = serde_json::json!(true);
        v["resume"]["also_newer"] = serde_json::json!(1);
        std::fs::write(&path, v.to_string()).unwrap();
        s.end_session("ses_a").unwrap();
        let v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!((v["from_a_newer_ensayo"].as_bool(), v["resume"]["also_newer"].as_i64(), v["resume"]["ended"].as_bool(), v["schema_version"].as_u64()), (Some(true), Some(1), Some(true), Some(2)));
    }

    #[test]
    fn only_a_recent_unended_session_with_questions_left_is_offered() {
        let (_d, s) = storage();
        let now = at(21, 12);
        // Newest first by start: fresh+open, then ones that must not be offered.
        s.save_session(&session("ses_ended", "2026-10-21T11:00:00Z")).unwrap();
        s.note_progress("ses_ended", 0, Some(&seed(5))).unwrap();
        s.end_session("ses_ended").unwrap();
        s.save_session(&session("ses_done", "2026-10-21T10:30:00Z")).unwrap();
        s.note_progress("ses_done", 2, Some(&seed(3))).unwrap();
        s.save_session(&session("ses_plain", "2026-10-21T10:00:00Z")).unwrap();
        assert!(s.resumable_session(now).unwrap().is_none(), "ended, finished and plan-less sessions are not offered");
        s.save_session(&session("ses_open", "2026-10-21T09:00:00Z")).unwrap();
        s.note_progress("ses_open", 1, Some(&seed(5))).unwrap();
        assert_eq!(s.resumable_session(now).unwrap().unwrap().id, "ses_open");
        // 24 hours exactly is too old; a minute under is fine.
        assert!(s.resumable_session(at(22, 9)).unwrap().is_none());
        assert_eq!(s.resumable_session(chrono::Utc.with_ymd_and_hms(2026, 10, 22, 8, 59, 0).unwrap()).unwrap().unwrap().id, "ses_open");
        // The newest qualifying one wins.
        s.save_session(&session("ses_newer", "2026-10-21T11:30:00Z")).unwrap();
        s.note_progress("ses_newer", 0, Some(&seed(2))).unwrap();
        assert_eq!(s.resumable_session(now).unwrap().unwrap().id, "ses_newer");
        assert_eq!(s.resumable_session(now).unwrap().unwrap().resume.unwrap().next_index, 1);
    }
}
