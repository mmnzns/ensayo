//! Pace, silent pauses, the length window for a stage and question type, and the tail after the proof landed.

use super::numbers::{self, Number};
use super::sentences::Sentence;
use crate::speech::words::Word;
use serde::{Deserialize, Serialize};

/// Pass under this many seconds of tail after the proof landed (placeholder, set in M5).
pub const TAIL_PASS_SECONDS: u64 = 15;
/// Pass under this many filled pauses a minute (placeholder, set in M5).
pub const FILLERS_PASS_PER_MINUTE: f64 = 4.0;
/// A gap this long between words is reported as a pause. Never scored.
pub const PAUSE_MS: u64 = 1_000;

/// Time from the first word to the last, in milliseconds. This is the answer's length: the thinking time before it
/// is not counted.
pub fn speaking_ms(words: &[Word]) -> u64 {
    match (words.first(), words.last()) {
        (Some(f), Some(l)) => l.end_ms.saturating_sub(f.start_ms),
        _ => 0,
    }
}

pub fn words_per_minute(words: &[Word]) -> f64 {
    let ms = speaking_ms(words);
    if ms == 0 {
        return 0.0;
    }
    words.len() as f64 / (ms as f64 / 60_000.0)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Pause {
    pub at_ms: u64,
    pub length_ms: u64,
    /// Position of the word before the pause.
    pub after_word: usize,
}

pub fn pauses(words: &[Word]) -> Vec<Pause> {
    words
        .windows(2)
        .enumerate()
        .filter_map(|(i, w)| {
            let gap = w[1].start_ms.saturating_sub(w[0].end_ms);
            (gap >= PAUSE_MS).then_some(Pause { at_ms: w[0].end_ms, length_ms: gap, after_word: i })
        })
        .collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Window {
    pub min_s: u64,
    pub max_s: u64,
}

/// The window for one answer, in seconds. A factual question has its own short window whatever the stage; a
/// technical question (or stage) may run longer. Placeholders per the Build Plan, set from labelled reps in M5.
pub fn window(stage: &str, question_type: &str) -> Window {
    match question_type {
        "factual" => return Window { min_s: 3, max_s: 20 },
        "technical" => return Window { min_s: 30, max_s: 180 },
        _ => {}
    }
    match stage {
        "recruiter" => Window { min_s: 45, max_s: 60 },
        "leadership" => Window { min_s: 30, max_s: 60 },
        "technical" => Window { min_s: 30, max_s: 180 },
        // hiring_manager, panel and anything unknown
        _ => Window { min_s: 60, max_s: 90 },
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Length {
    Short,
    Fits,
    Long,
}

/// Only running over fails. A short answer is reported, because rambling is the habit this app is for.
pub fn length(duration_ms: u64, w: Window) -> Length {
    let s = duration_ms / 1000;
    if s > w.max_s {
        Length::Long
    } else if s < w.min_s {
        Length::Short
    } else {
        Length::Fits
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Proof {
    /// Numbers said that match a story's number (or, with no story, every number said).
    pub matched: Vec<Number>,
    /// 1-based sentence holding the last matched number, if any.
    pub landed_sentence: Option<usize>,
    /// Time after the end of that sentence to the end of the answer.
    pub tail_ms: Option<u64>,
}

/// Rules first: which numbers were said, whether any is in the bank, and how long the answer ran on after the last
/// one. The AI covers paraphrase ("about a quarter") in M4. With no bank numbers, any number counts.
pub fn proof(sentences: &[Sentence], bank: &[Number]) -> Proof {
    let mut matched = Vec::new();
    let mut landed: Option<&Sentence> = None;
    for s in sentences {
        let found: Vec<Number> = numbers::extract(&s.text).into_iter().filter(|n| bank.is_empty() || bank.iter().any(|b| numbers::same(b.value, n.value))).collect();
        if !found.is_empty() {
            landed = Some(s);
            matched.extend(found);
        }
    }
    let end = sentences.last().map(|s| s.end_ms);
    Proof { matched, landed_sentence: landed.map(|s| s.index), tail_ms: landed.zip(end).map(|(s, e)| e.saturating_sub(s.end_ms)) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::metrics::sentences::{split, words};

    #[test]
    fn pace_is_words_over_speaking_time_and_ignores_the_lead_in() {
        // 10 words between 5 s and 11 s: 6 s of speaking, 100 a minute.
        let w: Vec<Word> = (0..10).map(|i| Word { text: "w".into(), start_ms: 5_000 + i * 600, end_ms: 5_000 + i * 600 + 500 + if i == 9 { 100 } else { 0 } }).collect();
        assert_eq!(speaking_ms(&w), 6_000);
        assert!((words_per_minute(&w) - 100.0).abs() < 1e-9);
        assert_eq!(words_per_minute(&[]), 0.0);
    }

    #[test]
    fn pauses_are_reported_from_one_second_and_not_before() {
        let w = words(&[("a", 0, 300), ("b", 1_200, 1_500), ("c", 3_000, 3_300)]);
        let p = pauses(&w);
        assert_eq!(p.len(), 1);
        assert_eq!((p[0].at_ms, p[0].length_ms, p[0].after_word), (1_500, 1_500, 1));
    }

    #[test]
    fn windows_follow_the_stage_and_the_question_type() {
        assert_eq!(window("recruiter", "behavioral"), Window { min_s: 45, max_s: 60 });
        assert_eq!(window("hiring_manager", "behavioral").max_s, 90);
        assert_eq!(window("leadership", "behavioral"), Window { min_s: 30, max_s: 60 });
        assert_eq!(window("panel", "behavioral").max_s, 90);
        assert_eq!(window("technical", "behavioral").max_s, 180);
        assert_eq!(window("recruiter", "factual").max_s, 20);
        assert_eq!(window("leadership", "technical").max_s, 180);
        assert_eq!(window("who knows", "behavioral").max_s, 90);
    }

    #[test]
    fn only_running_over_is_long() {
        let w = window("hiring_manager", "behavioral");
        assert_eq!(length(75_000, w), Length::Fits);
        assert_eq!(length(90_900, w), Length::Fits);
        assert_eq!(length(91_000, w), Length::Long);
        assert_eq!(length(20_000, w), Length::Short);
    }

    fn answer() -> Vec<Sentence> {
        split(&words(&[
            ("We", 0, 300), ("cut", 300, 600), ("churn", 600, 900), ("from", 900, 1_100), ("24%", 1_100, 1_500), ("to", 1_500, 1_600), ("18%.", 1_600, 2_000),
            ("It", 2_500, 2_600), ("took", 2_600, 2_900), ("a", 2_900, 3_000), ("while.", 3_000, 20_000),
        ]))
    }

    #[test]
    fn tail_runs_from_the_last_matching_number_to_the_end_of_the_answer() {
        let bank = numbers::extract("24% to 18%");
        let p = proof(&answer(), &bank);
        assert_eq!(p.matched.len(), 2);
        assert_eq!(p.landed_sentence, Some(1));
        assert_eq!(p.tail_ms, Some(18_000));
    }

    #[test]
    fn a_number_not_in_the_bank_is_not_proof() {
        let bank = numbers::extract("40%");
        let p = proof(&answer(), &bank);
        assert!(p.matched.is_empty());
        assert_eq!(p.landed_sentence, None);
        assert_eq!(p.tail_ms, None);
    }

    #[test]
    fn with_an_empty_bank_any_number_counts() {
        let p = proof(&answer(), &[]);
        assert_eq!(p.matched.len(), 2);
        assert_eq!(p.landed_sentence, Some(1));
    }
}
