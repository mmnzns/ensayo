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

/// The computers Ensayo runs on, as far as where speech models can run: a value so the rules below are the same
/// function on every OS and the Windows rules can be tested on a Mac.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Os {
    Mac,
    Windows,
    Other,
}

impl Os {
    pub const fn here() -> Os {
        if cfg!(target_os = "macos") {
            Os::Mac
        } else if cfg!(windows) {
            Os::Windows
        } else {
            Os::Other
        }
    }
}

/// Where a speech model runs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Route {
    /// In this process, on the processor.
    Processor,
    /// In this process, on the graphics card: Whisper on the Mac (Metal), Parakeet on Windows (DirectML).
    InProcessCard,
    /// Whisper on Windows: in the engine's Vulkan speech helper (its own process), on the graphics card.
    VulkanHelper,
}

impl Route {
    /// True when the work is on the graphics card.
    pub fn on_card(self) -> bool {
        self != Route::Processor
    }
}

/// Where `kind` runs on `os`. One rule, the owner's: on Windows with a dedicated graphics card (`card`), the card is
/// used for every model that has a path to it, with the setting on; with only integrated graphics (`card` false) the
/// processor. On the Mac, Metal for Whisper and the processor for everything else.
///
/// * `setting_on`: the switch in Settings, and the card hasn't failed since it was turned on.
/// * `card`: a dedicated card was found (the engine leaves out integrated, software and Microsoft adapters).
/// * `whisper_helper`: on Windows, the Vulkan speech helper is installed and has not failed for this version and driver.
///   Without it Whisper runs on the processor, in this process.
pub fn route(os: Os, kind: Kind, setting_on: bool, card: bool, whisper_helper: bool) -> Route {
    if !setting_on {
        return Route::Processor;
    }
    match (os, kind) {
        (Os::Mac, Kind::Whisper) => Route::InProcessCard,
        (Os::Windows, Kind::Whisper) if card && whisper_helper => Route::VulkanHelper,
        (Os::Windows, Kind::Parakeet) if card => Route::InProcessCard,
        // `Kind` can grow (Cohere and Multitalker came with engine v0.4.0). A kind Ensayo has no card path for
        // runs on the processor, or is never offered at all (see `models::usable`).
        _ => Route::Processor,
    }
}

/// `route` for this computer.
pub fn route_here(kind: Kind, setting_on: bool, card: bool, whisper_helper: bool) -> Route {
    route(Os::here(), kind, setting_on, card, whisper_helper)
}

/// (Tests only; the app uses `route_here`.) Ask the engine for the graphics card in this process only where the model has a path to it there; anything else
/// reports a false fallback. (Whisper on Windows is not in this process: it goes through the helper, `Route::VulkanHelper`.)
#[cfg(test)]
pub fn gpu_for(kind: Kind, setting_on: bool, card: bool) -> bool {
    route_here(kind, setting_on, card, false) == Route::InProcessCard
}

/// What the card setting and this computer allow, found once, for deciding where each model runs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CardState {
    /// The switch is on and the card hasn't failed since it was turned on.
    pub setting_on: bool,
    /// A dedicated graphics card was found.
    pub card: bool,
    /// Windows: the Vulkan speech helper is installed and hasn't failed for this version and driver.
    pub whisper_helper: bool,
}

/// Where a model runs on this computer, for Settings.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Placement {
    /// This computer has a way for the model to use a graphics card (Metal for Whisper on the Mac; on Windows Vulkan for
    /// Whisper and DirectML for Parakeet, when a dedicated card is there), whatever the switch says.
    pub card_path: bool,
    /// It runs on the card now (the switch is on, and the helper is there for Whisper on Windows).
    pub on_card: bool,
}

impl CardState {
    /// This computer now. Blocks the first time on Windows while the card is asked about, so call it from a worker thread.
    pub fn now() -> CardState {
        let setting_on = crate::graphics::is_on() && !crate::graphics::speech_card_failed();
        let card = crate::graphics::card().is_some();
        CardState { setting_on, card, whisper_helper: cfg!(windows) && card && super::helper::whisper_helper_now().is_some() }
    }

