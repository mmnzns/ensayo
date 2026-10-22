//! The end of a Mock (prompt 10): the questions the candidate asked the interviewer are judged for question quality,
//! and, when the application has a must-say list, each item is checked against everything said in the Mock. One call
//! does both because both need the whole conversation. Code splits the spoken questions, labels the sentences, and
//! keeps the model to the ids it was given.

use super::prompts::{get, PromptId};
use super::run::{call_json, Budget, CallError};
use super::template::{escape_data, Vars};
use crate::ai::llm::Llm;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MustSay {
    pub id: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct QuestionChecks {
    pub specific: bool,
    pub front_loaded: bool,
    pub not_answered: bool,
    pub one_question: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct QuestionJudged {
    pub q: u32,
    pub asked: bool,
    pub result: String,
    pub checks: QuestionChecks,
    pub early_logistics: bool,
    pub quote: String,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MustSayFound {
    pub id: String,
    pub said: bool,
    pub r#where: Option<String>,
    pub quote: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Quality {
    pub questions: Vec<QuestionJudged>,
    pub weakest: u32,
    pub try_asking: String,
    pub note: String,
    pub must_say_said: Vec<MustSayFound>,
}

pub struct QualityInput<'a> {
    pub stage: &'a str,
    pub company: &'a str,
    pub role: &'a str,
    pub jd_summary: &'a str,
    pub priorities: &'a str,
    /// Every question the interviewer asked in this Mock (and replies to clarifying questions), in order.
    pub interviewer_said: &'a [String],
    /// What the candidate said when asked for their own questions. Empty when nothing was said.
    pub candidate_text: &'a str,
    pub must_say: &'a [MustSay],
    /// Each answer in the Mock, in order, as plain sentences.
    pub answers: &'a [Vec<String>],
}

/// Splits what was said into questions: a question ends at a sentence that ends with "?". Sentences left over after
/// the last one belong to the last question, or form question 1 when nothing was a question ("No, you've covered it").
pub fn split_questions(sentences: &[String]) -> Vec<Vec<String>> {
    let mut out: Vec<Vec<String>> = Vec::new();
    let mut open: Vec<String> = Vec::new();
    for s in sentences.iter().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        open.push(s.to_string());
        if s.ends_with('?') {
            out.push(std::mem::take(&mut open));
        }
    }
    if !open.is_empty() {
        match out.last_mut() {
            Some(last) => last.extend(open),
            None => out.push(open),
        }
    }
    out
}

fn sentences_of(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    for ch in text.chars() {
        cur.push(ch);
        if matches!(ch, '.' | '?' | '!') {
            out.push(std::mem::take(&mut cur));
        }
    }
    if !cur.trim().is_empty() {
        out.push(cur);
    }
    out
}

fn labelled(prefix: &str, groups: &[Vec<String>]) -> String {
    groups
        .iter()
        .enumerate()
        .flat_map(|(i, g)| g.iter().enumerate().map(move |(j, s)| format!("[{prefix} {}.{}] {}", i + 1, j + 1, s)))
        .collect::<Vec<_>>()
        .join("\n")
}

fn clean(s: &str) -> String {
    s.trim().replace(" \u{2014} ", ", ").replace('\u{2014}', ", ")
}

pub fn assess(llm: &dyn Llm, input: &QualityInput, budget: &mut Budget) -> Result<Quality, CallError> {
    let asked = split_questions(&sentences_of(input.candidate_text));
    let candidate = if asked.is_empty() { "[Q 1.1] (The candidate asked nothing.)".to_string() } else { labelled("Q", &asked) };
    let mut vars = Vars::new()
        .set("stage", input.stage)
        .set("company", escape_data(input.company))
        .set("role", escape_data(input.role))
        .set("interviewer_said", escape_data(&input.interviewer_said.join("\n")))
        .set("candidate_questions", escape_data(&candidate));
    if !input.jd_summary.trim().is_empty() {
        vars = vars.set("jd_summary", escape_data(input.jd_summary));
    }
    if !input.priorities.trim().is_empty() {
        vars = vars.set("priorities", escape_data(input.priorities));
    }
    if !input.must_say.is_empty() {
        let list = input.must_say.iter().map(|m| format!("{}: {}", m.id, m.text)).collect::<Vec<_>>().join("\n");
        vars = vars.set("must_say", escape_data(&list)).set("mock_transcript", escape_data(&labelled("A", input.answers)));
    }
    let called = call_json(llm, get(PromptId::QuestionQuality), &vars, 1800, budget)?;
    let mut q: Quality = serde_json::from_value(called.value).map_err(|e| CallError::Invalid(e.to_string()))?;
    q.try_asking = clean(&q.try_asking);
    q.note = clean(&q.note);
    for j in &mut q.questions {
        j.reason = clean(&j.reason);
    }
    // Only the items that were asked about come back, once each, in the order they were given.
    q.must_say_said = input
        .must_say
        .iter()
        .map(|m| q.must_say_said.iter().find(|f| f.id == m.id).cloned().unwrap_or(MustSayFound { id: m.id.clone(), said: false, r#where: None, quote: None }))
        .collect();
    Ok(q)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::providers::Provider;
    use crate::scoring::run::testing::Scripted;
    use serde_json::json;

    fn budget() -> Budget {
        Budget::new(Provider::Claude, 0.0)
    }

    fn reply(must_say: serde_json::Value) -> String {
        json!({
            "questions": [{"q": 1, "asked": true, "result": "pass", "checks": {"specific": true, "front_loaded": true, "not_answered": true, "one_question": true}, "early_logistics": false, "quote": "At this stage I'd guess churn is the priority; how will you judge it?", "reason": "Specific \u{2014} and framed."}],
            "weakest": 1, "try_asking": "Ask what \u{2014} exactly changed.", "note": "Keep opening with your guess.", "must_say_said": must_say
        })
        .to_string()
    }

    fn input<'a>(candidate: &'a str, must: &'a [MustSay], answers: &'a [Vec<String>], said: &'a [String]) -> QualityInput<'a> {
        QualityInput { stage: "leadership", company: "Kestrel Pay", role: "Lifecycle lead", jd_summary: "", priorities: "", interviewer_said: said, candidate_text: candidate, must_say: must, answers }
    }

    #[test]
    fn a_question_ends_at_a_question_mark_and_leftovers_join_the_last() {
        let s: Vec<String> = ["At this stage churn matters.", "How will you judge this hire?", "And what changes in a year?", "Thanks."].map(String::from).to_vec();
        let q = split_questions(&s);
        assert_eq!(q.len(), 2);
        assert_eq!(q[0].len(), 2);
        assert_eq!(q[1], vec!["And what changes in a year?".to_string(), "Thanks.".to_string()]);
    }

    #[test]
    fn nothing_asked_is_still_one_entry() {
        assert_eq!(split_questions(&["No, I think you've covered everything.".to_string()]).len(), 1);
        assert!(split_questions(&[]).is_empty());
    }

    #[test]
    fn the_spoken_questions_are_labelled_and_wrapped_as_data() {
        let llm = Scripted::new(vec![Ok(&reply(json!([])))]);
        let said = vec!["Why are you leaving?".to_string()];
        let q = assess(&llm, &input("At this stage churn matters. How will you judge this hire?", &[], &[], &said), &mut budget()).unwrap();
        assert_eq!(q.questions.len(), 1);
        let seen = llm.seen.lock().unwrap();
        let user = &seen[0].user;
        assert!(user.contains("[Q 1.1] At this stage churn matters.") && user.contains("[Q 1.2] How will you judge this hire?"), "{user}");
        assert!(user.contains("Why are you leaving?"));
        assert!(!user.contains("must_say"), "no must-say block without a list: {user}");
    }

    #[test]
    fn silence_is_sent_as_a_question_nobody_asked_not_as_nothing() {
        let llm = Scripted::new(vec![Ok(&reply(json!([])))]);
        assess(&llm, &input("", &[], &[], &[]), &mut budget()).unwrap();
        assert!(llm.seen.lock().unwrap()[0].user.contains("(The candidate asked nothing.)"));
    }

    #[test]
    fn must_say_comes_back_for_exactly_the_ids_given_and_em_dashes_are_cleaned() {
        let must = vec![MustSay { id: "ms-1".into(), text: "Ran lifecycle with no ops team".into() }, MustSay { id: "ms-2".into(), text: "Cut churn 31 to 24 percent".into() }];
        let answers = vec![vec!["I ran lifecycle on my own.".to_string()]];
        let found = json!([{"id": "ms-1", "said": true, "where": "[A 1.1]", "quote": "I ran lifecycle on my own"}, {"id": "ms-9", "said": true, "where": null, "quote": null}]);
        let llm = Scripted::new(vec![Ok(&reply(found))]);
        let q = assess(&llm, &input("How will you judge this hire?", &must, &answers, &[]), &mut budget()).unwrap();
        assert_eq!(q.must_say_said.len(), 2);
        assert!(q.must_say_said[0].said && q.must_say_said[0].r#where.as_deref() == Some("[A 1.1]"));
        assert_eq!((q.must_say_said[1].id.as_str(), q.must_say_said[1].said), ("ms-2", false), "an item the model skipped is not said");
        assert!(!q.note.contains('\u{2014}') && !q.try_asking.contains('\u{2014}') && !q.questions[0].reason.contains('\u{2014}'));
        let user = &llm.seen.lock().unwrap()[0].user;
        assert!(user.contains("ms-1: Ran lifecycle with no ops team") && user.contains("[A 1.1] I ran lifecycle on my own."), "{user}");
    }
}
