//! What an application adds to a rep: the stage it belongs to, the founder variant at a startup's leadership round,
//! the posting's summary for the scorer, and the consistency check (prompt 07) after a scored answer. `rep_commands`
//! calls these; they keep that module's own flow untouched.

use super::claims::{self, AnswerCtx, Extracted};
use crate::metrics::fix::top_fix_for;
use crate::metrics::Metrics;
use crate::rep_commands::AiCtx;
use crate::scoring::coach::{self, Rewrite};
use crate::scoring::criteria::with_c1;
use crate::scoring::inputs::{stories_text, transcript_text};
use crate::scoring::pipeline::{word_note, CoachInput};
use crate::scoring::prompts::{get, PromptId};
use crate::scoring::run::CallError;
use crate::storage::application_files::{AnalysisFile, ClaimsFile, RepRef};
use crate::storage::applications::AppRecord;
use crate::storage::model::Story;
use crate::storage::{Result as StorageResult, Storage};

/// The application a rep belongs to and the stage of its process it was practiced in.
pub struct AppCtx {
    pub rec: AppRecord,
    pub stage_id: String,
    /// The stage type (`recruiter`...).
    pub stage_ref: String,
}

/// None for practice without an application, and for an application that is no longer there. The stage is the one the
/// session already has, else the one the screen named, else the first of this type that is not done.
pub fn app_context(storage: &Storage, application_id: Option<&str>, session_stage_id: Option<&str>, arg_stage_id: Option<&str>, stage_type: &str) -> Option<AppCtx> {
    let rec = storage.application(application_id?).ok()?;
    let (stage_id, stage_ref) = {
        let stage = rec.stage_for(session_stage_id.or(arg_stage_id), stage_type)?;
        (stage.id.clone(), stage.stage.clone())
    };
    Some(AppCtx { rec, stage_id, stage_ref })
}

/// The leadership round of a startup is the founder variant, whatever the screen sent.
pub fn founder_variant(app: Option<&AppCtx>, stage_type: &str, given: bool) -> bool {
    given || app.is_some_and(|a| a.rec.startup && stage_type == "leadership")
}

/// What the posting is about, for the scorer's `jd_fit` and the follow-up writer. Empty until a posting has been read.
pub fn jd_summary(storage: &Storage, application_id: Option<&str>) -> String {
    let Some(id) = application_id else { return String::new() };
    storage.load_application_part::<AnalysisFile>(id, "analysis.json").ok().flatten().map(|a| a.derived.summary).unwrap_or_default()
}

/// Claims heard in a scored answer, waiting for the rep to have a number.
pub struct Pending {
    pub app_id: String,
    pub stage_id: String,
    pub stage_ref: String,
    pub question: String,
    pub extracted: Extracted,
    pub metrics: Metrics,
}

pub struct Heard<'a> {
    pub question: &'a str,
    pub question_type: &'a str,
    pub story_ids: &'a [String],
    pub identity_statement: &'a str,
    pub founder: bool,
}

fn consistency_notice(e: &CallError) -> String {
    match e {
        CallError::CapReached { .. } => format!("{} So this answer wasn't compared with what you said in earlier stages and your resume.", e.cap_words()),
        CallError::Unavailable(m) | CallError::Failed(m) => format!("{m} So this answer wasn't compared with what you said in earlier stages and your resume."),
        CallError::Invalid(_) => "The AI's reply couldn't be read, so this answer wasn't compared with what you said in earlier stages and your resume. The next answer tries again.".to_string(),
    }
}

