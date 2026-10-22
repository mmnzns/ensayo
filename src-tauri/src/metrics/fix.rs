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

/// The failed check that comes first in `ORDER`. None when nothing failed.
pub fn top_fix(checks: &[Check]) -> Option<&str> {
    let rank = |id: &str| ORDER.iter().position(|o| *o == id).unwrap_or(ORDER.len());
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
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn check(id: &str, passed: Option<bool>) -> Check {
        Check { id: id.into(), passed, evidence: String::new() }
    }

    #[test]
    fn the_failed_check_that_comes_first_in_the_order_is_the_fix() {
        let checks = vec![check("fillers", Some(false)), check("length", Some(false)), check("proof", Some(true)), check("clean_stop", Some(false))];
        assert_eq!(top_fix(&checks), Some("clean_stop"));
        let checks = vec![check("fillers", Some(false)), check("proof", Some(false))];
        assert_eq!(top_fix(&checks), Some("proof"));
    }

    #[test]
    fn not_applicable_and_passing_checks_are_never_the_fix() {
        let checks = vec![check("clean_stop", None), check("length", Some(true))];
        assert_eq!(top_fix(&checks), None);
        assert_eq!(top_fix(&[]), None);
    }
}
