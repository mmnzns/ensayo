//! Which criteria are on for this answer, and how the model's verdicts and the rules' measurements become one list of
//! checks. The rules override the model where both judge (`prompts/README.md`): length, fillers, time to point and
//! the tail after the proof are measured in code from the sentence indices the model returned.

use super::score::{ScoreAnswer, Verdict};
use crate::metrics::numbers::Number;
use crate::metrics::{timing, Check, Metrics};

pub struct Ctx<'a> {
    pub question_type: &'a str,
    pub stage: &'a str,
    pub seniority: &'a str,
    pub founder_variant: bool,
    pub has_jd: bool,
    pub commitment_check: bool,
    pub builder_operator_check: bool,
    /// From the question: false for factual questions and short motivation questions.
    pub is_major_story: bool,
}

/// The criteria prompt 02 is asked to judge (`prompts/02-score-answer.md`, "active_criteria").
pub fn active_criteria(c: &Ctx) -> Vec<&'static str> {
    let factual = c.question_type == "factual";
    let mut out = vec!["answer_first"];
    if !factual {
        out.push("proof");
        out.push("story_fit");
        out.push("context_short");
    }
    out.extend(["clean_stop", "ownership", "conviction", "no_complaining", "stage_fit"]);
    if c.question_type != "behavioral" && !factual {
        out.push("type_fit");
    }
    if c.question_type == "behavioral" {
        out.push("method_first");
    }
    let senior = matches!(c.seniority, "senior" | "lead" | "director");
    if c.is_major_story && (senior || matches!(c.stage, "hiring_manager" | "leadership")) {
        out.push("approach_before_action");
    }
    if c.has_jd {
        out.push("jd_fit");
    }
    if c.founder_variant && c.commitment_check {
        out.push("commitment");
    }
    if c.founder_variant && c.builder_operator_check {
        out.push("builder_operator");
    }
    out
}

fn to_check(id: &str, v: &Verdict) -> Option<Check> {
    let passed = match v.result.as_str() {
        "pass" => Some(true),
        "fail" => Some(false),
        _ => return None,
    };
    let evidence = verdict_evidence(v);
    Some(Check { id: id.to_string(), passed, evidence, sentences: v.sentences.clone(), seconds: None })
}

/// The quote the model pointed at, then its reason in plain words, so a check never shows a bare quote or nothing.
pub(crate) fn verdict_evidence(v: &Verdict) -> String {
    let quote = v.quote.trim();
    let reason = v.reason.trim().replace('\u{2014}', ",");
    match (quote.is_empty(), reason.is_empty()) {
        (false, false) => format!("\"{quote}\" {reason}"),
        (false, true) => format!("\"{quote}\""),
        (true, false) => reason,
        (true, true) => String::new(),
    }
}

fn secs(ms: u64) -> f64 {
    ms as f64 / 1000.0
}

/// Answer start: the first word. Sentence times are on the recording clock.
fn answer_start(m: &Metrics) -> u64 {
    m.words.first().map(|w| w.start_ms).unwrap_or(0)
}

fn time_to_point(score: &ScoreAnswer, m: &Metrics) -> Option<Check> {
    let idx = score.first_answer_sentence?;
    let s = m.sentences.iter().find(|s| s.index == idx)?;
    let t = s.end_ms.saturating_sub(answer_start(m));
    Some(Check { id: "time_to_point".into(), passed: Some(t < 10_000), evidence: format!("Your point landed at {:.0} seconds. Under 10 seconds passes.", secs(t)), sentences: vec![idx], seconds: Some(t / 1000) })
}

/// Time spoken after the sentence that stated the proof, not counting a closing bridge ("That is the kind of problem
/// I would want to work on here") or an offer to go deeper, which the model marks as exempt.
pub(super) fn tail_ms(score: &ScoreAnswer, m: &Metrics) -> Option<u64> {
    let idx = score.proof_landed_sentence?;
    let landed = m.sentences.iter().find(|s| s.index == idx)?;
    let end = m.sentences.last()?.end_ms;
    let exempt: u64 = m.sentences.iter().filter(|s| s.index > idx && score.tail_exempt_sentences.contains(&s.index)).map(|s| s.end_ms - s.start_ms).sum();
    Some(end.saturating_sub(landed.end_ms).saturating_sub(exempt))
}

