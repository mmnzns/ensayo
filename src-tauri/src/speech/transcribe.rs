//! One recorded answer to a transcript: find speech, cut it into chunks the engine likes, transcribe each chunk,
//! put the words on the recording clock. Build Plan, Scenarios: under 3 s of speech is "didn't catch that" and is
//! not scored; Whisper's silence hallucinations are stripped.

use super::engine::Engine;
use super::vad::{self, Span, Vad, RATE};
use super::words::{offset, Word};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub const DIDNT_CATCH_THAT: &str = "Didn't catch that";
const MIN_SPEECH_MS: u64 = 3_000;

/// Whole transcripts Whisper invents from silence or music (lower case, no punctuation).
const HALLUCINATIONS: &[&str] = &["thank you for watching", "thanks for watching", "please subscribe", "subtitles by the amara org community", "thank you"];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Transcript {
    pub words: Vec<Word>,
    pub language: Option<String>,
    pub engine: String,
    pub duration_ms: u64,
}

fn normalised(words: &[Word]) -> String {
    words
        .iter()
        .map(|w| w.text.to_lowercase().chars().filter(|c| c.is_alphanumeric() || c.is_whitespace()).collect::<String>())
        .collect::<Vec<_>>()
        .join(" ")
}

/// A transcript that is only a known hallucination (the whole thing: real answers are longer).
fn is_hallucination(words: &[Word]) -> bool {
    let text = normalised(words);
    let text = text.trim();
    HALLUCINATIONS.contains(&text)
}

pub fn transcribe_with(engine: &mut dyn Engine, samples: &[f32], spans: &[Span]) -> Result<Transcript, String> {
    let duration_ms = samples.len() as u64 * 1000 / RATE as u64;
    let speech_ms: u64 = spans.iter().map(|s| s.len() as u64 * 1000 / RATE as u64).sum();
    if speech_ms < MIN_SPEECH_MS {
        return Err(DIDNT_CATCH_THAT.into());
    }
    let chunks = vad::shape(spans, samples, engine.chunking());
    let mut words = vec![];
    let mut language = None;
    for span in chunks {
        let r = engine.transcribe(&samples[span.start..span.end], Some("en"))?;
        language = language.or(r.language);
        words.extend(offset(r.words, span.start_ms()));
    }
    if words.is_empty() || is_hallucination(&words) {
        return Err(DIDNT_CATCH_THAT.into());
    }
    Ok(Transcript { words, language, engine: engine.label().to_string(), duration_ms })
}