/// After the model scored an answer inside an application: pulls the claims out, adds `c1_consistent` to its checks,
/// and when a conflict now outranks the fix the coach was told, words the note again about the conflict. A failure
/// here never loses the rep: it comes back as a plain notice.
#[allow(clippy::too_many_arguments)]
pub fn after_scored(storage: &Storage, ai: &mut AiCtx, app: &AppCtx, heard: &Heard, metrics: &mut Metrics, fix: &mut Option<String>, note: &mut Option<String>, rewrite: &mut Option<Rewrite>) -> (Option<Pending>, Option<String>) {
    let all = storage.load_stories().map(|l| l.items).unwrap_or_default();
    let stories: Vec<Story> = heard.story_ids.iter().filter_map(|id| all.iter().find(|s| &s.id == id).cloned()).collect();
    let extracted = {
        let ctx = AnswerCtx { stage_id: &app.stage_id, stage_ref: &app.stage_ref, question: heard.question, metrics, stories: &stories };
        match claims::extract(storage, ai, &app.rec.id, &ctx) {
            Ok(e) => e,
            Err(e) => return (None, Some(consistency_notice(&e))),
        }
    };
    let check = extracted.check();
    with_c1(&mut metrics.checks, check.clone());
    let new_fix = top_fix_for(&metrics.checks, heard.founder).map(String::from);
    if new_fix != *fix {
        *fix = new_fix.clone();
        if new_fix.as_deref() == Some("c1_consistent") {
            let evidence = check.as_ref().map(coach::evidence);
            let transcript = transcript_text(metrics);
            let plain: String = metrics.sentences.iter().map(|s| s.text.as_str()).collect::<Vec<_>>().join(" ");
            let story_block = stories_text(&stories);
            let worded = word_note(
                ai.llm,
                &CoachInput {
                    fix: Some("c1_consistent"),
                    evidence: evidence.clone(),
                    measurements: String::new(),
                    question: heard.question,
                    question_type: heard.question_type,
                    stage: &app.stage_ref,
                    transcript: &transcript,
                    plain_transcript: &plain,
                    stories: &story_block,
                    method: "",
                    identity_statement: heard.identity_statement,
                    // A note about saying something differently is about the claim, not the story's way in.
                    story_angles: "",
                },
                ai.budget,
            );
            match worded {
                Ok(c) => {
                    *note = Some(c.note);
                    *rewrite = c.rewrite;
                }
                Err(_) => {
                    *note = Some(format!("{} Say it the way you did before, or say what changed.", check.map(|c| c.evidence).unwrap_or_default()));
                    *rewrite = None;
                }
            }
        }
    }
    (Some(Pending { app_id: app.rec.id.clone(), stage_id: app.stage_id.clone(), stage_ref: app.stage_ref.clone(), question: heard.question.to_string(), extracted, metrics: metrics.clone() }), None)
}

/// The prompt versions this adds to a rep's score log.
pub fn prompt_tag() -> String {
    format!("extract-claims v{}", get(PromptId::Claims).version)
}

/// Writes the claims once the rep has its number.
pub fn save_pending(storage: &Storage, p: &Pending, session_id: &str, n: u32) -> StorageResult<()> {
    let ctx = AnswerCtx { stage_id: &p.stage_id, stage_ref: &p.stage_ref, question: &p.question, metrics: &p.metrics, stories: &[] };
    claims::save(storage, &p.app_id, &ctx, &p.extracted, RepRef { session_id: session_id.to_string(), n })?;
    Ok(())
}

