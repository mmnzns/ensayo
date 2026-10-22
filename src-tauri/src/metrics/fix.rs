//! Which failed check is the one fix, and what changed since the last attempt. Order from `prompts/README.md`.

use super::{Check, Metrics};
use serde::{Deserialize, Serialize};

/// Highest priority first. Checks that need a model arrive in M4; the order is the one in `prompts/README.md`.
pub const ORDER: [&str; 17] = [
    "answer_first",
    "no_complaining",
    "c1_consistent",
    "f1_answer_push",
    "proof",
    "type_fit",
    "f3_consistent",
    "method_first",
    "approach_before_action",
    "context_short",
    "clean_stop",
    "time_to_point",
    "length",
    "conviction",
    "ownership",
    "fillers",
    "other",
];

/// The founder variant (leadership stage at a startup) puts these first, in this order, then the rest as above.
pub const FOUNDER_FIRST: [&str; 3] = ["no_complaining", "commitment", "builder_operator"];

/// The failed check that comes first in `ORDER`. None when nothing failed.
pub fn top_fix(checks: &[Check]) -> Option<&str> {
    top_fix_for(checks, false)
}

pub fn top_fix_for(checks: &[Check], founder: bool) -> Option<&str> {
    let rank = |id: &str| {
        if founder {
            if let Some(i) = FOUNDER_FIRST.iter().position(|o| *o == id) {
                return i;
            }
            return FOUNDER_FIRST.len() + ORDER.iter().position(|o| *o == id).unwrap_or(ORDER.len());
        }
        ORDER.iter().position(|o| *o == id).unwrap_or(ORDER.len())
    };
    checks.iter().filter(|c| c.passed == Some(false)).min_by_key(|c| rank(&c.id)).map(|c| c.id.as_str())
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Delta {
    /// The check this is about.
    pub check: String,
    /// Plain words: "Ran long", "Said the number this time".
    pub label: String,
    pub from_seconds: Option<u64>,
    pub to_seconds: Option<u64>,
    pub from_count: Option<usize>,
    pub to_count: Option<usize>,
    pub improved: bool,
}

/// What a fixed criterion is called on the result screen, in plain words.
pub fn fixed_label(id: &str) -> &'static str {
    match id {
        "answer_first" => "Answered up front",
        "ownership" => "Said what you decided",
        "method_first" => "Opened with how you work",
        "context_short" => "Kept the setup short",
        "conviction" => "Spoke with conviction",
        "no_complaining" => "No knocks on past teams",
        "approach_before_action" => "Said what you decided before what you built",
        "story_fit" => "Picked a story that fits",
        "type_fit" => "Fit the question",
        "stage_fit" => "Fit the stage",
        "jd_fit" => "Used the posting's words",
        "commitment" => "Led with full-time",
        "builder_operator" => "Answered builder or operator",
        _ => "Fixed",
    }
}

fn status(m: &Metrics, id: &str) -> Option<bool> {
    m.checks.iter().find(|c| c.id == id).and_then(|c| c.passed)
}

