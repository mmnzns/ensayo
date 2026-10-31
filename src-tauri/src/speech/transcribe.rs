//! One recorded answer to a transcript: find speech, cut it into chunks the engine likes, transcribe each chunk,
//! put the words on the recording clock. Build Plan, Scenarios: under 3 s of speech is "didn't catch that" and is
//! not scored; Whisper's silence hallucinations are stripped.

use super::engine::{transcribe_message, Loaded};
use super::vad::{self, Span, RATE};
use super::words::{offset, Word};
use serde::{Deserialize, Serialize};
use voice_engine_stt::{ChunkOptions, Timing};
#[cfg(test)]
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

pub fn transcribe_with(model: &mut Loaded, samples: &[f32], spans: &[Span]) -> Result<Transcript, String> {
    let duration_ms = samples.len() as u64 * 1000 / RATE as u64;
    let speech_ms: u64 = spans.iter().map(|s| s.len() as u64 * 1000 / RATE as u64).sum();
    if speech_ms < MIN_SPEECH_MS {
        return Err(DIDNT_CATCH_THAT.into());
    }
    let chunks = vad::shape(spans, samples, model.shape);
    // Fillers are kept on purpose: the filler habit counts them (the engine applies this to Whisper; Parakeet keeps
    // what it hears).
    let options = ChunkOptions { language: Some("en".into()), timing: Timing::Words, keep_fillers: true, vocabulary: vec![] };
    let mut words = vec![];
    let mut language = None;
    for span in chunks {
        let r = model.t.transcribe(&samples[span.start..span.end], &options).map_err(|e| transcribe_message(&e))?;
        language = language.or(r.language);
        words.extend(offset(r.segments.into_iter().flat_map(|s| s.words).collect(), span.start_ms()));
    }
    if words.is_empty() || is_hallucination(&words) {
        return Err(DIDNT_CATCH_THAT.into());
    }
    Ok(Transcript { words, language, engine: model.label.clone(), duration_ms })
}

