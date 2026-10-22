//! What to do with a transcript before measuring it: strip the phrases engines invent on silence, decide whether
//! anything was said at all, and find a restart ("sorry, let me start again").

use super::sentences::Sentence;
use crate::speech::words::Word;

/// Under this much speech the rep is "didn't catch that" and is not scored.
pub const MIN_SPEECH_MS: u64 = 3_000;

/// Phrases speech engines produce on silence or music. Matched as a whole sentence at the start or end.
const HALLUCINATIONS: [&str; 7] = [
    "thank you for watching",
    "thanks for watching",
    "please subscribe",
    "subscribe to my channel",
    "see you in the next video",
    "like and subscribe",
    "thank you for listening",
];
/// Only a hallucination when it is the whole transcript.
const ONLY_IF_ALONE: [&str; 3] = ["thank you", "thanks", "you"];

const RESTARTS: [&str; 7] = ["start again", "start over", "let me try that again", "let me rephrase", "scratch that", "let me restart", "begin again"];

fn plain(s: &str) -> String {
    s.chars().filter(|c| c.is_alphanumeric() || c.is_whitespace() || *c == '\'').collect::<String>().to_lowercase().split_whitespace().collect::<Vec<_>>().join(" ")
}

fn is_hallucination(sentence: &str, alone: bool) -> bool {
    let p = plain(sentence);
    HALLUCINATIONS.contains(&p.as_str()) || (alone && ONLY_IF_ALONE.contains(&p.as_str()))
}

/// Drops hallucinated sentences from the start and end of the transcript.
pub fn strip_hallucinations(words: Vec<Word>, sentences: &[Sentence]) -> Vec<Word> {
    if sentences.is_empty() {
        return words;
    }
    let alone = sentences.len() == 1;
    let (mut from, mut to) = (0usize, sentences.len());
    while from < to && is_hallucination(&sentences[from].text, alone) {
        from += 1;
    }
    while to > from && is_hallucination(&sentences[to - 1].text, alone) {
        to -= 1;
    }
    if from == 0 && to == sentences.len() {
        return words;
    }
    if from >= to {
        return Vec::new();
    }
    let first = sentences[from].first_word;
    let last = sentences[to - 1].first_word + sentences[to - 1].word_count;
    words[first..last].to_vec()
}

/// Time actually spoken: the sum of the words' own durations, so a thinking pause is not speech.
pub fn speech_ms(words: &[Word]) -> u64 {
    words.iter().map(|w| w.end_ms.saturating_sub(w.start_ms)).sum()
}

pub fn heard_enough(words: &[Word]) -> bool {
    speech_ms(words) >= MIN_SPEECH_MS
}

/// The last sentence that says the speaker is starting over, if any. Everything before it can be discarded.
pub fn restart_at(sentences: &[Sentence]) -> Option<usize> {
    sentences.iter().rev().find(|s| {
        let p = plain(&s.text);
        RESTARTS.iter().any(|r| p.contains(r))
    }).map(|s| s.index)
}

/// The words after a restart sentence (the restart sentence itself is dropped).
pub fn after_restart(words: &[Word], sentences: &[Sentence], index: usize) -> Vec<Word> {
    match sentences.iter().find(|s| s.index == index) {
        Some(s) => words[(s.first_word + s.word_count).min(words.len())..].to_vec(),
        None => words.to_vec(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::metrics::sentences::{split, words};

    #[test]
    fn a_known_hallucination_is_removed_from_the_end_but_a_real_thank_you_stays() {
        let w = words(&[("We", 0, 300), ("shipped", 300, 700), ("it.", 700, 1_000), ("Thank", 8_000, 8_200), ("you", 8_200, 8_400), ("for", 8_400, 8_500), ("watching.", 8_500, 9_000)]);
        let s = split(&w);
        let kept = strip_hallucinations(w, &s);
        assert_eq!(kept.len(), 3);

        let w = words(&[("We", 0, 300), ("shipped", 300, 700), ("it.", 700, 1_000), ("Thank", 1_200, 1_400), ("you.", 1_400, 1_800)]);
        let s = split(&w);
        assert_eq!(strip_hallucinations(w, &s).len(), 5);
    }

    #[test]
    fn a_transcript_that_is_only_thank_you_is_a_hallucination() {
        let w = words(&[("Thank", 0, 300), ("you.", 300, 700)]);
        let s = split(&w);
        assert!(strip_hallucinations(w, &s).is_empty());
    }

    #[test]
    fn under_three_seconds_of_speech_is_not_enough() {
        let few = words(&[("hello", 0, 500), ("there", 500, 1_000)]);
        assert!(!heard_enough(&few));
        let w: Vec<Word> = (0..10).map(|i| Word { text: "w".into(), start_ms: i * 500, end_ms: i * 500 + 400 }).collect();
        assert!(heard_enough(&w));
        assert!(!heard_enough(&[]));
    }

    #[test]
    fn a_thinking_pause_is_not_speech() {
        let w = words(&[("a", 0, 1_000), ("b", 30_000, 31_000)]);
        assert_eq!(speech_ms(&w), 2_000);
    }

    #[test]
    fn a_restart_is_found_and_only_the_words_after_it_are_kept() {
        let w = words(&[
            ("So", 0, 200), ("the", 200, 400), ("thing", 400, 700), ("was...", 700, 900),
            ("sorry,", 1_000, 1_300), ("let", 1_300, 1_400), ("me", 1_400, 1_500), ("start", 1_500, 1_700), ("again.", 1_700, 2_000),
            ("We", 2_500, 2_700), ("cut", 2_700, 2_900), ("churn.", 2_900, 3_300),
        ]);
        let s = split(&w);
        let at = restart_at(&s).unwrap();
        assert_eq!(at, 2);
        let kept = after_restart(&w, &s, at);
        assert_eq!(kept.iter().map(|w| w.text.as_str()).collect::<Vec<_>>(), vec!["We", "cut", "churn."]);
    }

    #[test]
    fn no_restart_phrase_means_no_restart() {
        let w = words(&[("We", 0, 300), ("cut", 300, 600), ("churn.", 600, 900)]);
        assert_eq!(restart_at(&split(&w)), None);
    }
}
