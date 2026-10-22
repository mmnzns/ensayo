//! Filled pauses. Silent pauses are never counted here (a clean pause to find a word reads as deliberate).
//! The list is one constant so M5 can tune it against labelled reps.

use crate::speech::words::Word;
use serde::{Deserialize, Serialize};

/// Single-word fillers, always counted.
const SINGLE: [&str; 6] = ["um", "uh", "er", "erm", "hmm", "basically"];
/// Phrases, counted once each.
const PHRASES: [&[&str]; 3] = [&["you", "know"], &["i", "mean"], &["how", "do", "i", "say"]];
/// "like" is a filler unless it is the verb or a comparison. These before or after it mean it is not.
const LIKE_BEFORE: [&str; 14] = ["would", "feel", "feels", "felt", "look", "looks", "sound", "sounds", "something", "much", "more", "anything", "just", "i"];
const LIKE_NEXT: [&str; 3] = ["to", "it", "that"];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Filler {
    pub text: String,
    pub start_ms: u64,
    /// Position of the first word in the transcript.
    pub word: usize,
}

fn norm(w: &Word) -> String {
    w.text.trim_matches(|c: char| !c.is_alphanumeric() && c != '\'').to_lowercase()
}

pub fn find(words: &[Word]) -> Vec<Filler> {
    let n: Vec<String> = words.iter().map(norm).collect();
    let mut out = Vec::new();
    let mut i = 0;
    'outer: while i < n.len() {
        for p in PHRASES {
            if i + p.len() <= n.len() && (0..p.len()).all(|k| n[i + k] == p[k]) {
                out.push(Filler { text: p.join(" "), start_ms: words[i].start_ms, word: i });
                i += p.len();
                continue 'outer;
            }
        }
        let w = n[i].as_str();
        let like = w == "like"
            && !i.checked_sub(1).is_some_and(|b| LIKE_BEFORE.contains(&n[b].as_str()))
            && !n.get(i + 1).is_some_and(|x| LIKE_NEXT.contains(&x.as_str()));
        if SINGLE.contains(&w) || like {
            out.push(Filler { text: w.to_string(), start_ms: words[i].start_ms, word: i });
        }
        i += 1;
    }
    out
}

pub fn per_minute(count: usize, speaking_ms: u64) -> f64 {
    if speaking_ms == 0 {
        return 0.0;
    }
    count as f64 / (speaking_ms as f64 / 60_000.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::metrics::sentences::words;

    fn texts(spec: &[&str]) -> Vec<String> {
        let w: Vec<Word> = spec.iter().enumerate().map(|(i, t)| Word { text: t.to_string(), start_ms: i as u64 * 300, end_ms: i as u64 * 300 + 250 }).collect();
        find(&w).into_iter().map(|f| f.text).collect()
    }

    #[test]
    fn counts_filled_pauses_ignoring_case_and_punctuation() {
        assert_eq!(texts(&["So,", "um,", "we", "Uh", "shipped", "it", "er."]), vec!["um", "uh", "er"]);
        assert_eq!(texts(&["basically", "it", "worked"]), vec!["basically"]);
    }

    #[test]
    fn phrases_count_once_and_eat_their_words() {
        assert_eq!(texts(&["you", "know,", "it", "grew", "I", "mean", "a", "lot"]), vec!["you know", "i mean"]);
        assert_eq!(texts(&["how", "do", "I", "say", "this"]), vec!["how do i say"]);
    }

    #[test]
    fn like_is_a_filler_only_when_it_is_not_the_verb_or_a_comparison() {
        assert_eq!(texts(&["it", "was", "like", "huge"]), vec!["like"]);
        assert_eq!(texts(&["I", "like", "to", "start", "with", "data"]), Vec::<String>::new());
        assert_eq!(texts(&["it", "looks", "like", "a", "win"]), Vec::<String>::new());
        assert_eq!(texts(&["I", "would", "like", "that"]), Vec::<String>::new());
    }

    #[test]
    fn no_fillers_in_a_clean_answer_and_the_time_is_kept() {
        assert!(texts(&["we", "cut", "churn", "by", "ten", "percent"]).is_empty());
        let w = words(&[("so", 0, 100), ("um", 4000, 4300)]);
        assert_eq!(find(&w)[0].start_ms, 4000);
    }

    #[test]
    fn rate_per_minute() {
        assert!((per_minute(5, 150_000) - 2.0).abs() < 1e-9);
        assert_eq!(per_minute(3, 0), 0.0);
    }
}