/// Takes a rep's claims out of its application's log (the rep was thrown away, or is being scored again). Claims they
/// had replaced count again.
pub fn forget_rep(storage: &Storage, application_id: &str, session_id: &str, n: Option<u32>) -> StorageResult<usize> {
    let Some(mut file) = storage.load_application_part::<ClaimsFile>(application_id, "claims.json")? else { return Ok(0) };
    let gone: Vec<String> = file.claims.iter().filter(|c| c.rep.as_ref().is_some_and(|r| r.session_id == session_id && n.is_none_or(|n| r.n == n))).map(|c| c.id.clone()).collect();
    if gone.is_empty() {
        return Ok(0);
    }
    file.claims.retain(|c| !gone.contains(&c.id));
    for c in file.claims.iter_mut() {
        if c.superseded_by.as_ref().is_some_and(|s| gone.contains(s)) {
            c.superseded_by = None;
        }
    }
    storage.save_application_part(application_id, "claims.json", &file)?;
    Ok(gone.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::application_files::ClaimRec;
    use crate::storage::applications::NewApplication;
    use chrono::NaiveDate;

    fn setup() -> (tempfile::TempDir, Storage, String) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::init(dir.path().join("data")).unwrap();
        let app = s.create_application(NewApplication { company: "Kestrel Pay".into(), startup: true, ..Default::default() }, NaiveDate::from_ymd_opt(2026, 10, 6).unwrap()).unwrap();
        (dir, s, app.id)
    }

    fn claim(id: &str, session: &str, n: u32) -> ClaimRec {
        ClaimRec { id: id.into(), kind: "availability".into(), subject: "notice".into(), value: id.into(), quote: id.into(), stage: "stg_1".into(), stage_ref: "recruiter".into(), rep: Some(RepRef { session_id: session.into(), n }), updated: "x".into(), superseded_by: None, edited_by_user: vec![], source: "answer".into(), conflict: None }
    }

    #[test]
    fn the_stage_is_the_sessions_then_the_screens_then_the_first_open_one_of_its_type() {
        let (_d, s, id) = setup();
        s.set_stage_done(&id, "stg_2", true).unwrap();
        s.add_stage(&id, "hiring_manager", Some("Second call"), None).unwrap();
        let by = |session: Option<&str>, arg: Option<&str>, t: &str| app_context(&s, Some(&id), session, arg, t).map(|c| c.stage_id);
        assert_eq!(by(None, None, "hiring_manager").as_deref(), Some("stg_5"), "the first one is done, so the second call");
        assert_eq!(by(None, Some("stg_2"), "hiring_manager").as_deref(), Some("stg_2"));
        assert_eq!(by(Some("stg_1"), Some("stg_2"), "hiring_manager").as_deref(), Some("stg_1"), "a session stays on its stage");
        assert_eq!(by(None, None, "technical"), None, "no such stage in this process");
        assert!(app_context(&s, None, None, None, "recruiter").is_none());
        assert!(app_context(&s, Some("app_gone"), None, None, "recruiter").is_none(), "an application that was deleted is practice without one");
    }

    #[test]
    fn a_startup_leadership_round_is_the_founder_variant_and_nothing_else_is() {
        let (_d, s, id) = setup();
        let app = app_context(&s, Some(&id), None, None, "leadership");
        assert!(founder_variant(app.as_ref(), "leadership", false));
        assert!(!founder_variant(app.as_ref(), "panel", false));
        assert!(founder_variant(None, "recruiter", true), "what the screen asked for stays");
        assert!(!founder_variant(None, "leadership", false));
        s.update_application(&id, crate::storage::applications::AppPatch { startup: Some(false), ..Default::default() }).unwrap();
        let off = app_context(&s, Some(&id), None, None, "leadership");
        assert!(!founder_variant(off.as_ref(), "leadership", false), "not a startup, no founder variant");
    }

    #[test]
    fn forgetting_a_rep_takes_its_claims_out_and_brings_back_the_ones_they_replaced() {
        let (_d, s, id) = setup();
        let mut file = ClaimsFile::default();
        let mut old = claim("cl_1", "ses_a", 1);
        old.superseded_by = Some("cl_2".into());
        file.claims = vec![old, claim("cl_2", "ses_b", 1), claim("cl_3", "ses_b", 2)];
        file.next_n = 3;
        s.save_application_part(&id, "claims.json", &file).unwrap();
        assert_eq!(forget_rep(&s, &id, "ses_b", Some(1)).unwrap(), 1);
        let left = s.load_application_part::<ClaimsFile>(&id, "claims.json").unwrap().unwrap().claims;
        assert_eq!(left.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(), vec!["cl_1", "cl_3"]);
        assert!(left[0].superseded_by.is_none());
        assert_eq!(forget_rep(&s, &id, "ses_b", None).unwrap(), 1, "the whole session");
        assert_eq!(forget_rep(&s, &id, "ses_zzz", None).unwrap(), 0);
    }

    #[test]
    fn the_summary_comes_from_the_reading_of_the_posting_and_is_empty_before_one() {
        let (_d, s, id) = setup();
        assert_eq!(jd_summary(&s, Some(&id)), "");
        assert_eq!(jd_summary(&s, None), "");
        let file = AnalysisFile { prompt: "analyse-jd v1".into(), engine: "ai".into(), read_on: "x".into(), raw: None, derived: crate::storage::application_files::DerivedAnalysis { summary: "A founder-led startup.".into(), ..Default::default() }, edited_by_user: vec![] };
        s.save_application_part(&id, "analysis.json", &file).unwrap();
        assert_eq!(jd_summary(&s, Some(&id)), "A founder-led startup.");
    }
}