    /// Where `kind` runs on `os` with this state.
    pub fn placement(&self, os: Os, kind: Kind) -> Placement {
        let ceiling = route(os, kind, true, self.card, os == Os::Windows && self.card);
        Placement { card_path: ceiling.on_card(), on_card: route(os, kind, self.setting_on, self.card, self.whisper_helper).on_card() }
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
    let model = models::speech_model(model_id).ok_or_else(|| unknown(model_id))?;
    let t = voice_engine_stt::load(model, dir, LoadOptions { gpu, threads: None }).map_err(|e| load_message(&label, &e))?;
    Ok(Loaded { t, label, shape: shape_for(model) })
}

fn unknown(model_id: &str) -> String {
    format!("Ensayo doesn't know the speech model \"{model_id}\". Pick one again in Settings › Speech.")
}

/// Loads `model_id` where `route` says. `VulkanHelper` is Whisper in the engine's Vulkan helper at `helper`, with the
/// processor in this process behind it (`helper::load_whisper`); the other routes load in this process.
pub fn load_routed(model_id: &str, dir: &Path, route: Route, helper: Option<&Path>) -> Result<Loaded, String> {
    let (Route::VulkanHelper, Some(helper)) = (route, helper) else { return load(model_id, dir, route.on_card()) };
    let label = models::label(model_id);
    let model = models::speech_model(model_id).ok_or_else(|| unknown(model_id))?;
    let t = super::helper::load_whisper(model, dir, helper.to_path_buf()).map_err(|e| load_message(&label, &e))?;
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
        for kind in [Kind::Whisper, Kind::Parakeet, Kind::ParakeetUnified, Kind::Nemotron, Kind::Cohere, Kind::Multitalker] {
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
    fn windows_with_a_dedicated_card_uses_it_for_every_model_that_has_a_path_whisper_through_the_helper() {
        use Route::*;
        // Whisper (every size): the Vulkan helper, when it is installed.
        assert_eq!(route(Os::Windows, Kind::Whisper, true, true, true), VulkanHelper);
        // Parakeet TDT: DirectML in process.
        assert_eq!(route(Os::Windows, Kind::Parakeet, true, true, true), InProcessCard);
        // No path for these on Windows.
        for kind in [Kind::ParakeetUnified, Kind::Nemotron, Kind::Cohere, Kind::Multitalker] {
            assert_eq!(route(Os::Windows, kind, true, true, true), Processor, "{kind:?}");
        }
    }

    #[test]
    fn windows_with_no_dedicated_card_runs_everything_on_the_processor() {
        for kind in [Kind::Whisper, Kind::Parakeet, Kind::ParakeetUnified, Kind::Nemotron] {
            for helper in [false, true] {
                assert_eq!(route(Os::Windows, kind, true, false, helper), Route::Processor, "{kind:?}, helper {helper}");
            }
        }
    }

    #[test]
    fn whisper_on_windows_falls_back_to_the_processor_without_the_helper() {
        assert_eq!(route(Os::Windows, Kind::Whisper, true, true, false), Route::Processor, "helper missing or failed before");
        // Parakeet doesn't need the helper.
        assert_eq!(route(Os::Windows, Kind::Parakeet, true, true, false), Route::InProcessCard);
    }

    #[test]
    fn the_mac_uses_metal_for_whisper_and_the_processor_for_the_rest_and_never_the_helper() {
        for helper in [false, true] {
            assert_eq!(route(Os::Mac, Kind::Whisper, true, false, helper), Route::InProcessCard, "Metal, helper {helper}");
            for kind in [Kind::Parakeet, Kind::ParakeetUnified, Kind::Nemotron] {
                assert_eq!(route(Os::Mac, kind, true, false, helper), Route::Processor, "{kind:?}");
            }
        }
        assert_eq!(route(Os::Other, Kind::Whisper, true, true, true), Route::Processor);
    }

    #[test]
    fn the_setting_off_means_the_processor_on_every_computer() {
        for os in [Os::Mac, Os::Windows, Os::Other] {
            for kind in [Kind::Whisper, Kind::Parakeet, Kind::ParakeetUnified, Kind::Nemotron, Kind::Cohere] {
                for (card, helper) in [(false, false), (true, true)] {
                    assert_eq!(route(os, kind, false, card, helper), Route::Processor, "{os:?} {kind:?}");
                }
            }
        }
    }

    #[test]
    fn only_the_helper_route_leaves_this_process_and_on_card_says_where_the_work_is() {
        assert!(Route::VulkanHelper.on_card() && Route::InProcessCard.on_card() && !Route::Processor.on_card());
        // In process, the engine is asked for the card only on the in-process card route.
        assert!(!gpu_for(Kind::Whisper, true, true) || cfg!(target_os = "macos"));
    }

    #[test]
    fn placement_says_where_a_model_runs_on_this_computer_and_whether_it_could_use_a_card() {
        let on = CardState { setting_on: true, card: true, whisper_helper: true };
        // Windows with a card: Whisper through the helper, Parakeet through DirectML, the rest on the processor.
        assert_eq!(on.placement(Os::Windows, Kind::Whisper), Placement { card_path: true, on_card: true });
        assert_eq!(on.placement(Os::Windows, Kind::Parakeet), Placement { card_path: true, on_card: true });
        assert_eq!(on.placement(Os::Windows, Kind::Nemotron), Placement { card_path: false, on_card: false });
        // The switch off: the paths are still there, nothing runs on the card.
        let off = CardState { setting_on: false, ..on };
        assert_eq!(off.placement(Os::Windows, Kind::Whisper), Placement { card_path: true, on_card: false });
        // The helper is missing: Whisper has a path in principle (a card is there) but runs on the processor.
        let no_helper = CardState { whisper_helper: false, ..on };
        assert_eq!(no_helper.placement(Os::Windows, Kind::Whisper), Placement { card_path: true, on_card: false });
        assert_eq!(no_helper.placement(Os::Windows, Kind::Parakeet), Placement { card_path: true, on_card: true });
        // Integrated graphics only: no card path at all.
        let integrated = CardState { setting_on: true, card: false, whisper_helper: false };
        for kind in [Kind::Whisper, Kind::Parakeet] {
            assert_eq!(integrated.placement(Os::Windows, kind), Placement { card_path: false, on_card: false }, "{kind:?}");
        }
        // The Mac: Metal for Whisper, the processor for the rest.
        let mac = CardState { setting_on: true, card: false, whisper_helper: false };
        assert_eq!(mac.placement(Os::Mac, Kind::Whisper), Placement { card_path: true, on_card: true });
        assert_eq!(mac.placement(Os::Mac, Kind::Parakeet), Placement { card_path: false, on_card: false });
        assert_eq!(CardState { setting_on: false, ..mac }.placement(Os::Mac, Kind::Whisper), Placement { card_path: true, on_card: false });
    }

    #[test]
    fn every_model_runs_on_the_processor_when_the_setting_is_off() {
        for kind in [Kind::Whisper, Kind::Parakeet, Kind::ParakeetUnified, Kind::Nemotron, Kind::Cohere, Kind::Multitalker, Kind::Vad, Kind::Llm] {
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
