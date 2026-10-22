//! Sentences from a word list. The AI refers to sentences by index and never times them; code turns the index into
//! seconds (`prompts/README.md`, convention 4).

use crate::speech::words::Word;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Sentence {
    /// 1-based, as the prompts number them.
    pub index: usize,
    pub text: String,
    pub start_ms: u64,
    pub end_ms: u64,
    /// Position of the first word in the transcript's word list.
    pub first_word: usize,
    pub word_count: usize,
}

/// With no punctuation at all (some engines), a gap this long ends a sentence.
const GAP_MS: u64 = 700;

fn ends_sentence(text: &str) -> bool {
    let t = text.trim_end_matches(['"', '\'', ')', '”', '’']);
    t.ends_with('.') || t.ends_with('?') || t.ends_with('!') || t.ends_with('…')
}

pub fn split(words: &[Word]) -> Vec<Sentence> {
    let punctuated = words.iter().any(|w| ends_sentence(&w.text));
    let mut out: Vec<Sentence> = Vec::new();
    let mut start = 0usize;
    for (i, w) in words.iter().enumerate() {
        let last = i + 1 == words.len();
        let boundary = if punctuated { ends_sentence(&w.text) } else { !last && words[i + 1].start_ms.saturating_sub(w.end_ms) >= GAP_MS };
        if boundary || last {
            let slice = &words[start..=i];
            out.push(Sentence {
                index: out.len() + 1,
                text: slice.iter().map(|w| w.text.as_str()).collect::<Vec<_>>().join(" "),
                start_ms: slice[0].start_ms,
                end_ms: slice[slice.len() - 1].end_ms,
                first_word: start,
                word_count: slice.len(),
            });
            start = i + 1;
        }
    }
    out
}

#[cfg(test)]
pub(crate) fn words(spec: &[(&str, u64, u64)]) -> Vec<Word> {
    spec.iter().map(|(t, s, e)| Word { text: t.to_string(), start_ms: *s, end_ms: *e }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_on_sentence_punctuation_and_keeps_times() {
        let w = words(&[("I", 0, 200), ("led", 200, 500), ("it.", 500, 900), ("Then", 1200, 1500), ("it", 1500, 1600), ("grew?", 1600, 2000)]);
        let s = split(&w);
        assert_eq!(s.len(), 2);
        assert_eq!((s[0].index, s[0].text.as_str(), s[0].start_ms, s[0].end_ms), (1, "I led it.", 0, 900));
        assert_eq!((s[1].index, s[1].first_word, s[1].word_count), (2, 3, 3));
        assert_eq!(s[1].start_ms, 1200);
    }

    #[test]
    fn a_decimal_number_does_not_end_a_sentence() {
        let w = words(&[("It", 0, 100), ("reached", 100, 300), ("2.5", 300, 500), ("million.", 500, 900)]);
        assert_eq!(split(&w).len(), 1);
    }

    #[test]
    fn with_no_punctuation_a_long_gap_ends_a_sentence() {
        let w = words(&[("so", 0, 200), ("we", 200, 400), ("shipped", 400, 800), ("then", 1700, 1900), ("it", 1900, 2000), ("grew", 2000, 2300)]);
        let s = split(&w);
        assert_eq!(s.len(), 2);
        assert_eq!(s[1].text, "then it grew");
    }

    #[test]
    fn no_words_no_sentences_and_trailing_words_without_a_full_stop_still_count() {
        assert!(split(&[]).is_empty());
        let w = words(&[("hello.", 0, 300), ("and", 400, 500), ("so", 500, 600)]);
        let s = split(&w);
        assert_eq!(s.len(), 2);
        assert_eq!(s[1].text, "and so");
    }
}
