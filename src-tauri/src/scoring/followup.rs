//! The follow-up drill: the interviewer's next question aimed at the weakest part of the answer (prompt 04), and the
//! scoring of the answer to it (prompt 05, F1 to F5). Real interviews break on the second question, not the first.

use super::coach::{self, Coach};
use super::pipeline::{word_note, CoachInput};
use super::prompts::{get, PromptId};
use super::run::{call_json, Budget, CallError};
use super::score::Verdict;
use super::template::{escape_data, Vars};
use crate::ai::llm::Llm;
use crate::metrics::fix::top_fix_for;
use crate::metrics::{Check, Metrics};
use crate::storage::model::Story;
use serde::Deserialize;
use std::collections::BTreeMap;

/// Follow-ups allowed per question: recruiter 1, every other stage 2 (`prompts/04-generate-follow-up.md`).
pub fn max_follow_ups(stage: &str) -> u32 {
    if stage == "recruiter" {
        1
    } else {
        2
    }
}

/// One line for the generator: which parts of the answer failed and which passed. The generator aims at the weakest.
pub fn score_summary(checks: &[Check]) -> String {
    let ids = |want: bool| checks.iter().filter(|c| c.passed == Some(want)).map(|c| c.id.as_str()).collect::<Vec<_>>().join(", ");
    let (failed, passed) = (ids(false), ids(true));
    format!("failed: {}. passed: {}.", if failed.is_empty() { "nothing" } else { &failed }, if passed.is_empty() { "nothing" } else { &passed })
}

/// The story's prepared branches as one block (`kind: what they might ask (angle)`), for the generator to lean on.
pub fn branches_text(stories: &[Story]) -> String {
    stories.iter().flat_map(|s| s.branches.iter()).map(|b| format!("{}: {} ({})", b.kind, b.trigger, b.angle)).collect::<Vec<_>>().join("\n")
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct FollowUp {
    #[serde(rename = "type")]
    pub kind: String,
    pub question: String,
    pub targets: String,
}

pub struct GenInput<'a> {
    pub question: &'a str,
    /// The indexed transcript of the answer being probed.
    pub transcript: &'a str,
    pub checks: &'a [Check],
    pub stage: &'a str,
    pub founder_variant: bool,
    pub branches: &'a str,
    /// Types already used for this question.
    pub used: &'a [String],
    pub jd_summary: &'a str,
}

fn clean(q: &str) -> String {
    q.trim().replace(" \u{2014} ", ", ").replace('\u{2014}', ", ")
}

fn generate_once(llm: &dyn Llm, g: &GenInput, avoid: &[String], budget: &mut Budget) -> Result<FollowUp, CallError> {
    let so_far = if avoid.is_empty() { "none".to_string() } else { avoid.join(", ") };
    let vars = Vars::new()
        .set("question", escape_data(g.question))
        .set("transcript", escape_data(g.transcript))
        .set("score_summary", score_summary(g.checks))
        .set("stage", g.stage)
        .set("founder_variant", if g.founder_variant { "true" } else { "" })
        .set("branches", escape_data(g.branches))
        .set("followups_so_far", so_far)
        .set("jd_summary", escape_data(g.jd_summary));
    let called = call_json(llm, get(PromptId::FollowUp), &vars, 400, budget)?;
    let mut f: FollowUp = serde_json::from_value(called.value).map_err(|e| CallError::Invalid(e.to_string()))?;
    f.question = clean(&f.question);
    Ok(f)
}

/// The next follow-up. A type already used for this question, or a "how would that apply here" with no posting loaded,
/// is asked for once more; a second miss is an error and the drill moves on without a follow-up.
pub fn generate(llm: &dyn Llm, g: &GenInput, budget: &mut Budget) -> Result<FollowUp, CallError> {
    let bad = |f: &FollowUp| g.used.contains(&f.kind) || (f.kind == "tack_on" && g.jd_summary.trim().is_empty());
    let first = generate_once(llm, g, g.used, budget)?;
    if !bad(&first) {
        return Ok(first);
    }
    let mut avoid = g.used.to_vec();
    avoid.push(first.kind.clone());
    let second = generate_once(llm, g, &avoid, budget)?;
    if bad(&second) {
        return Err(CallError::Invalid(format!("the follow-up repeated a type already used ({})", second.kind)));
    }
    Ok(second)
}