/// The change on the fix that was named after the previous attempt. None when the previous attempt had no such
/// failure to compare.
pub fn delta(prev: &Metrics, cur: &Metrics, check: &str) -> Option<Delta> {
    let improved = status(cur, check) == Some(true) || {
        match check {
            "length" => cur.speaking_ms < prev.speaking_ms,
            "fillers" => cur.fillers.count < prev.fillers.count,
            "clean_stop" => cur.proof.tail_ms.unwrap_or(0) < prev.proof.tail_ms.unwrap_or(0),
            _ => false,
        }
    };
    let blank = Delta { check: check.to_string(), label: String::new(), from_seconds: None, to_seconds: None, from_count: None, to_count: None, improved };
    match check {
        "length" => Some(Delta { label: "Length of the answer".into(), from_seconds: Some(prev.speaking_ms / 1000), to_seconds: Some(cur.speaking_ms / 1000), ..blank }),
        "clean_stop" => Some(Delta {
            label: "Time after the number".into(),
            from_seconds: prev.proof.tail_ms.map(|t| t / 1000),
            to_seconds: cur.proof.tail_ms.map(|t| t / 1000),
            ..blank
        }),
        "fillers" => Some(Delta { label: "Filler words".into(), from_count: Some(prev.fillers.count), to_count: Some(cur.fillers.count), ..blank }),
        "proof" => Some(Delta { label: if improved { "Said the number this time".into() } else { "Still no number".into() }, ..blank }),
        "time_to_point" => {
            let seconds = |m: &Metrics| m.checks.iter().find(|c| c.id == "time_to_point").and_then(|c| c.seconds);
            match (seconds(prev), seconds(cur)) {
                (Some(from), Some(to)) => Some(Delta { label: "Point landed".into(), from_seconds: Some(from), to_seconds: Some(to), improved: to < from, ..blank }),
                _ => None,
            }
        }
        other if status(cur, other) == Some(true) => Some(Delta { label: fixed_label(other).into(), improved: true, ..blank }),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn check(id: &str, passed: Option<bool>) -> Check {
        Check { id: id.into(), passed, evidence: String::new(), sentences: vec![], seconds: None }
    }

    #[test]
    fn the_failed_check_that_comes_first_in_the_order_is_the_fix() {
        let checks = vec![check("fillers", Some(false)), check("length", Some(false)), check("proof", Some(true)), check("clean_stop", Some(false))];
        assert_eq!(top_fix(&checks), Some("clean_stop"));
        let checks = vec![check("fillers", Some(false)), check("proof", Some(false))];
        assert_eq!(top_fix(&checks), Some("proof"));
    }

    #[test]
    fn a_fixed_judgment_check_and_the_point_time_are_reported() {
        use crate::metrics::{compute, Inputs};
        use crate::speech::words::Word;
        let words: Vec<Word> = (0..12).map(|i| Word { text: if i == 11 { "it." } else { "word" }.into(), start_ms: i * 500, end_ms: i * 500 + 400 }).collect();
        let base = compute(Inputs { words, stage: "recruiter", question_type: "behavioral", bank: vec![], keep_restart: false });
        let with = |checks: Vec<Check>| Metrics { checks, ..base.clone() };
        let c = |id: &str, passed: bool, seconds: Option<u64>| Check { id: id.into(), passed: Some(passed), evidence: String::new(), sentences: vec![], seconds };
        let prev = with(vec![c("time_to_point", false, Some(41)), c("ownership", false, None)]);
        let cur = with(vec![c("time_to_point", true, Some(6)), c("ownership", true, None)]);
        let d = delta(&prev, &cur, "time_to_point").unwrap();
        assert_eq!((d.from_seconds, d.to_seconds, d.improved), (Some(41), Some(6), true));
        assert_eq!(delta(&prev, &cur, "ownership").unwrap().label, "Said what you decided");
        assert!(delta(&cur, &prev, "ownership").is_none(), "no 'fixed' when it did not pass");
    }

    #[test]
    fn the_founder_variant_puts_complaining_commitment_and_builder_first() {
        let checks = vec![check("answer_first", Some(false)), check("builder_operator", Some(false)), check("commitment", Some(false))];
        assert_eq!(top_fix_for(&checks, true), Some("commitment"));
        assert_eq!(top_fix_for(&checks, false), Some("answer_first"));
        let checks = vec![check("answer_first", Some(false)), check("no_complaining", Some(false))];
        assert_eq!(top_fix_for(&checks, true), Some("no_complaining"));
        assert_eq!(top_fix_for(&checks, false), Some("answer_first"), "in the normal order answer first outranks it");
        let checks = vec![check("fillers", Some(false)), check("proof", Some(false)), check("builder_operator", Some(true))];
        assert_eq!(top_fix_for(&checks, true), Some("proof"), "after the founder checks, the usual order");
    }

    #[test]
    fn not_applicable_and_passing_checks_are_never_the_fix() {
        let checks = vec![check("clean_stop", None), check("length", Some(true))];
        assert_eq!(top_fix(&checks), None);
        assert_eq!(top_fix(&[]), None);
    }
}
