//! Speech models through the shared engine (`voice-engine-stt`). The engine loads a model and turns one chunk of speech
//! (16 kHz mono) into words with times relative to that chunk; what Ensayo keeps is which chunks to send
//! (`vad::shape`), the recording clock (`transcribe::transcribe_with`), the label stored with a transcript and the
//! words the person sees when something goes wrong.

use super::models;
use super::vad::{Shape, RATE};
use std::path::Path;
use voice_engine_models::catalog::{Kind, ModelInfo};
use voice_engine_stt::{LoadOptions, SpeechError, Transcriber};

/// A loaded speech model with what Ensayo needs next to it.
pub struct Loaded {
    pub t: Box<dyn Transcriber>,
    /// Short label stored with the transcript ("Parakeet", "Whisper Large Turbo").
    pub label: String,
    /// How speech is cut into chunks for this model.
    pub shape: Shape,
}

/// Ask for the graphics card only where the model has a path; anything else reports a false fallback.
pub fn gpu_for(kind: Kind, setting_on: bool, card: bool) -> bool {
    setting_on
        && match kind {
            Kind::Whisper => cfg!(target_os = "macos"),
            Kind::Parakeet => cfg!(windows) && card,
            _ => false,
        }
}

/// How speech is cut for `model`: a model that takes only so many seconds at once never gets a longer chunk (the
/// engine refuses it), and a model that has no limit gets Whisper's window.
pub fn shape_for(model: &ModelInfo) -> Shape {
    match model.chunk_secs {
        None => Shape::whisper(),
        Some(secs) => Shape { max_len: secs as usize * RATE, ..Shape::parakeet() },
    }
}

pub fn load(model_id: &str, dir: &Path, gpu: bool) -> Result<Loaded, String> {
    let label = models::label(model_id);
    let model = models::speech_model(model_id).ok_or_else(|| format!("Ensayo doesn't know the speech model \"{model_id}\". Pick one again in Settings › Speech."))?;
    let t = voice_engine_stt::load(model, dir, LoadOptions { gpu, threads: None }).map_err(|e| load_message(&label, &e))?;
    Ok(Loaded { t, label, shape: shape_for(model) })
}

/// Words for the person when a model won't load. `name` is the model's name; the engine's own text never reaches
/// the screen, and it never carries anything the person said.
pub fn load_message(name: &str, e: &SpeechError) -> String {
    match e {
        SpeechError::ModelMissing => format!("The speech model {name} is missing from this computer. Download it again in Settings › Speech."),
        SpeechError::BadModel => format!("The speech model {name} couldn't be read, so it may be damaged. Delete it and download it again in Settings › Speech."),
        SpeechError::OutOfMemory => format!("There isn't enough memory to load the speech model {name}. Close some other apps, or pick a smaller speech model in Settings › Speech."),
        other => format!("Couldn't load the speech model {name}: {other}"),
    }
}

/// Words for a chunk that fails to transcribe.
pub fn transcribe_message(e: &SpeechError) -> String {
    match e {
        SpeechError::OutOfMemory => "There wasn't enough memory to transcribe this answer. Close some other apps and try again.".to_string(),
        other => format!("Transcription failed: {other}"),
    }
}

/// Words for a failure of voice detection.
pub fn vad_message(e: &SpeechError) -> String {
    match e {
        SpeechError::ModelMissing | SpeechError::BadModel => "The voice detection model is missing or damaged. Download it again in Settings › Speech.".to_string(),
        other => format!("Voice detection failed: {other}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use voice_engine_models::catalog;

    /// What `gpu_for` must say on this computer for a model kind, with the setting on and a card or not.
    fn expected(kind: Kind, card: bool) -> bool {
        match kind {
            Kind::Whisper => cfg!(target_os = "macos"),
            Kind::Parakeet => cfg!(windows) && card,
            _ => false,
        }
    }

    #[test]
    fn the_graphics_card_is_asked_for_only_where_the_model_has_a_path_to_it() {
        for kind in [Kind::Whisper, Kind::Parakeet, Kind::ParakeetUnified, Kind::Nemotron] {
            for card in [false, true] {
                assert_eq!(gpu_for(kind, true, card), expected(kind, card), "{kind:?}, card {card}");
            }
        }
        // The table, for this computer.
        assert_eq!(gpu_for(Kind::Whisper, true, false), cfg!(target_os = "macos"), "Whisper: Metal on the Mac only");
        assert_eq!(gpu_for(Kind::Parakeet, true, true), cfg!(windows), "Parakeet TDT: DirectML on Windows with a card");
        assert!(!gpu_for(Kind::Parakeet, true, false), "Parakeet without a card");
        assert!(!gpu_for(Kind::ParakeetUnified, true, true) && !gpu_for(Kind::Nemotron, true, true), "no path for Unified or Nemotron");
    }

    #[test]
    fn every_model_runs_on_the_processor_when_the_setting_is_off() {
        for kind in [Kind::Whisper, Kind::Parakeet, Kind::ParakeetUnified, Kind::Nemotron, Kind::Vad, Kind::Llm] {
            for card in [false, true] {
                assert!(!gpu_for(kind, false, card), "{kind:?}, card {card}");
            }
        }
    }

    #[test]
    fn parakeet_means_the_tdt_models_and_unified_and_nemotron_are_their_own_kinds() {
        for id in ["parakeet-v2", "parakeet-v3", "parakeet-ultra"] {
            assert_eq!(catalog::find(id).unwrap().kind, Kind::Parakeet, "{id}");
        }
        assert_eq!(catalog::find("parakeet-unified-en").unwrap().kind, Kind::ParakeetUnified);
        assert_eq!(catalog::find("nemotron-3.5").unwrap().kind, Kind::Nemotron);
    }

    #[test]
    fn a_model_with_a_chunk_limit_gets_parakeets_shape_and_the_others_get_whispers() {
        let parakeet = Shape::parakeet();
        let got = shape_for(catalog::find("parakeet-ultra").unwrap());
        assert_eq!((got.max_len, got.join_gap, got.pad, got.pack_gap), (parakeet.max_len, parakeet.join_gap, parakeet.pad, 0));
        let whisper = Shape::whisper();
        let got = shape_for(catalog::find("whisper-turbo").unwrap());
        assert_eq!((got.max_len, got.join_gap, got.pad, got.pack_gap), (whisper.max_len, whisper.join_gap, whisper.pad, whisper.pack_gap));
    }

    #[test]
    fn no_chunk_is_longer_than_the_model_takes_in_one_call() {
        for m in catalog::speech() {
            if let Some(secs) = m.chunk_secs {
                assert!(shape_for(m).max_len <= secs as usize * RATE, "{}", m.id);
            }
        }
    }

    #[test]
    fn a_model_that_will_not_load_is_named_with_what_to_do_and_the_engines_text_stays_out() {
        for e in [SpeechError::ModelMissing, SpeechError::BadModel, SpeechError::OutOfMemory] {
            let m = load_message("Whisper Large Turbo", &e);
            assert!(m.contains("Whisper Large Turbo") && m.contains("Settings"), "{m}");
        }
        assert!(load_message("X", &SpeechError::OutOfMemory).contains("memory"));
        assert!(load_message("X", &SpeechError::BadModel).contains("damaged"));
    }

    #[test]
    fn an_unknown_model_id_is_a_plain_error() {
        let e = load("nope", Path::new("/nonexistent"), false).err().unwrap();
        assert!(e.contains("doesn't know the speech model") && e.contains("Settings"), "{e}");
    }
}