/// The interviewer's short reply to a clarifying question (prompt 06). The clarification itself is never scored.
pub fn clarification_reply(llm: &dyn Llm, question: &str, clarification: &str, stage: &str, jd_summary: &str, budget: &mut Budget) -> Result<String, CallError> {
    let vars = Vars::new().set("question", escape_data(question)).set("clarification", escape_data(clarification)).set("stage", stage).set("jd_summary", escape_data(jd_summary));
    let called = call_json(llm, get(PromptId::Clarify), &vars, 200, budget)?;
    let reply = called.value["reply"].as_str().unwrap_or_default().trim().replace(" \u{2014} ", ", ").replace('\u{2014}', ", ");
    if reply.is_empty() {
        return Err(CallError::Invalid("the interviewer's reply was empty".into()));
    }
    Ok(reply)
}

#[derive(Debug, Clone, Deserialize)]
struct RawFollowScore {
    clarifying_question: bool,
    not_an_answer: bool,
    criteria: BTreeMap<String, Verdict>,
}

pub struct FollowScoreInput<'a> {
    pub original_question: &'a str,
    /// The first answer, sentences numbered `[A n]`.
    pub first_transcript: &'a str,
    pub follow_up_type: &'a str,
    pub follow_up_question: &'a str,
    /// The follow-up answer, sentences numbered `[n]`.
    pub follow_up_transcript: &'a str,
    pub stories: &'a [Story],
    pub stage: &'a str,
    pub founder_variant: bool,
    pub question_type: &'a str,
    /// Measurements of the follow-up answer and the speaking time of the first answer.
    pub metrics: &'a Metrics,
    pub first_speaking_ms: u64,
    pub method: &'a str,
    pub identity_statement: &'a str,
}

#[derive(Debug, Clone, PartialEq)]
pub enum FollowScored {
    Scored { checks: Vec<Check>, fix: Option<String>, coach: Coach },
    Clarifying,
    NotAnAnswer,
}

fn verdict_check(id: &str, v: &Verdict, seconds: Option<u64>) -> Option<Check> {
    let passed = match v.result.as_str() {
        "pass" => Some(true),
        "fail" => Some(false),
        _ => return None,
    };
    Some(Check { id: id.to_string(), passed, evidence: super::criteria::verdict_evidence(v), sentences: v.sentences.clone(), seconds })
}

/// F4 is code: the follow-up should take under half the time the first answer took.
pub fn f4_short(follow_ms: u64, first_ms: u64) -> Check {
    let pass = first_ms == 0 || follow_ms * 2 < first_ms;
    Check {
        id: "f4_short".into(),
        passed: Some(pass),
        evidence: format!("{} seconds, against {} for the first answer. A follow-up answer passes under half the first, so under {} seconds.", follow_ms / 1000, first_ms / 1000, first_ms / 2000),
        sentences: vec![],
        seconds: Some(follow_ms / 1000),
    }
}