fn proof(score: &ScoreAnswer, m: &Metrics, bank: &[Number]) -> Option<Check> {
    let verdict = score.criteria.get("proof")?;
    if verdict.result == "na" {
        return None;
    }
    let landed: Vec<usize> = score.proof_landed_sentence.into_iter().chain(m.proof.landed_sentence).take(1).collect();
    if !bank.is_empty() {
        if let Some(n) = score.numbers_said.iter().find(|n| n.conflicts_with_bank.is_some()) {
            let bank_value = ScoreAnswer::bank_value(n.conflicts_with_bank.as_deref().unwrap_or_default());
            return Some(Check { id: "proof".into(), passed: Some(false), evidence: format!("You said {}, but your story says {}.", n.text, bank_value), sentences: vec![n.sentence], seconds: None });
        }
    }
    if !m.proof.matched.is_empty() || score.numbers_said.iter().any(|n| n.matches_bank.is_some()) {
        let said = if m.proof.matched.is_empty() { score.numbers_said.iter().filter(|n| n.matches_bank.is_some()).map(|n| n.text.clone()).collect::<Vec<_>>() } else { m.proof.matched.iter().map(|n| n.raw.clone()).collect() };
        return Some(Check { id: "proof".into(), passed: Some(true), evidence: format!("You said {}.", said.join(", ")), sentences: landed, seconds: None });
    }
    let passed = verdict.result == "pass" && (bank.is_empty() || score.numbers_said.iter().any(|n| !n.not_in_bank));
    let evidence = match score.numbers_said.iter().find(|n| n.not_in_bank && !bank.is_empty()) {
        Some(n) if !passed => format!("You said {}, which is not in your stories. Check it.", n.text),
        _ if passed => match score.numbers_said.first() {
            Some(n) => format!("You said {}.", n.text),
            None if !verdict.quote.trim().is_empty() => format!("You gave the result: \"{}\".", verdict.quote.trim()),
            None => "You gave a result in words.".to_string(),
        },
        _ => crate::metrics::no_number_evidence(bank),
    };
    Some(Check { id: "proof".into(), passed: Some(passed), evidence, sentences: landed, seconds: None })
}

/// The one list of checks for a rep: the rules' measurements (length, fillers), the model's verdicts for the judgment
/// criteria, and the timing criteria computed from the model's sentence indices.
pub fn merge(score: &ScoreAnswer, m: &Metrics, active: &[&str], bank: &[Number]) -> Vec<Check> {
    let mut out: Vec<Check> = Vec::new();
    let on = |id: &str| active.contains(&id);
    if on("answer_first") {
        out.extend(score.criteria.get("answer_first").and_then(|v| to_check("answer_first", v)));
        out.extend(time_to_point(score, m).filter(|_| score.criteria.get("answer_first").is_some_and(|v| v.result != "na")));
    }
    if on("proof") {
        out.extend(proof(score, m, bank));
    }
    if on("clean_stop") {
        let t = tail_ms(score, m);
        out.push(Check {
            id: "clean_stop".into(),
            passed: t.map(|t| t < timing::TAIL_PASS_SECONDS * 1000),
            evidence: crate::metrics::tail_evidence(t, score.proof_landed_sentence.and_then(|i| score.numbers_said.iter().rev().find(|n| n.sentence <= i)).map(|n| n.text.as_str())),
            sentences: score.proof_landed_sentence.into_iter().collect(),
            seconds: t.map(|t| t / 1000),
        });
    }
    // The rules' own checks: length and fillers are measured, never judged by the model.
    out.extend(m.checks.iter().filter(|c| c.id == "length" || c.id == "fillers").cloned());
    for id in ["story_fit", "context_short", "ownership", "conviction", "no_complaining", "method_first", "approach_before_action", "jd_fit", "stage_fit", "commitment", "builder_operator", "type_fit"] {
        if on(id) {
            out.extend(score.criteria.get(id).and_then(|v| to_check(id, v)));
        }
    }
    out
}

