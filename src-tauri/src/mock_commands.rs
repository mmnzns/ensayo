//! The end of a Mock: judge the candidate's own questions and check the must-say list (prompt 10), once, from what
//! the session saved. The result is kept in the session folder so the debrief can be reopened for free.

use crate::rep_commands::{blocking, open, plain, with_ai, AiCtx, Cmd};
use crate::scoring::mock_debrief::{assess, MustSay, Quality, QualityInput};
use crate::storage::reps::FullRep;
use crate::storage::Storage;
use serde::Deserialize;

const NO_ENGINE: &str = "The notes on your questions need a feedback engine. Choose one in Settings › AI.";

#[derive(Debug, Clone, Deserialize)]
pub struct DebriefArgs {
    pub session_id: String,
    pub company: String,
    pub role: String,
    #[serde(default)]
    pub jd_summary: String,
    #[serde(default)]
    pub priorities: String,
    #[serde(default)]
    pub must_say: Vec<MustSay>,
    /// Ask the model again even when a debrief is already saved.
    #[serde(default)]
    pub refresh: bool,
}

fn sentences(r: &FullRep) -> Vec<String> {
    r.metrics.sentences.iter().map(|s| s.text.clone()).collect()
}

/// What the interviewer said in this Mock, in order: each question and each follow-up, once.
fn interviewer_said(reps: &[FullRep]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for r in reps.iter().filter(|r| r.rep.question_type != "candidate_questions") {
        if !out.contains(&r.rep.question_text) {
            out.push(r.rep.question_text.clone());
        }
    }
    out
}

pub fn debrief_with(storage: &Storage, ai: &mut AiCtx, args: &DebriefArgs) -> Result<Quality, String> {
    let session = storage.session(&args.session_id).map_err(plain)?.ok_or("Ensayo couldn't find that session.")?;
    let reps = storage.reps(&args.session_id).map_err(plain)?.items;
    let said = interviewer_said(&reps);
    let own = reps.iter().rev().find(|r| r.rep.question_type == "candidate_questions");
    let candidate_text = own.map(|r| sentences(r).join(" ")).unwrap_or_default();
    let answers: Vec<Vec<String>> = reps.iter().filter(|r| r.rep.question_type != "candidate_questions" && r.rep.follow_up.is_none()).map(sentences).collect();
    let input = QualityInput { stage: &session.stage, company: &args.company, role: &args.role, jd_summary: &args.jd_summary, priorities: &args.priorities, interviewer_said: &said, candidate_text: &candidate_text, must_say: &args.must_say, answers: &answers };
    let quality = assess(ai.llm, &input, ai.budget).map_err(|e| e.notice())?;
    storage.save_debrief(&args.session_id, &serde_json::to_value(&quality).map_err(|e| e.to_string())?).map_err(plain)?;
    Ok(quality)
}

/// Judges the candidate's own questions and the must-say list for a finished Mock.
#[tauri::command]
pub async fn mock_debrief(args: DebriefArgs) -> Cmd<Quality> {
    blocking(move || {
        let storage = open().map_err(plain)?;
        if !args.refresh {
            if let Some(saved) = storage.debrief(&args.session_id).map_err(plain)? {
                if let Ok(q) = serde_json::from_value::<Quality>(saved) {
                    return Ok(q);
                }
            }
        }
        let (out, unavailable) = with_ai(&args.session_id, |ai| match ai {
            Some(mut ctx) => debrief_with(&storage, &mut ctx, &args),
            None => Err(NO_ENGINE.to_string()),
        });
        out.map_err(|e| unavailable.unwrap_or(e))
    })
    .await
}

