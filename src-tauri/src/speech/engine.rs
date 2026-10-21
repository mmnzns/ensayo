//! Speech engines behind one small trait. Each call gets one chunk of speech (16 kHz mono) and returns
//! words with times relative to that chunk; `transcribe::transcribe_with` places them on the recording clock.

use super::models::{EngineKind, ModelInfo};
use super::words::{clean, Word};
use std::path::Path;

#[derive(Debug, Clone, Default)]
pub struct ChunkResult {
    pub words: Vec<Word>,
    /// Language the engine detected, when it does detection (Whisper).
    pub language: Option<String>,
}

pub trait Engine: Send {
    /// `language`: ISO 639-1 code, or None to let the engine decide.
    fn transcribe(&mut self, samples: &[f32], language: Option<&str>) -> Result<ChunkResult, String>;
    /// Short label stored with the transcript ("Parakeet", "Whisper Large Turbo").
    fn label(&self) -> &str;
    /// How speech is cut into chunks for this engine.
    fn chunking(&self) -> super::vad::Shape;
}

pub fn load(model: &ModelInfo, dir: &Path, use_gpu: bool) -> Result<Box<dyn Engine>, String> {
    match model.engine {
        EngineKind::Parakeet | EngineKind::ParakeetUnified | EngineKind::Nemotron => Ok(Box::new(ParakeetEngine::load(dir, model.name, model.engine)?)),
        EngineKind::Whisper => Ok(Box::new(WhisperEngine::load(&dir.join(model.files[0].name), model.name, use_gpu)?)),
    }
}

/// Speech threads (three quarters of the cores on Windows, all on the Mac).
fn threads() -> usize {
    super::whisper::threads()
}

/// The NVIDIA models: Parakeet TDT (v2, v3, Ultra), Parakeet Unified and Nemotron. Same chunking, same
/// timestamps; they differ only in how they load and decode.
enum NvidiaModel {
    Tdt(parakeet_rs::ParakeetTDT),
    Unified(parakeet_rs::ParakeetUnified),
    /// With the language prompts the model accepts ("en-US", "fr-FR"...).
    Nemotron(Box<parakeet_rs::Nemotron>, Vec<&'static str>),
}

pub struct ParakeetEngine {
    model: NvidiaModel,
    label: String,
}

impl ParakeetEngine {
    pub fn load(dir: &Path, label: &str, kind: EngineKind) -> Result<Self, String> {
        let config = parakeet_rs::ExecutionConfig::new().with_intra_threads(threads());
        let failed = |e: parakeet_rs::Error| format!("couldn't load the speech model: {e}");
        let model = match kind {
            EngineKind::ParakeetUnified => NvidiaModel::Unified(parakeet_rs::ParakeetUnified::from_pretrained(dir, Some(config)).map_err(failed)?),
            EngineKind::Nemotron => {
                let handle = parakeet_rs::NemotronHandle::from_pretrained(dir, Some(config)).map_err(failed)?;
                NvidiaModel::Nemotron(Box::new(parakeet_rs::Nemotron::from_shared(&handle)), handle.available_languages())
            }
            _ => NvidiaModel::Tdt(parakeet_rs::ParakeetTDT::from_pretrained(dir, Some(config)).map_err(failed)?),
        };
        Ok(ParakeetEngine { model, label: label.into() })
    }