/// One contradiction prompt 07 found, after code checked it against the claims log.
#[derive(Debug, Clone, PartialEq)]
pub struct ConflictNote {
    /// The earlier claim's stage type (`recruiter`, `hiring_manager`...) or `resume`.
    pub earlier_stage: String,
    pub earlier_value: String,
    pub new_value: String,
    /// 1-based sentence of this answer.
    pub sentence: usize,
}

fn stage_words(stage_type: &str) -> String {
    stage_type.replace('_', " ")
}

/// `c1_consistent`, built from prompt 07's conflicts (`prompts/rubric-v1.md`): it fails when there is any, with the
/// conflict's sentence and both values as evidence, naming where the earlier version was said ("In the recruiter stage
/// you said ..."). With nothing to compare against (an empty log) there is no check at all.
pub fn c1_check(conflicts: &[ConflictNote], had_log: bool) -> Option<Check> {
    if conflicts.is_empty() {
        return had_log.then(|| Check { id: "c1_consistent".into(), passed: Some(true), evidence: "What you said matches what you said before.".into(), sentences: vec![], seconds: None });
    }
    let evidence = conflicts
        .iter()
        .map(|c| {
            let before = if c.earlier_stage == "resume" { "Your resume says".to_string() } else { format!("In the {} stage you said", stage_words(&c.earlier_stage)) };
            format!("{before} \"{}\". Here you said \"{}\".", c.earlier_value, c.new_value)
        })
        .collect::<Vec<_>>()
        .join(" ");
    let mut sentences: Vec<usize> = conflicts.iter().map(|c| c.sentence).collect();
    sentences.sort_unstable();
    sentences.dedup();
    Some(Check { id: "c1_consistent".into(), passed: Some(false), evidence, sentences, seconds: None })
}

