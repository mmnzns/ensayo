//! Rules metrics: everything about a rep that code can measure without a model. Pure functions over the word list.

pub mod clean;
pub mod fillers;
pub mod fix;
pub mod numbers;
pub mod sentences;
pub mod timing;

use crate::speech::words::Word;
use numbers::Number;
use sentences::Sentence;
use serde::{Deserialize, Serialize};
use timing::{Length, Pause, Proof, Window};

/// Bumped when a criterion changes; stored with every score so trends can mark the change.
pub const RUBRIC_VERSION: u32 = 1;

pub struct Inputs<'a> {
    pub words: Vec<Word>,
    pub stage: &'a str,
    pub question_type: &'a str,
    /// The proof numbers of the stories that fit the question. Empty when the bank has none.
    pub bank: Vec<Number>,
    /// The user was offered a restart and kept the rep: measure from after the restart sentence.
    pub keep_restart: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    Scored,
    /// Under three seconds of speech: not scored, the question is asked again.
    DidntCatch,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Check {
    pub id: String,
    /// None when the check does not apply to this answer.
    pub passed: Option<bool>,
    /// Plain words saying what was measured.
    pub evidence: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FillerInfo {
    pub count: usize,
    pub per_minute: f64,
    pub items: Vec<fillers::Filler>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Metrics {
    pub rubric_version: u32,
    pub outcome: Outcome,
    pub words: Vec<Word>,
    pub sentences: Vec<Sentence>,
    pub word_count: usize,
    pub speaking_ms: u64,
    pub wpm: f64,
    pub window: Window,
    pub length: Length,
    pub fillers: FillerInfo,
    pub pauses: Vec<Pause>,
    pub proof: Proof,
    /// Numbers said that are not in any matched story: shown as "not in your bank, check it".
    pub unbanked: Vec<Number>,
    /// A restart phrase was heard at this sentence of the original transcript.
    pub restart_at: Option<usize>,
    pub checks: Vec<Check>,
}

pub fn minutes_seconds(ms: u64) -> String {
    let s = ms / 1000;
    format!("{}:{:02}", s / 60, s % 60)
}

fn raws(numbers: &[Number]) -> String {
    numbers.iter().map(|n| n.raw.clone()).collect::<Vec<_>>().join(", ")
}

pub fn compute(input: Inputs) -> Metrics {
    let first = sentences::split(&input.words);
    let restart_at = clean::restart_at(&first);
    let mut words = clean::strip_hallucinations(input.words.clone(), &first);
    let mut sentences = sentences::split(&words);
    if input.keep_restart {
        if let Some(at) = clean::restart_at(&sentences) {
            words = clean::after_restart(&words, &sentences, at);
            sentences = sentences::split(&words);
        }
    }
    let window = timing::window(input.stage, input.question_type);
    let speaking_ms = timing::speaking_ms(&words);
    let outcome = if clean::heard_enough(&words) { Outcome::Scored } else { Outcome::DidntCatch };
    let items = fillers::find(&words);
    let filler_rate = fillers::per_minute(items.len(), speaking_ms);
    let proof = timing::proof(&sentences, &input.bank);
    let length = timing::length(speaking_ms, window);
    let unbanked: Vec<Number> = if input.bank.is_empty() {
        Vec::new()
    } else {
        sentences.iter().flat_map(|s| numbers::extract(&s.text)).filter(|n| !input.bank.iter().any(|b| numbers::same(b.value, n.value))).collect()
    };

    let mut checks = Vec::new();
    if outcome == Outcome::Scored {
        let proof_evidence = if !proof.matched.is_empty() {
            format!("You said {}.", raws(&proof.matched))
        } else if !unbanked.is_empty() {
            format!("You said {}, which is not in your stories. Check it.", raws(&unbanked))
        } else {
            "No number or result from your stories came up.".to_string()
        };
        checks.push(Check { id: "proof".into(), passed: Some(!proof.matched.is_empty()), evidence: proof_evidence });
        checks.push(Check {
            id: "clean_stop".into(),
            passed: proof.tail_ms.map(|t| t < timing::TAIL_PASS_SECONDS * 1000),
            evidence: match proof.tail_ms {
                Some(t) => format!("You kept going for {} seconds after the number.", t / 1000),
                None => "No number to measure from.".into(),
            },
        });
        checks.push(Check {
            id: "length".into(),
            passed: Some(length != Length::Long),
            evidence: format!("{} against a window of {} to {} seconds.", minutes_seconds(speaking_ms), window.min_s, window.max_s),
        });
        checks.push(Check {
            id: "fillers".into(),
            passed: Some(filler_rate < timing::FILLERS_PASS_PER_MINUTE),
            evidence: format!("{} filler words, {:.1} a minute.", items.len(), filler_rate),
        });
    }

    Metrics {
        rubric_version: RUBRIC_VERSION,
        outcome,
        word_count: words.len(),
        wpm: timing::words_per_minute(&words),
        pauses: timing::pauses(&words),
        fillers: FillerInfo { count: items.len(), per_minute: filler_rate, items },
        words,
        sentences,
        speaking_ms,
        window,
        length,
        proof,
        unbanked,
        restart_at,
        checks,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A long answer: a number in the first sentence, then ninety slow words with three "um" and a full stop every 30.
    fn long_answer() -> Vec<Word> {
        let mut v = Vec::new();
        let mut t = 0u64;
        let mut push = |text: &str, len: u64, v: &mut Vec<Word>| {
            v.push(Word { text: text.into(), start_ms: t, end_ms: t + len });
            t += len + 100;
        };
        for w in "We cut churn from 24% to 18%.".split(' ') {
            push(w, 400, &mut v);
        }
        for i in 0..90 {
            push(if i % 30 == 5 { "um," } else if i % 30 == 29 { "done." } else { "filler" }, 600, &mut v);
        }
        v
    }

    fn inputs(words: Vec<Word>, bank: &str) -> Inputs<'static> {
        Inputs { words, stage: "recruiter", question_type: "behavioral", bank: numbers::extract(bank), keep_restart: false }
    }

    #[test]
    fn a_long_rambling_answer_fails_the_stop_and_the_length() {
        let m = compute(inputs(long_answer(), "24% 18%"));
        assert_eq!(m.outcome, Outcome::Scored);
        let get = |id: &str| m.checks.iter().find(|c| c.id == id).unwrap().passed;
        assert_eq!(get("proof"), Some(true));
        assert_eq!(get("clean_stop"), Some(false));
        assert_eq!(get("length"), Some(false));
        assert_eq!(fix::top_fix(&m.checks), Some("clean_stop"));
        assert_eq!(m.fillers.count, 3);
        assert!(m.wpm > 70.0 && m.wpm < 100.0);
    }

    #[test]
    fn under_three_seconds_of_speech_is_not_scored() {
        let w = vec![Word { text: "hello".into(), start_ms: 0, end_ms: 500 }];
        let m = compute(inputs(w, ""));
        assert_eq!(m.outcome, Outcome::DidntCatch);
        assert!(m.checks.is_empty());
    }

    #[test]
    fn a_number_that_is_not_in_the_bank_is_flagged_not_passed() {
        let m = compute(inputs(long_answer(), "40%"));
        let proof = m.checks.iter().find(|c| c.id == "proof").unwrap();
        assert_eq!(proof.passed, Some(false));
        assert!(proof.evidence.contains("not in your stories"));
        assert_eq!(m.unbanked.len(), 2);
    }

    #[test]
    fn no_number_at_all_fails_proof_and_leaves_the_stop_not_applicable() {
        let w: Vec<Word> = (0..12).map(|i| Word { text: if i == 11 { "it." } else { "word" }.into(), start_ms: i * 500, end_ms: i * 500 + 400 }).collect();
        let m = compute(inputs(w, "24%"));
        let get = |id: &str| m.checks.iter().find(|c| c.id == id).unwrap().passed;
        assert_eq!(get("proof"), Some(false));
        assert_eq!(get("clean_stop"), None);
    }

    #[test]
    fn a_kept_restart_measures_from_after_it() {
        let mut v: Vec<Word> = Vec::new();
        let mut t = 0;
        for w in "So the thing was... sorry, let me start again.".split(' ') {
            v.push(Word { text: w.into(), start_ms: t, end_ms: t + 400 });
            t += 500;
        }
        for i in 0..14 {
            v.push(Word { text: if i == 13 { "churn." } else { "we" }.into(), start_ms: t, end_ms: t + 400 });
            t += 500;
        }
        let mut input = inputs(v, "");
        input.keep_restart = true;
        let m = compute(input);
        assert!(m.restart_at.is_some());
        assert_eq!(m.word_count, 14);
    }

    #[test]
    fn deltas_say_what_changed_on_the_fix() {
        let before = compute(inputs(long_answer(), "24% 18%"));
        let short: Vec<Word> = long_answer()
            .into_iter()
            .take(40)
            .enumerate()
            .map(|(i, mut w)| {
                if i == 39 {
                    w.text = "done.".into();
                }
                w
            })
            .collect();
        let after = compute(inputs(short, "24% 18%"));
        let d = fix::delta(&before, &after, "length").unwrap();
        assert!(d.improved);
        assert!(d.to_seconds.unwrap() < d.from_seconds.unwrap());
        assert!(fix::delta(&before, &after, "conviction").is_none());
    }
}