/// The real thing: read the WAV, run Silero VAD, transcribe.
pub fn transcribe_wav(wav: &Path, engine: &mut dyn Engine, vad_model: &Path) -> Result<Transcript, String> {
    let samples = vad::read_track(wav).map_err(|e| format!("Couldn't read the recording: {e}"))?;
    let spans = Vad::load(vad_model)?.detect(&samples)?;
    transcribe_with(engine, &samples, &spans)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::speech::engine::{ChunkResult, Engine};
    use crate::speech::vad::{Shape, Span, RATE};
    use crate::speech::words::Word;

    /// Says one word per chunk, at the start of the chunk. Chunks are exactly the speech spans (no padding, no packing).
    struct OneWordEach(&'static str);

    impl Engine for OneWordEach {
        fn transcribe(&mut self, _samples: &[f32], _language: Option<&str>) -> Result<ChunkResult, String> {
            Ok(ChunkResult { words: vec![Word { text: self.0.into(), start_ms: 0, end_ms: 200 }], language: Some("en".into()) })
        }
        fn label(&self) -> &str {
            "Fake"
        }
        fn chunking(&self) -> Shape {
            Shape { pad: 0, join_gap: 0, max_len: 28 * RATE, min_len: RATE / 4, pack_gap: 0 }
        }
    }

    #[test]
    fn words_land_on_the_recording_clock_at_their_chunks_start() {
        // two speech spans: 1.0-3.0 s and 5.0-7.0 s, in an 8 s recording
        let samples = vec![0.1f32; 8 * 16_000];
        let spans = vec![Span { start: 16_000, end: 48_000 }, Span { start: 80_000, end: 112_000 }];
        let t = transcribe_with(&mut OneWordEach("hello"), &samples, &spans).unwrap();
        assert_eq!(t.engine, "Fake");
        assert_eq!(t.duration_ms, 8_000);
        assert_eq!(t.language.as_deref(), Some("en"));
        assert_eq!(t.words.iter().map(|w| (w.start_ms, w.end_ms)).collect::<Vec<_>>(), vec![(1_000, 1_200), (5_000, 5_200)]);
    }

    #[test]
    fn under_three_seconds_of_speech_is_didnt_catch_that() {
        let samples = vec![0.1f32; 2 * 16_000];
        let spans = vec![Span { start: 0, end: 32_000 }];
        assert_eq!(transcribe_with(&mut OneWordEach("hi"), &samples, &spans).unwrap_err(), DIDNT_CATCH_THAT);
    }

    #[test]
    fn no_speech_at_all_is_didnt_catch_that() {
        let samples = vec![0.0f32; 10 * 16_000];
        assert_eq!(transcribe_with(&mut OneWordEach("x"), &samples, &[]).unwrap_err(), DIDNT_CATCH_THAT);
    }

    #[test]
    fn a_known_whisper_hallucination_is_not_an_answer() {
        let samples = vec![0.1f32; 5 * 16_000];
        let spans = vec![Span { start: 0, end: 5 * 16_000 }];
        assert_eq!(transcribe_with(&mut OneWordEach("Thank you for watching."), &samples, &spans).unwrap_err(), DIDNT_CATCH_THAT);
    }

    #[test]
    fn a_real_answer_that_starts_with_thank_you_is_kept() {
        struct Says(Vec<&'static str>);
        impl Engine for Says {
            fn transcribe(&mut self, _: &[f32], _: Option<&str>) -> Result<ChunkResult, String> {
                let words = self.0.iter().enumerate().map(|(i, w)| Word { text: (*w).into(), start_ms: i as u64 * 300, end_ms: i as u64 * 300 + 250 }).collect();
                Ok(ChunkResult { words, language: None })
            }
            fn label(&self) -> &str {
                "Fake"
            }
            fn chunking(&self) -> Shape {
                Shape { pad: 0, join_gap: 0, max_len: 28 * RATE, min_len: RATE / 4, pack_gap: 0 }
            }
        }
        let samples = vec![0.1f32; 5 * 16_000];
        let spans = vec![Span { start: 0, end: 5 * 16_000 }];
        let t = transcribe_with(&mut Says(vec!["Thank", "you", "for", "having", "me."]), &samples, &spans).unwrap();
        assert_eq!(t.words.len(), 5);
    }

    #[test]
    fn an_engine_error_is_passed_up() {
        struct Broken;
        impl Engine for Broken {
            fn transcribe(&mut self, _: &[f32], _: Option<&str>) -> Result<ChunkResult, String> {
                Err("couldn't load the speech model".into())
            }
            fn label(&self) -> &str {
                "Broken"
            }
            fn chunking(&self) -> Shape {
                Shape::whisper()
            }
        }
        let samples = vec![0.1f32; 5 * 16_000];
        let spans = vec![Span { start: 0, end: 5 * 16_000 }];
        assert_eq!(transcribe_with(&mut Broken, &samples, &spans).unwrap_err(), "couldn't load the speech model");
    }

    /// ENSAYO_SMOKE_WAV=<16 kHz mono wav> ENSAYO_SMOKE_MODEL=<model id, default whisper-tiny> \
    /// cargo test --release --manifest-path src-tauri/Cargo.toml smoke_real_model -- --ignored --nocapture
    #[test]
    #[ignore]
    fn smoke_real_model() {
        use crate::speech::{engine, models};
        let wav = std::env::var("ENSAYO_SMOKE_WAV").expect("set ENSAYO_SMOKE_WAV");
        let id = std::env::var("ENSAYO_SMOKE_MODEL").unwrap_or_else(|_| "whisper-tiny".into());
        let model = models::find(&id).unwrap();
        let store = models::ModelStore::new(crate::paths::models_dir(), true);
        let dir = store.locate(model).dir().expect("model not downloaded").to_path_buf();
        let vad_dir = store.locate(&models::VAD).dir().expect("VAD not downloaded").to_path_buf();
        let mut eng = engine::load(model, &dir, cfg!(target_os = "macos")).unwrap();
        let t0 = std::time::Instant::now();
        let t = transcribe_wav(Path::new(&wav), eng.as_mut(), &vad_dir.join(models::VAD.files[0].name)).unwrap();
        for w in &t.words {
            println!("{:>7.2}s  {}", w.start_ms as f64 / 1000.0, w.text);
        }
        println!("{} words from {:.1}s of audio in {:.1}s ({})", t.words.len(), t.duration_ms as f64 / 1000.0, t0.elapsed().as_secs_f64(), t.engine);
        assert!(t.words.len() > 5);
        assert!(t.words.windows(2).all(|p| p[0].start_ms <= p[1].start_ms), "word times must be in order");
    }
}