pub fn score_follow_up(llm: &dyn Llm, i: &FollowScoreInput, budget: &mut Budget) -> Result<FollowScored, CallError> {
    let stories = super::inputs::stories_text(i.stories);
    let vars = Vars::new()
        .set("original_question", escape_data(i.original_question))
        .set("first_transcript", escape_data(i.first_transcript))
        .set("follow_up_type", i.follow_up_type)
        .set("follow_up_question", escape_data(i.follow_up_question))
        .set("follow_up_transcript", escape_data(i.follow_up_transcript))
        .set("stories", escape_data(&stories));
    let called = call_json(llm, get(PromptId::ScoreFollowUp), &vars, 1500, budget)?;
    let raw: RawFollowScore = serde_json::from_value(called.value).map_err(|e| CallError::Invalid(e.to_string()))?;
    if raw.clarifying_question {
        return Ok(FollowScored::Clarifying);
    }
    if raw.not_an_answer {
        return Ok(FollowScored::NotAnAnswer);
    }
    let mut checks = Vec::new();
    for id in ["f1_answer_push", "f2_new_specific", "f3_consistent"] {
        checks.extend(raw.criteria.get(id).and_then(|v| verdict_check(id, v, None)));
    }
    checks.push(f4_short(i.metrics.speaking_ms, i.first_speaking_ms));
    // F5 only means something under a skeptic push.
    if i.follow_up_type == "skeptic_push" {
        checks.extend(raw.criteria.get("f5_held_position").and_then(|v| verdict_check("f5_held_position", v, None)));
    }
    // The follow-up's own fillers are measured by code like any answer's.
    checks.extend(i.metrics.checks.iter().filter(|c| c.id == "fillers").cloned());
    let fix = top_fix_for(&checks, false).map(String::from);
    let fix_check = fix.as_deref().and_then(|f| checks.iter().find(|c| c.id == f));
    let measurements = match fix.as_deref() {
        Some("f4_short") => format!("follow-up={}s, first answer={}s (aim under half)", i.metrics.speaking_ms / 1000, i.first_speaking_ms / 1000),
        Some("fillers") => coach::measurements("fillers", i.metrics, None, None, None),
        _ => String::new(),
    };
    let plain = i.metrics.sentences.iter().map(|s| s.text.as_str()).collect::<Vec<_>>().join(" ");
    let coach = word_note(
        llm,
        &CoachInput {
            fix: fix.as_deref(),
            evidence: fix_check.map(coach::evidence),
            measurements,
            question: i.follow_up_question,
            question_type: i.question_type,
            stage: i.stage,
            transcript: i.follow_up_transcript,
            plain_transcript: &plain,
            stories: &stories,
            method: i.method,
            identity_statement: i.identity_statement,
            // Angles never reach the follow-up prompts; the coach words the follow-up note without them.
            story_angles: "",
        },
        budget,
    )?;
    Ok(FollowScored::Scored { checks, fix, coach })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::providers::Provider;
    use crate::metrics::{compute, Inputs};
    use crate::scoring::fixtures::story;
    use crate::scoring::run::testing::Scripted;
    use crate::storage::model::Branch;
    use serde_json::json;

    fn budget() -> Budget {
        Budget::new(Provider::Claude, 0.0)
    }

    fn check(id: &str, passed: Option<bool>) -> Check {
        Check { id: id.into(), passed, evidence: String::new(), sentences: vec![], seconds: None }
    }

    fn gen_reply(kind: &str, q: &str) -> String {
        json!({"type": kind, "question": q, "targets": "ownership", "why": "t"}).to_string()
    }

    fn gen_input<'a>(checks: &'a [Check], used: &'a [String], jd: &'a str) -> GenInput<'a> {
        GenInput { question: "Tell me about a time you improved a metric.", transcript: "[1] (0.0s to 2.0s) We rebuilt onboarding.", checks, stage: "hiring_manager", founder_variant: false, branches: "", used, jd_summary: jd }
    }

    #[test]
    fn at_most_one_follow_up_at_the_recruiter_stage_and_two_elsewhere() {
        assert_eq!(max_follow_ups("recruiter"), 1);
        for s in ["hiring_manager", "panel", "leadership", "technical"] {
            assert_eq!(max_follow_ups(s), 2, "{s}");
        }
    }

    #[test]
    fn the_generator_is_told_which_parts_failed_and_which_held() {
        let checks = vec![check("ownership", Some(false)), check("proof", Some(true)), check("clean_stop", None)];
        assert_eq!(score_summary(&checks), "failed: ownership. passed: proof.");
        assert_eq!(score_summary(&[]), "failed: nothing. passed: nothing.");
    }

    #[test]
    fn prepared_story_branches_are_offered_to_the_generator() {
        let mut s = story();
        s.branches = vec![Branch { kind: "data".into(), trigger: "How did you measure it?".into(), angle: "Funnel events in the warehouse".into() }];
        assert_eq!(branches_text(&[s]), "data: How did you measure it? (Funnel events in the warehouse)");
        assert_eq!(branches_text(&[story()]), "");
    }

    #[test]
    fn a_follow_up_is_generated_with_the_weak_spot_the_stage_and_what_was_already_asked() {
        let checks = vec![check("ownership", Some(false))];
        let used = vec!["metric_probe".to_string()];
        let llm = Scripted::new(vec![Ok(&gen_reply("ownership_probe", "What was your part in that, specifically?"))]);
        let f = generate(&llm, &gen_input(&checks, &used, ""), &mut budget()).unwrap();
        assert_eq!((f.kind.as_str(), f.question.as_str()), ("ownership_probe", "What was your part in that, specifically?"));
        let seen = llm.seen.lock().unwrap();
        assert!(seen[0].user.contains("failed: ownership") && seen[0].user.contains("Follow-ups already asked for this question: metric_probe") && seen[0].user.contains("Stage: hiring_manager"), "{}", seen[0].user);
    }

    #[test]
    fn a_repeated_type_is_asked_for_again_once_and_a_second_repeat_is_an_error() {
        let used = vec!["metric_probe".to_string()];
        let llm = Scripted::new(vec![Ok(&gen_reply("metric_probe", "How did you measure that?")), Ok(&gen_reply("ownership_probe", "What was your part?"))]);
        let f = generate(&llm, &gen_input(&[], &used, ""), &mut budget()).unwrap();
        assert_eq!(f.kind, "ownership_probe");
        assert!(llm.seen.lock().unwrap()[1].user.contains("metric_probe"), "the second ask names the type to avoid");
        let llm = Scripted::new(vec![Ok(&gen_reply("metric_probe", "How did you measure that?")), Ok(&gen_reply("metric_probe", "And what was it before?"))]);
        assert!(matches!(generate(&llm, &gen_input(&[], &used, ""), &mut budget()), Err(CallError::Invalid(_))));
    }

    #[test]
    fn how_would_that_apply_here_needs_a_posting() {
        let llm = Scripted::new(vec![Ok(&gen_reply("tack_on", "How would that apply to us?")), Ok(&gen_reply("depth_branch", "What broke first?"))]);
        let f = generate(&llm, &gen_input(&[], &[], ""), &mut budget()).unwrap();
        assert_eq!(f.kind, "depth_branch");
        let llm = Scripted::new(vec![Ok(&gen_reply("tack_on", "How would that apply to our churn problem?"))]);
        assert_eq!(generate(&llm, &gen_input(&[], &[], "Reduce churn"), &mut budget()).unwrap().kind, "tack_on");
    }

    #[test]
    fn em_dashes_never_reach_the_question() {
        let llm = Scripted::new(vec![Ok(&gen_reply("skeptic_push", "Wouldn't that have happened anyway \u{2014} without you?"))]);
        let f = generate(&llm, &gen_input(&[], &[], ""), &mut budget()).unwrap();
        assert!(!f.question.contains('\u{2014}'));
    }

    #[test]
    fn the_interviewer_answers_a_clarifying_question_briefly_and_without_dashes() {
        let llm = Scripted::new(vec![Ok(r#"{"reply":"Mostly the rollout \u2014 that's where we get stuck."}"#)]);
        let r = clarification_reply(&llm, "How would you approach churn?", "Do you mean strategy or rollout?", "hiring_manager", "", &mut budget()).unwrap();
        assert_eq!(r, "Mostly the rollout, that's where we get stuck.");
        assert!(llm.seen.lock().unwrap()[0].user.contains("Do you mean strategy or rollout?"));
    }

    // ---------- scoring the answer ----------

    fn follow_metrics(speaking_s: u64) -> Metrics {
        let words: Vec<crate::speech::words::Word> = (0..20).map(|i| crate::speech::words::Word { text: if i == 19 { "done." } else { "word" }.into(), start_ms: i * speaking_s * 50, end_ms: i * speaking_s * 50 + speaking_s * 40 }).collect();
        compute(Inputs { words, stage: "hiring_manager", question_type: "behavioral", bank: vec![], keep_restart: false })
    }

    fn follow_reply(f1: &str, f2: &str, f3: &str, f5: &str) -> String {
        let v = |r: &str| json!({"result": r, "sentences": [1], "quote": "I owned the trigger", "reason": "t"});
        json!({"rubric_version": 1, "clarifying_question": false, "not_an_answer": false, "first_answer_sentence": 1,
               "criteria": {"f1_answer_push": v(f1), "f2_new_specific": v(f2), "f3_consistent": v(f3), "f5_held_position": v(f5)}})
        .to_string()
    }

    const COACH: &str = r#"{"note":"You backed off when pushed. Hold the claim and say why.","rewrite":null,"offer_follow_up":true}"#;

    fn run(llm: &Scripted, kind: &str, follow_s: u64, first_s: u64) -> Result<FollowScored, CallError> {
        let m = follow_metrics(follow_s);
        let stories = vec![story()];
        score_follow_up(
            llm,
            &FollowScoreInput {
                original_question: "Tell me about a time you improved a metric.",
                first_transcript: "[A 1] I moved activation to 44 percent.",
                follow_up_type: kind,
                follow_up_question: "Wouldn't that have happened anyway?",
                follow_up_transcript: "[1] No, because the trigger change was the only change that quarter.",
                stories: &stories,
                stage: "leadership",
                founder_variant: false,
                question_type: "behavioral",
                metrics: &m,
                first_speaking_ms: first_s * 1000,
                method: "",
                identity_statement: "",
            },
            &mut budget(),
        )
    }

    #[test]
    fn a_skeptic_push_that_was_given_way_to_fails_f5_and_that_is_the_note() {
        let llm = Scripted::new(vec![Ok(&follow_reply("pass", "pass", "pass", "fail")), Ok(COACH)]);
        match run(&llm, "skeptic_push", 10, 60).unwrap() {
            FollowScored::Scored { checks, fix, coach } => {
                assert_eq!(fix.as_deref(), Some("f5_held_position"));
                assert!(coach.note.contains("Hold the claim"));
                assert!(checks.iter().any(|c| c.id == "f4_short" && c.passed == Some(true)));
                let seen = llm.seen.lock().unwrap();
                assert!(seen[1].user.contains("Top fix: f5_held_position"));
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn f5_is_left_out_unless_the_follow_up_was_a_skeptic_push() {
        let llm = Scripted::new(vec![Ok(&follow_reply("pass", "pass", "pass", "fail")), Ok(r#"{"note":"Held up.","rewrite":null,"offer_follow_up":true}"#)]);
        match run(&llm, "ownership_probe", 10, 60).unwrap() {
            FollowScored::Scored { checks, fix, .. } => {
                assert!(checks.iter().all(|c| c.id != "f5_held_position"));
                assert_eq!(fix, None);
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn f4_is_code_the_follow_up_must_take_under_half_the_first_answers_time() {
        assert_eq!(f4_short(20_000, 60_000).passed, Some(true));
        assert_eq!(f4_short(30_000, 60_000).passed, Some(false), "exactly half is not under half");
        assert_eq!(f4_short(50_000, 0).passed, Some(true), "nothing to compare with");
        let llm = Scripted::new(vec![Ok(&follow_reply("pass", "pass", "pass", "na")), Ok(r#"{"note":"Keep it shorter.","rewrite":null,"offer_follow_up":true}"#)]);
        match run(&llm, "metric_probe", 55, 60).unwrap() {
            FollowScored::Scored { fix, .. } => assert_eq!(fix.as_deref(), Some("f4_short")),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn an_answer_that_contradicts_the_first_fails_f3_and_outranks_a_retelling() {
        let llm = Scripted::new(vec![Ok(&follow_reply("pass", "fail", "fail", "na")), Ok(COACH)]);
        match run(&llm, "metric_probe", 10, 60).unwrap() {
            FollowScored::Scored { fix, .. } => assert_eq!(fix.as_deref(), Some("f3_consistent")),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn a_clarifying_question_back_is_not_scored() {
        let mut v: serde_json::Value = serde_json::from_str(&follow_reply("na", "na", "na", "na")).unwrap();
        v["clarifying_question"] = json!(true);
        let llm = Scripted::new(vec![Ok(&v.to_string())]);
        assert_eq!(run(&llm, "ownership_probe", 10, 60).unwrap(), FollowScored::Clarifying);
        assert_eq!(llm.calls(), 1);
    }
}