    /// Nemotron takes a language hint ("fr" → its "fr-FR" prompt); unknown or none means it detects.
    fn set_language(&mut self, language: Option<&str>) {
        if let NvidiaModel::Nemotron(m, langs) = &mut self.model {
            if langs.is_empty() {
                return; // the English-only variant takes no prompt
            }
            let locale = language.and_then(|code| langs.iter().copied().find(|l| l.split('-').next() == Some(code)));
            let _ = m.set_target_lang(locale.unwrap_or("auto"));
        }
    }
}

impl ParakeetEngine {
    /// Half a second of silence on both sides: Parakeet often returns nothing for audio that starts or
    /// ends right on speech (seen on real calls).
    fn run(&mut self, samples: &[f32]) -> Result<Vec<Word>, String> {
        use parakeet_rs::Transcriber;
        const PAD: usize = 8_000;
        let mut audio = vec![0.0f32; PAD];
        audio.extend_from_slice(samples);
        audio.extend(std::iter::repeat_n(0.0, PAD));
        let mode = Some(parakeet_rs::TimestampMode::Words);
        let result = match &mut self.model {
            NvidiaModel::Tdt(m) => m.transcribe_samples(audio, 16_000, 1, mode),
            NvidiaModel::Unified(m) => m.transcribe_samples(audio, 16_000, 1, mode),
            NvidiaModel::Nemotron(m, _) => m.transcribe_audio_with_timestamps(&audio, mode),
        }
        .map_err(|e| format!("transcription failed: {e}"))?;
        let len_ms = samples.len() as u64 * 1000 / 16_000;
        let shift = |t: f32| ((t.max(0.0) * 1000.0) as u64).saturating_sub(500).min(len_ms);
        let words = result.tokens.into_iter().map(|t| Word { text: t.text, start_ms: shift(t.start), end_ms: shift(t.end.max(t.start)) }).collect();
        Ok(clean(words))
    }
}

impl Engine for ParakeetEngine {
    /// Parakeet sometimes stops decoding partway through a chunk (seen when a chunk starts mid-sentence).
    /// The chunk is all speech by construction, so when output ends well before the audio does, the rest is
    /// transcribed again from where it stopped.
    fn transcribe(&mut self, samples: &[f32], language: Option<&str>) -> Result<ChunkResult, String> {
        self.set_language(language);
        let total_ms = samples.len() as u64 * 1000 / 16_000;
        let mut words: Vec<Word> = vec![];
        let mut from_ms = 0u64;
        for _ in 0..8 {
            let from = (from_ms * 16) as usize;
            let mut got = self.run(&samples[from..])?;
            got.iter_mut().for_each(|w| {
                w.start_ms += from_ms;
                w.end_ms += from_ms;
            });
            let reached = got.last().map(|w| w.end_ms).unwrap_or(from_ms);
            let progressed = reached > from_ms + 500;
            words.extend(got);
            if !progressed || total_ms.saturating_sub(reached) < RESUME_GAP_MS {
                break;
            }
            from_ms = reached;
        }
        Ok(ChunkResult { words, language: None })
    }

    fn label(&self) -> &str {
        &self.label
    }

    fn chunking(&self) -> super::vad::Shape {
        super::vad::Shape::parakeet()
    }
}

/// Audio left after the last word that counts as "decoding stopped early".
const RESUME_GAP_MS: u64 = 2_000;

pub struct WhisperEngine {
    // The state holds ~400 MB of buffers; one per engine, reused for every chunk.
    state: whisper_rs::WhisperState,
    _ctx: whisper_rs::WhisperContext,
    label: String,
}

impl WhisperEngine {
    pub fn load(file: &Path, label: &str, use_gpu: bool) -> Result<Self, String> {
        // Flash attention only pays off on Metal; on CPU it costs 10-15%.
        let p = super::whisper::context_params(use_gpu, cfg!(target_os = "macos") && use_gpu);
        let ctx = whisper_rs::WhisperContext::new_with_params(file, p).map_err(|e| format!("couldn't load the speech model: {e}"))?;
        let state = ctx.create_state().map_err(|e| format!("couldn't load the speech model: {e}"))?;
        Ok(WhisperEngine { state, _ctx: ctx, label: label.into() })
    }
}

impl Engine for WhisperEngine {
    fn transcribe(&mut self, samples: &[f32], language: Option<&str>) -> Result<ChunkResult, String> {
        let (words, language) = super::whisper::transcribe_words(&mut self.state, samples, language)?;
        Ok(ChunkResult { words, language })
    }

    fn label(&self) -> &str {
        &self.label
    }

    fn chunking(&self) -> super::vad::Shape {
        super::vad::Shape::whisper()
    }
}
