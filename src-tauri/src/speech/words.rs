//! A transcript is a list of words with start and end times on the recording clock. Everything later (sentences,
//! time to first point, tail length, fillers) is computed in code from these.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Word {
    pub text: String,
    pub start_ms: u64,
    pub end_ms: u64,
}

/// Text engines emit for non-speech ("[BLANK_AUDIO]", "(music)", "*laughs*") or nothing at all.
pub fn is_noise(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() {
        return true;
    }
    let wrapped = |o: char, c: char| t.starts_with(o) && t.ends_with(c);
    wrapped('[', ']') || wrapped('(', ')') || wrapped('*', '*')
}

fn is_punctuation(text: &str) -> bool {
    let t = text.trim();
    !t.is_empty() && t.chars().all(|c| !c.is_alphanumeric())
}

/// Drops noise, glues punctuation-only pieces to the word before them, and keeps times in order.
pub fn clean(raw: Vec<Word>) -> Vec<Word> {
    let mut out: Vec<Word> = Vec::with_capacity(raw.len());
    for mut w in raw {
        w.text = w.text.trim().to_string();
        if is_noise(&w.text) {
            continue;
        }
        if w.end_ms < w.start_ms {
            w.end_ms = w.start_ms;
        }
        if is_punctuation(&w.text) {
            if let Some(prev) = out.last_mut() {
                prev.text.push_str(&w.text);
                prev.end_ms = prev.end_ms.max(w.end_ms);
            }
            continue;
        }
        if let Some(prev) = out.last() {
            if w.start_ms < prev.end_ms {
                w.start_ms = prev.end_ms;
                w.end_ms = w.end_ms.max(w.start_ms);
            }
        }
        out.push(w);
    }
    out
}

/// Moves words from a chunk's own clock onto the recording clock.
pub fn offset(words: Vec<Word>, by_ms: u64) -> Vec<Word> {
    words.into_iter().map(|w| Word { start_ms: w.start_ms + by_ms, end_ms: w.end_ms + by_ms, ..w }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn w(text: &str, a: u64, b: u64) -> Word {
        Word { text: text.into(), start_ms: a, end_ms: b }
    }

    #[test]
    fn punctuation_only_pieces_attach_to_the_previous_word() {
        let got = clean(vec![w("Okay", 0, 300), w(".", 300, 320), w("So", 400, 600), w(",", 600, 610)]);
        assert_eq!(got, vec![w("Okay.", 0, 320), w("So,", 400, 610)]);
    }

    #[test]
    fn noise_markers_and_empty_pieces_are_dropped() {
        let got = clean(vec![w("[BLANK_AUDIO]", 0, 500), w("  ", 500, 600), w("(music)", 600, 700), w("*laughs*", 700, 800), w("Hello", 800, 900)]);
        assert_eq!(got, vec![w("Hello", 800, 900)]);
    }

    #[test]
    fn a_leading_punctuation_piece_is_dropped_not_attached_to_nothing() {
        assert_eq!(clean(vec![w(".", 0, 10), w("Yes", 20, 200)]), vec![w("Yes", 20, 200)]);
    }

    #[test]
    fn times_never_run_backwards() {
        let got = clean(vec![w("one", 100, 50), w("two", 40, 90)]);
        assert!(got.iter().all(|x| x.end_ms >= x.start_ms), "{got:?}");
        assert!(got[1].start_ms >= got[0].end_ms, "{got:?}");
    }

    #[test]
    fn whitespace_around_words_is_trimmed() {
        assert_eq!(clean(vec![w(" Hello", 0, 100)]), vec![w("Hello", 0, 100)]);
    }

    #[test]
    fn a_word_with_punctuation_inside_it_is_not_treated_as_punctuation() {
        assert_eq!(clean(vec![w("it's", 0, 100), w("24%", 100, 300)]), vec![w("it's", 0, 100), w("24%", 100, 300)]);
    }

    #[test]
    fn offset_moves_a_chunks_words_onto_the_recording_clock() {
        let got = offset(vec![w("hi", 0, 200), w("there", 250, 500)], 12_000);
        assert_eq!(got, vec![w("hi", 12_000, 12_200), w("there", 12_250, 12_500)]);
    }
}