/// A debrief already saved for a session, if there is one. Costs nothing.
#[tauri::command]
pub async fn load_debrief(session_id: String) -> Cmd<Option<Quality>> {
    blocking(move || {
        let storage = open().map_err(plain)?;
        Ok(storage.debrief(&session_id).map_err(plain)?.and_then(|v| serde_json::from_value(v).ok()))
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::providers::Provider;
    use crate::scoring::run::testing::Scripted;
    use crate::scoring::run::Budget;
    use crate::speech::words::Word;
    use crate::storage::reps::Session;
    use serde_json::json;

    fn words(text: &str) -> Vec<Word> {
        text.split_whitespace().enumerate().map(|(i, w)| Word { text: w.to_string(), start_ms: i as u64 * 400, end_ms: i as u64 * 400 + 350 }).collect()
    }

    fn rep(storage: &Storage, session: &str, qtype: &str, question: &str, said: &str, follow_up: bool) {
        use crate::rep_commands::{finish_with, FinishArgs};
        let _ = follow_up;
        let args = FinishArgs {
            session_id: Some(session.to_string()),
            mode: "mock".into(),
            stage: "leadership".into(),
            application_id: None,
            question_id: format!("q-{question}"),
            question_text: question.into(),
            question_type: qtype.into(),
            behavioral_situation: None,
            commitment_check: false,
            builder_operator_check: false,
            is_major_story: false,
            founder_variant: false,
            follow_up: None,
            attempt: 1,
            story_ids: vec![],
            audio_path: "/nonexistent.wav".into(),
            target_id: None,
            stage_id: None,
        };
        let long = format!("{said} {}", "and that is what I did over the whole quarter with the team ".repeat(2));
        finish_with(storage, std::path::Path::new("/nonexistent"), &args, words(&long), false, chrono::Utc::now(), None).unwrap();
    }

    fn scripted_reply() -> String {
        json!({
            "questions": [{"q": 1, "asked": true, "result": "fail", "checks": {"specific": false, "front_loaded": false, "not_answered": true, "one_question": true}, "early_logistics": false, "quote": "What is the culture like?", "reason": "Fits any company."}],
            "weakest": 1, "try_asking": "At this stage I'd guess churn is the priority; how will you judge this hire?", "note": "Open with your guess, then ask.", "must_say_said": []
        })
        .to_string()
    }

    #[test]
    fn own_questions_are_saved_without_checks_and_judged_together_with_the_whole_mock() {
        let dir = tempfile::tempdir().unwrap();
        let storage = Storage::init(dir.path().to_path_buf()).unwrap();
        storage.save_session(&Session { id: "ses_m".into(), mode: "mock".into(), stage: "leadership".into(), application_id: None, stage_id: None, started: "2026-10-22T10:00:00Z".into(), target_id: None }).unwrap();
        rep(&storage, "ses_m", "behavioral", "Tell me about a decision.", "I decided to rebuild onboarding.", false);
        rep(&storage, "ses_m", "candidate_questions", "What questions do you have for me?", "What is the culture like?", false);
        let saved = storage.reps("ses_m").unwrap().items;
        assert!(saved[1].metrics.checks.is_empty(), "the own-questions rep carries no checks, so habits ignore it");
        assert_eq!(saved[1].rep.fix, None);

        let llm = Scripted::new(vec![Ok(&scripted_reply())]);
        let mut budget = Budget::new(Provider::Claude, 0.0);
        let mut ctx = AiCtx { llm: &llm, budget: &mut budget };
        let args = DebriefArgs { session_id: "ses_m".into(), company: "Kestrel Pay".into(), role: "Lifecycle lead".into(), jd_summary: String::new(), priorities: String::new(), must_say: vec![], refresh: false };
        let q = debrief_with(&storage, &mut ctx, &args).unwrap();
        assert_eq!(q.questions[0].result, "fail");
        let seen = llm.seen.lock().unwrap();
        assert!(seen[0].user.contains("Tell me about a decision.") && !seen[0].user.contains("What questions do you have for me?"), "{}", seen[0].user);
        assert!(seen[0].user.contains("[Q 1.1] What is the culture like?"), "{}", seen[0].user);
        assert!(storage.debrief("ses_m").unwrap().is_some(), "kept for next time");
    }
}
