//! The speech models Ensayo offers, in its own words and order. The files, sizes and download addresses are the
//! engine's catalog (`voice_engine_models::catalog`); where they live on this computer is `models_store`.

use voice_engine_models::catalog;

/// The voice detection model's id: every speech model needs it, and it downloads with the first one.
pub const VAD: &str = "vad";

/// One model as Settings words it. The engine's names and notes are written for every app; these are Ensayo's.
#[derive(Debug)]
pub struct Offered {
    pub id: &'static str,
    pub name: &'static str,
    pub maker: &'static str,
    pub note: &'static str,
}

/// Speech models, in the order Settings lists them: the three recommended ones first (setup shows those and
/// hides the rest behind "Show all models"), then the other Whisper sizes and NVIDIA models.
pub static OFFERED: &[Offered] = &[
    Offered { id: "whisper-turbo", name: "Whisper Large Turbo", maker: "OpenAI", note: "Most accurate. 99 languages, including Filipino." },
    Offered { id: "parakeet-v3", name: "Parakeet", maker: "NVIDIA", note: "Good for quick notes in 25 European languages." },
    Offered { id: "whisper-small", name: "Whisper Small", maker: "OpenAI", note: "A smaller download that works on older computers. Lower accuracy." },
    Offered { id: "whisper-large-v3", name: "Whisper Large v3", maker: "OpenAI", note: "Whisper’s largest model. Very accurate, slower than Turbo." },
    Offered { id: "whisper-large-v2", name: "Whisper Large v2", maker: "OpenAI", note: "The earlier large model. Some voices and accents come out better." },
    Offered { id: "whisper-medium", name: "Whisper Medium", maker: "OpenAI", note: "Between Small and Large: good accuracy at a moderate speed." },
    Offered { id: "whisper-base", name: "Whisper Base", maker: "OpenAI", note: "Very small and fast. Rough on names and accents." },
    Offered { id: "whisper-tiny", name: "Whisper Tiny", maker: "OpenAI", note: "The smallest. For trying Ensayo out or very old computers." },
    Offered { id: "parakeet-ultra", name: "Parakeet Ultra", maker: "NVIDIA", note: "Parakeet v3 further trained by Moondream for better accuracy. 25 European languages." },
    Offered { id: "parakeet-v2", name: "Parakeet v2", maker: "NVIDIA", note: "English only. Fast and very accurate in English." },
    Offered { id: "parakeet-unified-en", name: "Parakeet Unified", maker: "NVIDIA", note: "English only. NVIDIA’s newer English model, with punctuation." },
    Offered { id: "nemotron-3.5", name: "Nemotron 3.5", maker: "NVIDIA", note: "NVIDIA’s newest, 35 languages. A larger download." },
];

/// The model setup offers and a session tries first.
///
/// Mac: Whisper Turbo. On real calls it was more complete and accurate than Parakeet (which skipped stretches and
/// misheard more), and Metal runs it at about 25x real time.
///
/// Windows: Parakeet Ultra (decided 2026-10-24). On the processor Turbo ran at about 2x real time on a fast desktop
/// (a two-minute answer waited about a minute) while Parakeet Ultra ran at about 50x with the same word accuracy and
/// kept every "um" and "uh" (bench_real_models, two voices).
pub const DEFAULT_MODEL: &str = if cfg!(target_os = "windows") { "parakeet-ultra" } else { "whisper-turbo" };

/// The speech models Ensayo recommends, in the order Settings lists them: this computer's default first, then
/// Ensayo's order.
pub fn speech_in_order() -> impl Iterator<Item = &'static Offered> {
    find(DEFAULT_MODEL).into_iter().chain(OFFERED.iter().filter(|m| m.id != DEFAULT_MODEL))
}

/// One speech model as Settings lists it.
#[derive(Debug, PartialEq)]
pub struct Listed {
    pub id: &'static str,
    pub name: &'static str,
    pub maker: &'static str,
    pub note: &'static str,
    /// One of Ensayo's own picks; the others sit behind "Show all models".
    pub recommended: bool,
}

/// Every speech model the engine has: Ensayo's picks first, in its order, then the rest in the engine's order. Ensayo's
/// own name and note go with its picks; the others carry the engine's.
pub fn speech_list() -> Vec<Listed> {
    let picks = speech_in_order().map(|o| Listed { id: o.id, name: o.name, maker: o.maker, note: o.note, recommended: true });
    let rest = catalog::speech().filter(|m| find(m.id).is_none()).map(|m| Listed { id: m.id, name: m.name, maker: m.maker, note: m.note, recommended: false });
    picks.chain(rest).collect()
}