/// Puts the consistency check into a rep's checks, replacing an earlier one. `None` removes it.
pub fn with_c1(checks: &mut Vec<Check>, c1: Option<Check>) {
    checks.retain(|c| c.id != "c1_consistent");
    checks.extend(c1);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::metrics::{compute, numbers, Inputs};
    use crate::speech::words::Word;
    use serde_json::json;

    /// An example answer (`prompts/examples/answers/*.json`) as words: each sentence's words share its time range.
    pub fn words_of(fixture: &str) -> Vec<Word> {
        let v: serde_json::Value = serde_json::from_str(fixture).unwrap();
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

    const TYPICAL: &str = include_str!("../../../prompts/examples/answers/typical.json");
    const GOOD: &str = include_str!("../../../prompts/examples/answers/good.json");

    fn verdict(result: &str, sentences: &[usize], quote: &str) -> serde_json::Value {
        json!({"result": result, "sentences": sentences, "quote": quote, "reason": "test"})
    }

    fn all_na() -> serde_json::Map<String, serde_json::Value> {
        ["answer_first", "proof", "story_fit", "context_short", "clean_stop", "ownership", "conviction", "no_complaining", "method_first", "approach_before_action", "jd_fit", "stage_fit", "commitment", "builder_operator", "type_fit"]
            .iter()
            .map(|id| (id.to_string(), verdict("na", &[], "")))
            .collect()
    }

    fn score(over: serde_json::Value, criteria: &[(&str, serde_json::Value)], numbers_said: serde_json::Value) -> ScoreAnswer {
        let mut c = all_na();
        for (k, v) in criteria {
            c.insert(k.to_string(), v.clone());
        }
        let mut base = json!({
            "rubric_version": 1, "clarifying_question": false, "not_an_answer": false, "restart_at_sentence": null, "story_id": "st_onboarding",
            "first_answer_sentence": null, "proof_landed_sentence": null, "tail_exempt_sentences": [], "approach_sentence": null, "action_sentence": null,
            "numbers_said": numbers_said, "criteria": c
        });
        for (k, v) in over.as_object().unwrap() {
            base[k] = v.clone();
        }
        serde_json::from_value(base).unwrap()
    }

    fn bank() -> Vec<numbers::Number> {
        numbers::extract("31% 44% 3 steps 1 step")
    }

    fn metrics(fixture: &str, bank: &[numbers::Number]) -> Metrics {
        compute(Inputs { words: words_of(fixture), stage: "hiring_manager", question_type: "behavioral", bank: bank.to_vec(), keep_restart: false })
    }

    fn get<'a>(checks: &'a [Check], id: &str) -> Option<&'a Check> {
        checks.iter().find(|c| c.id == id)
    }

    fn ctx(over: impl FnOnce(&mut Ctx)) -> Vec<&'static str> {
        let mut c = Ctx { question_type: "behavioral", stage: "hiring_manager", seniority: "senior", founder_variant: false, has_jd: false, commitment_check: false, builder_operator_check: false, is_major_story: true };
        over(&mut c);
        active_criteria(&c)
    }

    #[test]
    fn behavioral_in_a_senior_hiring_manager_round_matches_the_example_question() {
        // prompts/examples/question.json lists exactly these.
        let mut got = ctx(|_| {});
        got.sort();
        let mut want = vec!["answer_first", "proof", "story_fit", "context_short", "clean_stop", "ownership", "conviction", "no_complaining", "method_first", "approach_before_action", "stage_fit"];
        want.sort();
        assert_eq!(got, want);
    }

    #[test]
    fn factual_questions_drop_the_story_criteria_and_other_types_add_type_fit() {
        let f = ctx(|c| c.question_type = "factual");
        assert!(!f.contains(&"story_fit") && !f.contains(&"context_short") && !f.contains(&"proof") && !f.contains(&"type_fit") && !f.contains(&"method_first"));
        let g = ctx(|c| c.question_type = "gap");
        assert!(g.contains(&"type_fit") && !g.contains(&"method_first"));
    }

    #[test]
    fn approach_before_action_needs_seniority_or_stage_and_a_major_story() {
        assert!(!ctx(|c| { c.seniority = "early"; c.stage = "recruiter"; }).contains(&"approach_before_action"));
        assert!(ctx(|c| { c.seniority = "early"; c.stage = "leadership"; }).contains(&"approach_before_action"));
        assert!(!ctx(|c| c.is_major_story = false).contains(&"approach_before_action"));
    }

    #[test]
    fn jd_and_founder_criteria_follow_their_flags() {
        let a = ctx(|c| { c.has_jd = true; c.founder_variant = true; c.commitment_check = true; });
        assert!(a.contains(&"jd_fit") && a.contains(&"commitment") && !a.contains(&"builder_operator"));
        assert!(!ctx(|c| { c.commitment_check = true; }).contains(&"commitment"), "only in the founder variant");
    }

    #[test]
    fn the_typical_answer_fails_answer_first_and_the_timing_that_follows_from_it() {
        let m = metrics(TYPICAL, &bank());
        let s = score(
            json!({"first_answer_sentence": 6, "proof_landed_sentence": 6}),
            &[("answer_first", verdict("fail", &[1], "So, um, at Fernhill")), ("proof", verdict("pass", &[6], "44 percent")), ("story_fit", verdict("pass", &[], "")), ("ownership", verdict("fail", &[5], "we changed the trigger")), ("no_complaining", verdict("pass", &[], "")), ("method_first", verdict("fail", &[], "")), ("stage_fit", verdict("pass", &[], ""))],
            json!([{"text": "44 percent", "sentence": 6, "metric": "activation", "matches_bank": "st_onboarding.activation_7d", "conflicts_with_bank": null, "not_in_bank": false}]),
        );
        let active = ctx(|_| {});
        let checks = merge(&s, &m, &active, &bank());
        assert_eq!(get(&checks, "answer_first").unwrap().passed, Some(false));
        let ttp = get(&checks, "time_to_point").unwrap();
        assert_eq!(ttp.passed, Some(false));
        assert!(ttp.evidence.contains("42 seconds") || ttp.evidence.contains("41 seconds"), "{}", ttp.evidence);
        assert_eq!(get(&checks, "clean_stop").unwrap().passed, Some(false), "16 s after the number is over the 15 s tail");
        assert_eq!(get(&checks, "proof").unwrap().passed, Some(true));
        assert_eq!(crate::metrics::fix::top_fix(&checks), Some("answer_first"));
    }

    #[test]
    fn the_good_answer_passes_everything_and_a_closing_bridge_is_not_tail() {
        let m = metrics(GOOD, &bank());
        let s = score(
            json!({"first_answer_sentence": 1, "proof_landed_sentence": 7, "tail_exempt_sentences": [8], "approach_sentence": 4, "action_sentence": 6}),
            &[("answer_first", verdict("pass", &[1], "")), ("proof", verdict("pass", &[7], "")), ("story_fit", verdict("pass", &[], "")), ("context_short", verdict("pass", &[], "")), ("ownership", verdict("pass", &[], "")), ("conviction", verdict("pass", &[], "")), ("no_complaining", verdict("pass", &[], "")), ("method_first", verdict("pass", &[2], "")), ("approach_before_action", verdict("pass", &[], "")), ("stage_fit", verdict("pass", &[], ""))],
            json!([{"text": "31 to 44 percent", "sentence": 7, "metric": "activation", "matches_bank": "st_onboarding.activation_7d", "conflicts_with_bank": null, "not_in_bank": false}]),
        );
        let checks = merge(&s, &m, &ctx(|_| {}), &bank());
        assert!(checks.iter().all(|c| c.passed != Some(false)), "{:?}", checks.iter().filter(|c| c.passed == Some(false)).collect::<Vec<_>>());
        assert_eq!(get(&checks, "time_to_point").unwrap().passed, Some(true));
        assert_eq!(get(&checks, "clean_stop").unwrap().passed, Some(true));
        assert_eq!(crate::metrics::fix::top_fix(&checks), None);
    }

    #[test]
    fn a_number_that_conflicts_with_the_story_fails_proof_and_names_the_story_value() {
        let m = metrics(TYPICAL, &bank());
        let s = score(
            json!({"first_answer_sentence": 6, "proof_landed_sentence": 6}),
            &[("proof", verdict("pass", &[6], ""))],
            json!([{"text": "40 percent", "sentence": 6, "metric": "activation", "matches_bank": null, "conflicts_with_bank": "st_onboarding.activation_7d = 44%", "not_in_bank": false}]),
        );
        let checks = merge(&s, &m, &["proof"], &bank());
        let p = get(&checks, "proof").unwrap();
        assert_eq!(p.passed, Some(false));
        assert_eq!(p.evidence, "You said 40 percent, but your story says 44%.");
    }

    #[test]
    fn a_number_not_in_the_bank_does_not_count_and_an_empty_bank_accepts_any_number() {
        let m = compute(Inputs { words: words_of(TYPICAL), stage: "hiring_manager", question_type: "behavioral", bank: vec![numbers::extract("50%").remove(0)], keep_restart: false });
        let s = score(json!({"proof_landed_sentence": 6}), &[("proof", verdict("pass", &[6], ""))], json!([{"text": "44 percent", "sentence": 6, "metric": "x", "matches_bank": null, "conflicts_with_bank": null, "not_in_bank": true}]));
        let checks = merge(&s, &m, &["proof"], &numbers::extract("50%"));
        assert_eq!(get(&checks, "proof").unwrap().passed, Some(false));
        assert!(get(&checks, "proof").unwrap().evidence.contains("not in your stories"));

        let empty = compute(Inputs { words: words_of(TYPICAL), stage: "hiring_manager", question_type: "behavioral", bank: vec![], keep_restart: false });
        let checks = merge(&s, &empty, &["proof"], &[]);
        assert_eq!(get(&checks, "proof").unwrap().passed, Some(true));
    }

    #[test]
    fn na_verdicts_and_inactive_criteria_leave_no_check() {
        let m = metrics(GOOD, &bank());
        let s = score(json!({}), &[("answer_first", verdict("na", &[], "")), ("ownership", verdict("pass", &[], ""))], json!([]));
        let checks = merge(&s, &m, &["answer_first", "conviction"], &bank());
        assert!(get(&checks, "answer_first").is_none() && get(&checks, "time_to_point").is_none());
        assert!(get(&checks, "ownership").is_none(), "not in the active list");
    }

    #[test]
    fn fillers_and_length_come_from_the_rules_not_the_model() {
        let m = metrics(TYPICAL, &bank());
        let s = score(json!({}), &[], json!([]));
        let checks = merge(&s, &m, &[], &bank());
        assert!(get(&checks, "length").is_some() && get(&checks, "fillers").is_some());
    }
    // ---------- c1_consistent (inside an application) ----------

    fn note(stage: &str, earlier: &str, new: &str, sentence: usize) -> ConflictNote {
        ConflictNote { earlier_stage: stage.into(), earlier_value: earlier.into(), new_value: new.into(), sentence }
    }

    #[test]
    fn a_conflict_fails_c1_with_the_sentence_and_both_values_and_names_the_stage() {
        let c = c1_check(&[note("recruiter", "four weeks", "two weeks", 3)], true).unwrap();
        assert_eq!((c.id.as_str(), c.passed, c.sentences.clone()), ("c1_consistent", Some(false), vec![3]));
        assert_eq!(c.evidence, "In the recruiter stage you said \"four weeks\". Here you said \"two weeks\".");
        let h = c1_check(&[note("hiring_manager", "I want to own more", "My manager left", 2)], true).unwrap();
        assert!(h.evidence.starts_with("In the hiring manager stage you said"), "{}", h.evidence);
    }

    #[test]
    fn a_conflict_with_the_resume_says_the_resume() {
        let c = c1_check(&[note("resume", "31% to 44%", "about 50%", 1)], true).unwrap();
        assert_eq!(c.evidence, "Your resume says \"31% to 44%\". Here you said \"about 50%\".");
    }

    #[test]
    fn several_conflicts_share_one_check_with_each_sentence() {
        let c = c1_check(&[note("recruiter", "a", "b", 4), note("resume", "c", "d", 2), note("recruiter", "e", "f", 4)], true).unwrap();
        assert_eq!(c.sentences, vec![2, 4]);
        assert_eq!(c.evidence.matches("Here you said").count(), 3);
    }

    #[test]
    fn nothing_to_compare_with_makes_no_check_and_no_conflict_with_something_to_compare_passes() {
        assert!(c1_check(&[], false).is_none());
        let c = c1_check(&[], true).unwrap();
        assert_eq!(c.passed, Some(true));
        assert!(!c.evidence.is_empty());
    }

    #[test]
    fn c1_replaces_an_earlier_c1_check_and_takes_its_place_in_the_fix_order() {
        let mut checks = vec![
            Check { id: "proof".into(), passed: Some(false), evidence: "".into(), sentences: vec![], seconds: None },
            Check { id: "c1_consistent".into(), passed: Some(true), evidence: "old".into(), sentences: vec![], seconds: None },
        ];
        with_c1(&mut checks, c1_check(&[note("recruiter", "a", "b", 1)], true));
        assert_eq!(checks.iter().filter(|c| c.id == "c1_consistent").count(), 1);
        assert_eq!(crate::metrics::fix::top_fix(&checks), Some("c1_consistent"), "a conflict outranks the proof fix");
        checks.push(Check { id: "answer_first".into(), passed: Some(false), evidence: "".into(), sentences: vec![], seconds: None });
        assert_eq!(crate::metrics::fix::top_fix(&checks), Some("answer_first"), "but not answer first");
        with_c1(&mut checks, None);
        assert_eq!(checks.iter().filter(|c| c.id == "c1_consistent").count(), 0, "no check when there was nothing to compare");
    }
}