/// Read the WAV, find the speech, transcribe, with a model the caller loaded. The app goes through `loaded`, which
/// keeps the model loaded between answers; this is for the real-model checks below.
#[cfg(test)]
pub fn transcribe_wav(wav: &Path, model: &mut Loaded, vad_dir: &Path) -> Result<Transcript, String> {
    let samples = vad::read_track(wav).map_err(|e| format!("Couldn't read the recording: {e}"))?;
    let spans = vad::detect(vad_dir, &samples)?;
    transcribe_with(model, &samples, &spans)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::speech::vad::{Shape, Span, RATE};
    use crate::speech::words::Word;
    use voice_engine_stt::{Segment, SpeechBackend, SpeechError, Transcriber, Transcript as Heard};

    /// A transcript the way the engine returns one: a segment per word in Words mode.
    fn heard(words: Vec<Word>, language: Option<&str>) -> Heard {
        let segments = words.into_iter().map(|w| Segment { start_ms: w.start_ms, end_ms: w.end_ms, text: w.text.clone(), starts_word: true, words: vec![w] }).collect();
        Heard { segments, language: language.map(str::to_string), stopped_early_at_ms: None }
    }

    /// Chunks are exactly the speech spans (no padding, no packing).
    fn exact() -> Shape {
        Shape { pad: 0, join_gap: 0, max_len: 28 * RATE, min_len: RATE / 4, pack_gap: 0 }
    }

    fn fake(t: impl Transcriber + 'static, label: &str, shape: Shape) -> Loaded {
        Loaded { t: Box::new(t), label: label.into(), shape }
    }

    fn backend() -> SpeechBackend {
        SpeechBackend { backend: "cpu".into(), device: None, fallback: None }
    }

    /// Says one word per chunk, at the start of the chunk, and remembers the options it was given.
    struct OneWordEach(&'static str, std::sync::Arc<std::sync::Mutex<Vec<ChunkOptions>>>);

    impl OneWordEach {
        fn new(word: &'static str) -> Self {
            OneWordEach(word, Default::default())
        }
    }

    impl Transcriber for OneWordEach {
        fn transcribe(&mut self, _audio: &[f32], opts: &ChunkOptions) -> Result<Heard, SpeechError> {
            self.1.lock().unwrap().push(opts.clone());
            Ok(heard(vec![Word { text: self.0.into(), start_ms: 0, end_ms: 200 }], Some("en")))
        }
        fn backend(&self) -> SpeechBackend {
            backend()
        }
    }

    fn one_word_each(word: &'static str) -> Loaded {
        fake(OneWordEach::new(word), "Fake", exact())
    }

    #[test]
    fn words_land_on_the_recording_clock_at_their_chunks_start() {
        // two speech spans: 1.0-3.0 s and 5.0-7.0 s, in an 8 s recording
        let samples = vec![0.1f32; 8 * 16_000];
        let spans = vec![Span { start: 16_000, end: 48_000 }, Span { start: 80_000, end: 112_000 }];
        let t = transcribe_with(&mut one_word_each("hello"), &samples, &spans).unwrap();
        assert_eq!(t.engine, "Fake");
        assert_eq!(t.duration_ms, 8_000);
        assert_eq!(t.language.as_deref(), Some("en"));
        assert_eq!(t.words.iter().map(|w| (w.start_ms, w.end_ms)).collect::<Vec<_>>(), vec![(1_000, 1_200), (5_000, 5_200)]);
    }

    #[test]
    fn every_chunk_is_asked_for_english_words_with_the_fillers_kept() {
        let samples = vec![0.1f32; 8 * 16_000];
        let spans = vec![Span { start: 16_000, end: 48_000 }, Span { start: 80_000, end: 112_000 }];
        let model = OneWordEach::new("hello");
        let seen = model.1.clone();
        transcribe_with(&mut fake(model, "Fake", exact()), &samples, &spans).unwrap();
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 2);
        for o in seen.iter() {
            assert_eq!((o.language.as_deref(), o.timing, o.keep_fillers, o.vocabulary.is_empty()), (Some("en"), Timing::Words, true, true));
        }
    }

    #[test]
    fn under_three_seconds_of_speech_is_didnt_catch_that() {
        let samples = vec![0.1f32; 2 * 16_000];
        let spans = vec![Span { start: 0, end: 32_000 }];
        assert_eq!(transcribe_with(&mut one_word_each("hi"), &samples, &spans).unwrap_err(), DIDNT_CATCH_THAT);
    }

    #[test]
    fn no_speech_at_all_is_didnt_catch_that() {
        let samples = vec![0.0f32; 10 * 16_000];
        assert_eq!(transcribe_with(&mut one_word_each("x"), &samples, &[]).unwrap_err(), DIDNT_CATCH_THAT);
    }

    #[test]
    fn a_known_whisper_hallucination_is_not_an_answer() {
        let samples = vec![0.1f32; 5 * 16_000];
        let spans = vec![Span { start: 0, end: 5 * 16_000 }];
        assert_eq!(transcribe_with(&mut one_word_each("Thank you for watching."), &samples, &spans).unwrap_err(), DIDNT_CATCH_THAT);
    }

    #[test]
    fn a_real_answer_that_starts_with_thank_you_is_kept() {
        struct Says(Vec<&'static str>);
        impl Transcriber for Says {
            fn transcribe(&mut self, _: &[f32], _: &ChunkOptions) -> Result<Heard, SpeechError> {
                let words = self.0.iter().enumerate().map(|(i, w)| Word { text: (*w).into(), start_ms: i as u64 * 300, end_ms: i as u64 * 300 + 250 }).collect();
                Ok(heard(words, None))
            }
            fn backend(&self) -> SpeechBackend {
                backend()
            }
        }
        let samples = vec![0.1f32; 5 * 16_000];
        let spans = vec![Span { start: 0, end: 5 * 16_000 }];
        let t = transcribe_with(&mut fake(Says(vec!["Thank", "you", "for", "having", "me."]), "Fake", exact()), &samples, &spans).unwrap();
        assert_eq!(t.words.len(), 5);
    }

    #[test]
    fn an_engine_error_is_passed_up_in_words_for_the_person() {
        struct Broken;
        impl Transcriber for Broken {
            fn transcribe(&mut self, _: &[f32], _: &ChunkOptions) -> Result<Heard, SpeechError> {
                Err(SpeechError::OutOfMemory)
            }
            fn backend(&self) -> SpeechBackend {
                backend()
            }
        }
        let samples = vec![0.1f32; 5 * 16_000];
        let spans = vec![Span { start: 0, end: 5 * 16_000 }];
        let e = transcribe_with(&mut fake(Broken, "Broken", Shape::whisper()), &samples, &spans).unwrap_err();
        assert!(e.contains("memory"), "{e}");
    }

    /// The model and the voice detection model come from the shared models folder (the real one, or the one
    /// `VOICE_ENGINE_MODELS_DIR` names); the model must be installed.
    fn installed(id: &str) -> std::path::PathBuf {
        use voice_engine_models::Status;
        match crate::models_store::store().unwrap().status(id) {
            Status::Installed { dir, .. } => dir,
            _ => panic!("{id} is not installed in the shared models folder"),
        }
    }

    /// Whether the graphics card is asked for, the way the app does (Task 5 adds the setting).
    fn gpu(id: &str) -> bool {
        crate::speech::engine::gpu_for(crate::speech::models::speech_model(id).unwrap().kind, true, false)
    }

    /// ENSAYO_SMOKE_WAV=<16 kHz mono wav> ENSAYO_SMOKE_MODEL=<model id, default whisper-tiny> \
    /// cargo test --release --manifest-path src-tauri/Cargo.toml smoke_real_model -- --ignored --nocapture
    #[test]
    #[ignore]
    fn smoke_real_model() {
        use crate::speech::{engine, models};
        let wav = std::env::var("ENSAYO_SMOKE_WAV").expect("set ENSAYO_SMOKE_WAV");
        let id = std::env::var("ENSAYO_SMOKE_MODEL").unwrap_or_else(|_| "whisper-tiny".into());
        let mut model = engine::load(&id, &installed(&id), gpu(&id)).unwrap();
        let t0 = std::time::Instant::now();
        let t = transcribe_wav(Path::new(&wav), &mut model, &installed(models::VAD)).unwrap();
        for w in &t.words {
            println!("{:>7.2}s  {}", w.start_ms as f64 / 1000.0, w.text);
        }
        println!("{} words from {:.1}s of audio in {:.1}s ({})", t.words.len(), t.duration_ms as f64 / 1000.0, t0.elapsed().as_secs_f64(), t.engine);
        assert!(t.words.len() > 5);
        assert!(t.words.windows(2).all(|p| p[0].start_ms <= p[1].start_ms), "word times must be in order");
    }

    /// Lower case words with the punctuation taken off, numbers left out (engines write "90%" where the script
    /// says "ninety percent", and that is not a mistake).
    fn bench_words(text: &str) -> Vec<String> {
        const NUMBER_WORDS: &[&str] = &["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "twenty", "thirty", "forty", "fifty", "ninety", "hundred", "point", "percent"];
        text.split_whitespace()
            .map(|w| w.to_lowercase().chars().filter(|c| c.is_alphanumeric() || *c == '\'').collect::<String>())
            .filter(|w| !w.is_empty() && !w.chars().any(|c| c.is_ascii_digit()) && !NUMBER_WORDS.contains(&w.as_str()))
            .collect()
    }

    /// Word error rate: word-level edit distance over the script's length.
    fn word_error_rate(script: &[String], heard: &[String]) -> f64 {
        let mut row: Vec<usize> = (0..=heard.len()).collect();
        for (i, s) in script.iter().enumerate() {
            let mut prev = row[0];
            row[0] = i + 1;
            for (j, h) in heard.iter().enumerate() {
                let cur = row[j + 1];
                row[j + 1] = if s == h { prev } else { 1 + prev.min(row[j]).min(row[j + 1]) };
                prev = cur;
            }
        }
        row[heard.len()] as f64 / script.len().max(1) as f64
    }

    #[test]
    fn the_bench_scores_words_and_ignores_numbers() {
        let script = bench_words("Um, the score went to ninety percent.");
        assert_eq!(script, vec!["um", "the", "score", "went", "to"]);
        assert_eq!(word_error_rate(&script, &bench_words("Um the score went to 90%.")), 0.0);
        assert_eq!(word_error_rate(&script, &bench_words("The score went to 90%.")), 0.2);
    }

    /// Compares speech models on one recording, the way a rep uses them: load time (paid on every answer until the
    /// model is kept loaded), transcribe time, speed against real time, word error rate against the script, and
    /// which filler words survived (the filler habit counts them). Missing models are downloaded first.
    ///
    /// ENSAYO_BENCH_WAV=<16 kHz mono wav> ENSAYO_BENCH_SCRIPT=<text file, what was said> \
    /// ENSAYO_BENCH_MODELS=whisper-turbo,parakeet-v2 \
    /// cargo test --release --manifest-path src-tauri/Cargo.toml bench_real_models -- --ignored --nocapture
    #[test]
    #[ignore]
    fn bench_real_models() {
        use crate::speech::{engine, models};
        use std::sync::atomic::AtomicBool;
        use std::time::Instant;
        use voice_engine_models::Status;
        let wav = std::env::var("ENSAYO_BENCH_WAV").expect("set ENSAYO_BENCH_WAV");
        let script = std::fs::read_to_string(std::env::var("ENSAYO_BENCH_SCRIPT").expect("set ENSAYO_BENCH_SCRIPT")).unwrap();
        let ids = std::env::var("ENSAYO_BENCH_MODELS").unwrap_or_else(|_| "whisper-turbo".into());
        let store = crate::models_store::store().unwrap();
        let fetch = |id: &str| -> std::path::PathBuf {
            if let Status::Installed { dir, .. } = store.status(id) {
                return dir;
            }
            println!("downloading {}", models::label(id));
            store.download(id, &AtomicBool::new(false), &mut |_| {}).unwrap()
        };
        let vad_dir = fetch(models::VAD);
        let samples = vad::read_track(Path::new(&wav)).unwrap();
        let audio_s = samples.len() as f64 / RATE as f64;
        let t = Instant::now();
        let spans = vad::detect(&vad_dir, &samples).unwrap();
        println!("voice detection: {:.2}s for {audio_s:.1}s of audio", t.elapsed().as_secs_f64());
        let script_words = bench_words(&script);
        const FILLERS: &[&str] = &["um", "uh"];
        let said: Vec<usize> = FILLERS.iter().map(|f| script_words.iter().filter(|w| w == f).count()).collect();
        println!("{:<22} {:>7} {:>11} {:>9} {:>6} {:>8}", "model", "load", "transcribe", "x real", "WER", "um/uh");
        for id in ids.split(',').map(str::trim) {
            let dir = fetch(id);
            let t = Instant::now();
            let mut model = engine::load(id, &dir, gpu(id)).unwrap();
            let load = t.elapsed().as_secs_f64();
            // The first pass warms caches; the second is the one an answer after the first sees.
            let _ = transcribe_with(&mut model, &samples, &spans).unwrap();
            let t = Instant::now();
            let out = transcribe_with(&mut model, &samples, &spans).unwrap();
            let run = t.elapsed().as_secs_f64();
            let heard = bench_words(&out.words.iter().map(|w| w.text.as_str()).collect::<Vec<_>>().join(" "));
            let kept: Vec<String> = FILLERS.iter().zip(&said).map(|(f, n)| format!("{}/{n}", heard.iter().filter(|w| w == f).count())).collect();
            println!("{:<22} {:>6.1}s {:>10.1}s {:>8.1}x {:>5.1}% {:>8}", id, load, run, audio_s / run, word_error_rate(&script_words, &heard) * 100.0, kept.join(" "));
        }
    }
}
