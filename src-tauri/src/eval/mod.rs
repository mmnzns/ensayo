//! The eval harness (M5): how often the scorer agrees with the user's own pass or fail labels, per criterion, and
//! whether it ever passes an answer the user says failed `answer_first`. Pure functions over eval records, so the same
//! report runs from the CLI (`ensayo-eval`), from tests and in CI.

use crate::metrics::Check;
use crate::storage::reps::EvalRecord;
use serde::Serialize;
use std::collections::BTreeMap;

/// The gate before the follow-up drill starts (Build Plan, M5): placeholders until Miguel sets them.
pub const MIN_REPS: usize = 30;
pub const MIN_AGREEMENT: f64 = 0.80;
/// The criterion whose false passes are never acceptable: telling someone they answered first when they did not.
pub const CRITICAL: &str = "answer_first";

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CriterionStat {
    pub id: String,
    /// Labels the scorer judged (a criterion marked not applicable is not counted).
    pub compared: usize,
    pub agree: usize,
    /// The scorer passed it; the user said fail.
    pub false_passes: usize,
    /// The scorer failed it; the user said pass.
    pub false_fails: usize,
    /// Labels the scorer left not applicable.
    pub not_judged: usize,
}

impl CriterionStat {
    pub fn rate(&self) -> Option<f64> {
        (self.compared > 0).then(|| self.agree as f64 / self.compared as f64)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Gate {
    pub passed: bool,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Report {
    /// Reps with at least one label.
    pub reps: usize,
    pub compared: usize,
    pub agree: usize,
    pub per_criterion: Vec<CriterionStat>,
    /// "<session>-<n>" of each rep the scorer passed on answer_first while the user said fail.
    pub critical_false_passes: Vec<String>,
    pub gate: Gate,
}

impl Report {
    pub fn overall(&self) -> Option<f64> {
        (self.compared > 0).then(|| self.agree as f64 / self.compared as f64)
    }

    /// The report as plain text for a terminal or a CI log.
    pub fn text(&self) -> String {
        let pct = |r: Option<f64>| r.map(|r| format!("{:.0}%", r * 100.0)).unwrap_or_else(|| "n/a".into());
        let mut out = format!("Labelled reps: {}   Labels compared: {}   Overall agreement: {}\n\n", self.reps, self.compared, pct(self.overall()));
        out.push_str(&format!("{:<26}{:>9}{:>9}{:>8}{:>13}{:>12}\n", "criterion", "compared", "agree", "rate", "false pass", "false fail"));
        for c in &self.per_criterion {
            out.push_str(&format!("{:<26}{:>9}{:>9}{:>8}{:>13}{:>12}\n", c.id, c.compared, c.agree, pct(c.rate()), c.false_passes, c.false_fails));
        }
        out.push_str(&format!("\nFalse passes on {CRITICAL}: {}", if self.critical_false_passes.is_empty() { "none".to_string() } else { self.critical_false_passes.join(", ") }));
        out.push_str(&format!("\nGate: {}", if self.gate.passed { "PASSED".to_string() } else { format!("NOT MET ({})", self.gate.reasons.join("; ")) }));
        out.push('\n');
        out
    }
}

fn verdict(c: &Check) -> Option<&'static str> {
    c.passed.map(|p| if p { "pass" } else { "fail" })
}

/// Compares each record's labels with the checks `checks_of` gives for it (the stored checks, or ones from a fresh
/// scoring run).
pub fn compare(records: &[EvalRecord], checks_of: impl Fn(&EvalRecord) -> Vec<Check>, min_reps: usize, min_agreement: f64) -> Report {
    let mut stats: BTreeMap<String, CriterionStat> = BTreeMap::new();
    let mut critical = Vec::new();
    let mut reps = 0;
    for rec in records.iter().filter(|r| !r.labels.is_empty()) {
        reps += 1;
        let checks = checks_of(rec);
        for (id, label) in &rec.labels {
            let stat = stats.entry(id.clone()).or_insert_with(|| CriterionStat { id: id.clone(), compared: 0, agree: 0, false_passes: 0, false_fails: 0, not_judged: 0 });
            match checks.iter().find(|c| &c.id == id).and_then(verdict) {
                None => stat.not_judged += 1,
                Some(v) => {
                    stat.compared += 1;
                    if v == label {
                        stat.agree += 1;
                    } else if v == "pass" {
                        stat.false_passes += 1;
                        if id == CRITICAL {
                            critical.push(format!("{}-{}", rec.full.session_id, rec.full.rep.n));
                        }
                    } else {
                        stat.false_fails += 1;
                    }
                }
            }
        }
    }
    let per_criterion: Vec<CriterionStat> = stats.into_values().collect();
    let compared: usize = per_criterion.iter().map(|c| c.compared).sum();
    let agree: usize = per_criterion.iter().map(|c| c.agree).sum();
    let mut reasons = Vec::new();
    if reps < min_reps {
        reasons.push(format!("{reps} labelled reps, {min_reps} needed"));
    }
    match (compared > 0).then(|| agree as f64 / compared as f64) {
        Some(r) if r >= min_agreement => {}
        Some(r) => reasons.push(format!("agreement {:.0}%, {:.0}% needed", r * 100.0, min_agreement * 100.0)),
        None => reasons.push("nothing to compare yet".to_string()),
    }
    if !critical.is_empty() {
        reasons.push(format!("{} false pass(es) on {CRITICAL}", critical.len()));
    }
    Report { reps, compared, agree, per_criterion, critical_false_passes: critical, gate: Gate { passed: reasons.is_empty(), reasons } }
}

/// Thresholds worth trying, from the labels. These are suggestions to read, not settings the app changes.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Suggested {
    pub time_to_point_s: Option<f64>,
    pub tail_s: Option<f64>,
    pub fillers_per_min: Option<f64>,
}

/// For a measure that passes when it is under a limit: the limit that agrees with the labels most often, the one
/// nearest the current placeholder on a tie. None when there are no labelled examples.
fn best_limit(examples: &[(f64, bool)], current: f64) -> Option<f64> {
    if examples.is_empty() {
        return None;
    }
    let mut values: Vec<f64> = examples.iter().map(|e| e.0).collect();
    values.sort_by(|a, b| a.partial_cmp(b).unwrap());
    values.dedup();
    let mut candidates = vec![values[0].max(1.0) - 1.0];
    candidates.extend(values.windows(2).map(|w| (w[0] + w[1]) / 2.0));
    candidates.push(values[values.len() - 1] + 1.0);
    let agree = |limit: f64| examples.iter().filter(|(v, pass)| (*v < limit) == *pass).count();
    let best = candidates.iter().map(|c| agree(*c)).max()?;
    candidates.into_iter().filter(|c| agree(*c) == best).min_by(|a, b| (a - current).abs().partial_cmp(&(b - current).abs()).unwrap())
}

pub fn suggest_thresholds(records: &[EvalRecord]) -> Suggested {
    let mut ttp = Vec::new();
    let mut tail = Vec::new();
    let mut fillers = Vec::new();
    for rec in records {
        let m = &rec.full.metrics;
        let label = |id: &str| rec.labels.get(id).map(|l| l == "pass");
        if let (Some(pass), Some(s)) = (label("time_to_point"), m.checks.iter().find(|c| c.id == "time_to_point").and_then(|c| c.seconds)) {
            ttp.push((s as f64, pass));
        }
        if let (Some(pass), Some(s)) = (label("clean_stop"), m.checks.iter().find(|c| c.id == "clean_stop").and_then(|c| c.seconds)) {
            tail.push((s as f64, pass));
        }
        if let Some(pass) = label("fillers") {
            fillers.push((m.fillers.per_minute, pass));
        }
    }
    Suggested {
        time_to_point_s: best_limit(&ttp, 10.0),
        tail_s: best_limit(&tail, crate::metrics::timing::TAIL_PASS_SECONDS as f64),
        fillers_per_min: best_limit(&fillers, crate::metrics::timing::FILLERS_PASS_PER_MINUTE),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::metrics::{compute, Inputs};
    use crate::speech::words::Word;
    use crate::storage::reps::{FullRep, Rep};

    fn check(id: &str, passed: Option<bool>, seconds: Option<u64>) -> Check {
        Check { id: id.into(), passed, evidence: String::new(), sentences: vec![], seconds }
    }

    fn record(n: u32, checks: Vec<Check>, labels: &[(&str, &str)]) -> EvalRecord {
        let words: Vec<Word> = (0..12).map(|i| Word { text: if i == 11 { "it." } else { "word" }.into(), start_ms: i * 500, end_ms: i * 500 + 400 }).collect();
        let mut metrics = compute(Inputs { words: words.clone(), stage: "recruiter", question_type: "behavioral", bank: vec![], keep_restart: false });
        metrics.checks = checks;
        EvalRecord {
            full: FullRep {
                session_id: "ses_a".into(),
                rep: Rep {
                    n,
                    question_id: "q".into(),
                    question_text: "Q".into(),
                    question_type: "behavioral".into(),
                    behavioral_situation: None,
                    commitment_check: false,
                    builder_operator_check: false,
                    is_major_story: true,
                    founder_variant: false,
                    attempt: 1,
                    recorded_at: "t".into(),
                    story_ids: vec![],
                    fix: None,
                    note: None,
                    rewrite: None,
                    ai: None,
                    follow_up: None,
                    feedback: None,
                },
                transcript: words,
                metrics,
            },
            labels: labels.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect(),
            labelled_at: Some("t".into()),
        }
    }

    fn stored(r: &EvalRecord) -> Vec<Check> {
        r.full.metrics.checks.clone()
    }

    #[test]
    fn agreement_is_counted_per_criterion_and_overall() {
        let recs = vec![
            record(1, vec![check("answer_first", Some(false), None), check("proof", Some(true), None)], &[("answer_first", "fail"), ("proof", "pass")]),
            record(2, vec![check("answer_first", Some(true), None), check("proof", Some(false), None)], &[("answer_first", "pass"), ("proof", "pass")]),
        ];
        let r = compare(&recs, stored, 2, 0.8);
        let af = r.per_criterion.iter().find(|c| c.id == "answer_first").unwrap();
        assert_eq!((af.compared, af.agree, af.false_passes), (2, 2, 0));
        let proof = r.per_criterion.iter().find(|c| c.id == "proof").unwrap();
        assert_eq!((proof.compared, proof.agree, proof.false_fails), (2, 1, 1));
        assert_eq!((r.reps, r.compared, r.agree), (2, 4, 3));
        assert_eq!(r.overall(), Some(0.75));
    }

    #[test]
    fn a_false_pass_on_answer_first_is_listed_and_fails_the_gate_whatever_the_rest() {
        let recs: Vec<EvalRecord> = (1..=30).map(|n| record(n, vec![check("answer_first", Some(true), None), check("proof", Some(true), None)], &[("answer_first", if n == 7 { "fail" } else { "pass" }), ("proof", "pass")])).collect();
        let r = compare(&recs, stored, MIN_REPS, MIN_AGREEMENT);
        assert!(r.overall().unwrap() > 0.95);
        assert_eq!(r.critical_false_passes, vec!["ses_a-7"]);
        assert!(!r.gate.passed);
        assert!(r.gate.reasons.iter().any(|x| x.contains("false pass")));
    }

    #[test]
    fn the_gate_needs_thirty_reps_and_eighty_percent() {
        let few: Vec<EvalRecord> = (1..=5).map(|n| record(n, vec![check("proof", Some(true), None)], &[("proof", "pass")])).collect();
        let r = compare(&few, stored, MIN_REPS, MIN_AGREEMENT);
        assert!(!r.gate.passed && r.gate.reasons[0].contains("5 labelled reps, 30 needed"));
        let enough: Vec<EvalRecord> = (1..=30).map(|n| record(n, vec![check("proof", Some(true), None)], &[("proof", "pass")])).collect();
        assert!(compare(&enough, stored, MIN_REPS, MIN_AGREEMENT).gate.passed);
        let poor: Vec<EvalRecord> = (1..=30).map(|n| record(n, vec![check("proof", Some(n % 2 == 0), None)], &[("proof", "pass")])).collect();
        let r = compare(&poor, stored, MIN_REPS, MIN_AGREEMENT);
        assert!(!r.gate.passed && r.gate.reasons.iter().any(|x| x.contains("agreement 50%")));
    }

    #[test]
    fn reps_with_no_labels_and_criteria_the_scorer_left_out_are_not_counted() {
        let recs = vec![record(1, vec![check("proof", None, None)], &[("proof", "pass")]), record(2, vec![check("proof", Some(true), None)], &[])];
        let r = compare(&recs, stored, 1, 0.8);
        assert_eq!(r.reps, 1);
        assert_eq!(r.compared, 0);
        assert_eq!(r.per_criterion[0].not_judged, 1);
        assert!(r.gate.reasons.iter().any(|x| x.contains("nothing to compare")));
    }

    #[test]
    fn the_text_report_names_every_criterion_and_the_gate() {
        let recs = vec![record(1, vec![check("answer_first", Some(false), None)], &[("answer_first", "fail")])];
        let t = compare(&recs, stored, 1, 0.8).text();
        assert!(t.contains("answer_first") && t.contains("100%") && t.contains("False passes on answer_first: none") && t.contains("Gate: PASSED"), "{t}");
    }

    #[test]
    fn thresholds_are_suggested_from_the_labelled_measurements() {
        // Users called 4, 6 and 8 seconds "fast" and 14 and 20 "slow": any limit between 8 and 14 agrees every time; the one nearest the
        // current 10 s wins.
        let recs: Vec<EvalRecord> = [(4u64, "pass"), (6, "pass"), (8, "pass"), (14, "fail"), (20, "fail")]
            .iter()
            .enumerate()
            .map(|(i, (s, l))| record(i as u32 + 1, vec![check("time_to_point", Some(*s < 10), Some(*s))], &[("time_to_point", l)]))
            .collect();
        let s = suggest_thresholds(&recs);
        assert_eq!(s.time_to_point_s, Some(11.0));
        assert_eq!(s.tail_s, None);
        assert_eq!(s.fillers_per_min, None);
    }

    #[test]
    fn a_limit_is_picked_even_when_the_labels_disagree_with_each_other() {
        let ex = [(2.0, true), (3.0, false), (4.0, true), (9.0, false)];
        let limit = best_limit(&ex, 10.0).unwrap();
        let agree = ex.iter().filter(|(v, p)| (*v < limit) == *p).count();
        assert_eq!(agree, 3);
    }

    /// The example answers as a tiny eval set: scored by the pipeline (with canned model replies) and labelled the way
    /// `prompts/examples/expected/*.score.json` says. This is the report CI runs; the real gate runs on your own reps.
    #[test]
    fn the_example_answers_agree_with_their_labels_and_pass_a_small_gate() {
        use crate::ai::providers::Provider;
        use crate::metrics::numbers;
        use crate::scoring::fixtures::{question, score_reply, story, words_of, GOOD, TYPICAL};
        use crate::scoring::pipeline::{score_answer, ScoreInput};
        use crate::scoring::run::{testing::Scripted, Budget};
        use serde_json::json;

        let bank = numbers::extract("31% 44%");
        let stories = vec![story()];
        let q = question();
        let coach = r#"{"note":"Say it first.","rewrite":null,"offer_follow_up":true}"#;
        let numbers_said = |s: usize| json!([{"text": "44 percent", "sentence": s, "metric": "activation", "matches_bank": "st_onboarding.activation_7d", "conflicts_with_bank": null, "not_in_bank": false}]);
        let typical = score_reply(6, 6, &[], &[("answer_first", "fail"), ("proof", "pass"), ("story_fit", "pass"), ("ownership", "fail"), ("no_complaining", "pass"), ("method_first", "fail"), ("stage_fit", "pass")], numbers_said(6));
        let good = score_reply(1, 7, &[8], &[("answer_first", "pass"), ("proof", "pass"), ("story_fit", "pass"), ("context_short", "pass"), ("ownership", "pass"), ("conviction", "pass"), ("no_complaining", "pass"), ("method_first", "pass"), ("approach_before_action", "pass"), ("stage_fit", "pass")], numbers_said(7));

        let mut records = Vec::new();
        for (n, (fixture, reply, labels)) in [
            (TYPICAL, typical, vec![("answer_first", "fail"), ("proof", "pass"), ("ownership", "fail"), ("no_complaining", "pass"), ("method_first", "fail"), ("time_to_point", "fail")]),
            (GOOD, good, vec![("answer_first", "pass"), ("proof", "pass"), ("ownership", "pass"), ("no_complaining", "pass"), ("method_first", "pass"), ("time_to_point", "pass"), ("clean_stop", "pass")]),
        ]
        .into_iter()
        .enumerate()
        {
            let metrics = compute(Inputs { words: words_of(fixture), stage: "hiring_manager", question_type: "behavioral", bank: bank.clone(), keep_restart: false });
            let llm = Scripted::new(vec![Ok(&reply), Ok(coach)]);
            let input = ScoreInput { question: &q, stage: "hiring_manager", founder_variant: false, seniority: "senior", identity_statement: "", target_id: None, jd_summary: "", stories: &stories, method: "", metrics: &metrics, bank: &bank };
            let scored = score_answer(&llm, &input, &mut Budget::new(Provider::Claude, 0.0)).unwrap();
            let mut rec = record(n as u32 + 1, scored.checks, &labels);
            rec.full.transcript = words_of(fixture);
            records.push(rec);
        }
        let report = compare(&records, stored, 2, MIN_AGREEMENT);
        println!("{}", report.text());
        assert_eq!(report.overall(), Some(1.0));
        assert!(report.critical_false_passes.is_empty());
        assert!(report.gate.passed, "{:?}", report.gate.reasons);
    }
}