/// A model Ensayo offers (never the voice detection model).
pub fn find(id: &str) -> Option<&'static Offered> {
    OFFERED.iter().find(|m| m.id == id)
}

/// The engine's entry for a speech model: files, sizes, kind, languages.
pub fn speech_model(id: &str) -> Option<&'static catalog::ModelInfo> {
    catalog::find(id).filter(|m| m.is_speech())
}

/// What the person sees a model called: Ensayo's name, or the engine's for a model Ensayo doesn't word itself.
pub fn label(id: &str) -> String {
    find(id).map(|m| m.name).or_else(|| catalog::find(id).map(|m| m.name)).unwrap_or(id).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_starts_with_parakeet_ultra_and_the_mac_with_whisper_turbo() {
        let expected = if cfg!(target_os = "windows") { "parakeet-ultra" } else { "whisper-turbo" };
        assert_eq!(DEFAULT_MODEL, expected);
        let order: Vec<&str> = speech_in_order().map(|m| m.id).collect();
        assert_eq!(order[0], expected);
        assert_eq!(order.len(), OFFERED.len(), "every offered model, once");
        assert!(!order.contains(&VAD));
    }

    #[test]
    fn the_list_has_every_speech_model_once_with_ensayos_twelve_first_and_recommended() {
        let list = speech_list();
        let ids: Vec<&str> = list.iter().map(|m| m.id).collect();
        let unique: std::collections::HashSet<_> = ids.iter().collect();
        assert_eq!(unique.len(), ids.len(), "each model once");
        assert_eq!(ids.len(), catalog::speech().count(), "every speech model the engine has");
        assert_eq!(OFFERED.len(), 12);
        assert!(list[..12].iter().all(|m| m.recommended) && list[12..].iter().all(|m| !m.recommended));
        assert_eq!(list[0].id, DEFAULT_MODEL);
        let picks: Vec<&str> = speech_in_order().map(|o| o.id).collect();
        assert_eq!(ids[..12], picks[..], "Ensayo's order first");
        assert!(!ids.contains(&VAD) && !ids.contains(&"diarization") && !ids.contains(&"search") && !ids.contains(&"qwen3.5-4b"));
        assert!(ids.contains(&"whisper-turbo-full"), "a model Ensayo doesn't word is still offered");
    }

    #[test]
    fn ensayos_words_go_with_its_picks_and_the_engines_with_the_rest() {
        let list = speech_list();
        let turbo = list.iter().find(|m| m.id == "whisper-turbo").unwrap();
        assert_eq!((turbo.name, turbo.note), ("Whisper Large Turbo", "Most accurate. 99 languages, including Filipino."));
        let other = list.iter().find(|m| m.id == "whisper-medium-en").unwrap();
        let engine = catalog::find("whisper-medium-en").unwrap();
        assert_eq!((other.name, other.maker, other.note), (engine.name, engine.maker, engine.note));
    }

    #[test]
    fn every_offered_model_is_a_speech_model_in_the_engines_catalog_and_listed_once() {
        for m in OFFERED {
            let e = speech_model(m.id).unwrap_or_else(|| panic!("{} is not a speech model in the engine's catalog", m.id));
            assert!(!e.files.is_empty(), "{}", m.id);
        }
        let ids: std::collections::HashSet<_> = OFFERED.iter().map(|m| m.id).collect();
        assert_eq!(ids.len(), OFFERED.len(), "duplicate model id");
        assert!(speech_model(DEFAULT_MODEL).is_some());
    }

    #[test]
    fn voice_detection_is_in_the_catalog_but_is_not_a_model_to_pick() {
        assert!(catalog::find(VAD).is_some());
        assert!(speech_model(VAD).is_none());
        assert!(find(VAD).is_none());
    }

    #[test]
    fn a_label_is_ensayos_name_for_its_models_and_the_engines_for_the_rest() {
        assert_eq!(label("whisper-turbo"), "Whisper Large Turbo");
        assert_eq!(label("whisper-medium-en"), catalog::find("whisper-medium-en").unwrap().name);
        assert_eq!(label("nope"), "nope");
    }
}
