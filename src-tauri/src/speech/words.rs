//! A transcript is a list of words with start and end times on the recording clock. Everything later (sentences,
//! time to first point, tail length, fillers) is computed in code from these.

/// A word is the engine's: text and its start and end on the clock it was made on. The engine's Words mode already
/// drops noise markers, glues punctuation to the word before it and keeps times in order.
pub use voice_engine_protocol::stt::Word;

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
    fn offset_moves_a_chunks_words_onto_the_recording_clock() {
        let got = offset(vec![w("hi", 0, 200), w("there", 250, 500)], 12_000);
        assert_eq!(got, vec![w("hi", 12_000, 12_200), w("there", 12_250, 12_500)]);
    }
}
