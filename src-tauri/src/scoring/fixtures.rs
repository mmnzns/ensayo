//! Test fixtures shared by the scoring and eval tests: the example answers (`prompts/examples`), the example story,
//! and a builder for a well-formed reply to prompt 02.

use super::pipeline::QuestionInfo;
use crate::speech::words::Word;
use crate::storage::model::{ProofPoint, Story, Usage};
use serde_json::{json, Value};

pub const TYPICAL: &str = include_str!("../../../prompts/examples/answers/typical.json");
pub const GOOD: &str = include_str!("../../../prompts/examples/answers/good.json");

pub fn words_of(fixture: &str) -> Vec<Word> {
    let v: Value = serde_json::from_str(fixture).unwrap();
    let mut out = Vec::new();
    for s in v["sentences"].as_array().unwrap() {
        let (start, end) = ((s["start"].as_f64().unwrap() * 1000.0) as u64, (s["end"].as_f64().unwrap() * 1000.0) as u64);
        let toks: Vec<&str> = s["text"].as_str().unwrap().split_whitespace().collect();
        let step = (end - start) / toks.len() as u64;
        for (i, t) in toks.iter().enumerate() {
            out.push(Word { text: t.to_string(), start_ms: start + i as u64 * step, end_ms: start + (i as u64 + 1) * step });
        }
    }
    out
}


pub fn story() -> Story {
    Story {
        id: "st_onboarding".into(),
        title: "Onboarding drop-off".into(),
        employer: "Fernhill".into(),
        best_for: vec![],
        direct_answer: "I moved seven-day activation from 31 to 44 percent.".into(),
        context: "Activation was flat for two quarters.".into(),
        approach: "I traced the funnel.".into(),
        action: "I rebuilt the trigger.".into(),
        ownership: "".into(),
        result: "Within a quarter, seven-day activation went from 31 to 44 percent.".into(),
        proof_points: vec![ProofPoint { label: "activation_7d".into(), metric: "seven-day activation".into(), before: "31".into(), after: "44".into(), unit: "%".into(), approximate: false, verified: true }],
        scale: "".into(),
        competencies: vec![],
        great_eight: vec![],
        branches: vec![],
        verified: true,
        headline: "".into(),
        usage: Usage::default(),
        year: None,
        angles: vec![],
    }
}


pub fn question() -> QuestionInfo {
    QuestionInfo { text: "Tell me about a time you improved a metric that really mattered to the business.".into(), question_type: "behavioral".into(), behavioral_situation: Some("problem_solving".into()), commitment_check: false, builder_operator_check: false, is_major_story: true }
}


pub fn verdict(result: &str, sentences: &[usize]) -> Value {
    json!({"result": result, "sentences": sentences, "quote": "", "reason": "test"})
}


pub fn score_reply(first: usize, landed: usize, exempt: &[usize], results: &[(&str, &str)], numbers_said: Value) -> String {
    let mut c = serde_json::Map::new();
    for id in ["answer_first", "proof", "story_fit", "context_short", "clean_stop", "ownership", "conviction", "no_complaining", "method_first", "approach_before_action", "jd_fit", "stage_fit", "commitment", "builder_operator", "type_fit"] {
        c.insert(id.into(), verdict("na", &[]));
    }
    for (id, r) in results {
        c.insert((*id).into(), verdict(r, &[]));
    }
    json!({"rubric_version": 1, "clarifying_question": false, "not_an_answer": false, "restart_at_sentence": null, "story_id": "st_onboarding",
           "first_answer_sentence": first, "proof_landed_sentence": landed, "tail_exempt_sentences": exempt, "approach_sentence": null, "action_sentence": null,
           "numbers_said": numbers_said, "criteria": c})
    .to_string()
}

