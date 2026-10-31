//! The "Use the graphics card" setting and what depends on it: whether to ask for the card, the one-time notice when it
//! didn't work, and the commands Settings › Speech uses. The setting is machine-local (`LocalSettings::gpu`); `None`
//! means "use the default": on for a Mac (Metal), and on Windows only when the engine sees a discrete graphics card.
//!
//! Asking the engine about the card (`voice_engine_stt::discrete_card`) can take up to ten seconds, so it is asked
//! once, off the main thread, and remembered.

use crate::paths;
use crate::storage::settings;
use serde::Serialize;
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

/// What the notice says didn't get the card: "The graphics card didn't work for {what}".
pub const SPEECH: &str = "speech to text";
pub const AI: &str = "the built-in local AI";

static CARD: OnceLock<Option<String>> = OnceLock::new();

/// The discrete graphics card's name, when the engine sees one (always None on a Mac). Blocks the first time it is asked
/// (up to ten seconds on Windows), so never call it on the main thread.
pub fn card() -> Option<&'static str> {
    CARD.get_or_init(|| voice_engine_stt::discrete_card().map(|d| d.name)).as_deref()
}

/// Asks about the card in the background at start-up, so the first command that needs it doesn't wait.
pub fn warm() {
    let _ = std::thread::Builder::new().name("graphics-card".into()).spawn(|| {
        card();
    });
}

/// The default when the person hasn't chosen: on for the Mac, on for Windows only with a discrete card, off elsewhere.
pub fn default_on(mac: bool, windows: bool, card: bool) -> bool {
    mac || (windows && card)
}

/// The setting as it applies: what was chosen, or the default for this computer.
pub fn setting_or_default(saved: Option<bool>, card: bool) -> bool {
    saved.unwrap_or_else(|| default_on(cfg!(target_os = "macos"), cfg!(windows), card))
}

/// Whether the graphics card is turned on now (blocks like `card`).
pub fn is_on() -> bool {
    setting_or_default(settings::load(&paths::settings_file()).gpu, card().is_some())
}

// ---------- the card didn't work ----------

static SPEECH_FAILED: AtomicBool = AtomicBool::new(false);

/// Speech asked for the card and got the processor: stop asking until the person turns the card off and on again.
pub fn speech_card_failed() -> bool {
    SPEECH_FAILED.load(Ordering::Relaxed)
}

pub fn set_speech_card_failed(failed: bool) {
    SPEECH_FAILED.store(failed, Ordering::Relaxed);
}

static APP: OnceLock<AppHandle> = OnceLock::new();
static TOLD: Mutex<Option<HashSet<&'static str>>> = Mutex::new(None);

/// Lets `fell_back` reach the window.
pub fn set_app(app: AppHandle) {
    let _ = APP.set(app);
}

/// True the first time it is asked about `what` in this run of the app.
fn first_time(told: &Mutex<Option<HashSet<&'static str>>>, what: &'static str) -> bool {
    told.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(HashSet::new).insert(what)
}

/// The graphics card didn't work for `what` and the processor did the job: the window says so, once per run and per
/// kind of work. The text carries only the kind of work, never anything the person said.
pub fn fell_back(what: &'static str) {
    log::info!("graphics card: not used for {what}, the processor did the work");
    if first_time(&TOLD, what) {
        if let Some(app) = APP.get() {
            let _ = app.emit("graphics-card-fell-back", serde_json::json!({ "what": what }));
        }
    }
}

// ---------- commands ----------

/// What Settings › Speech shows.
#[derive(Debug, Serialize, PartialEq)]
pub struct GraphicsCard {
    /// Whether the card is used now.
    pub on: bool,
    /// The card's name, when there is a discrete one.
    pub card: Option<String>,
    /// What the switch would be with no choice made, so the screen can say "Ensayo's default".
    pub default_on: bool,
}

pub fn view(saved: Option<bool>, card: Option<&str>) -> GraphicsCard {
    GraphicsCard { on: setting_or_default(saved, card.is_some()), card: card.map(str::to_string), default_on: default_on(cfg!(target_os = "macos"), cfg!(windows), card.is_some()) }
}

#[tauri::command]
pub async fn graphics_card() -> Result<GraphicsCard, String> {
    tauri::async_runtime::spawn_blocking(|| view(settings::load(&paths::settings_file()).gpu, card())).await.map_err(|e| e.to_string())
}

/// Turns the card on or off. What is loaded is let go so the next load uses the new value, and turning it on again
/// forgets that it failed before.
#[tauri::command]
pub async fn set_graphics_card(on: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = paths::settings_file();
        let mut s = settings::load(&path);
        s.gpu = Some(on);
        settings::save(&path, &s).map_err(|e| e.to_string())?;
        crate::speech::loaded::unload();
        crate::ai::local::stop_shared();
        if on {
            set_speech_card_failed(false);
            crate::ai::local::forget_card_failure();
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_card_is_on_by_default_on_a_mac_and_on_windows_only_with_a_discrete_card() {
        assert!(default_on(true, false, false), "Mac: Metal");
        assert!(default_on(true, false, true));
        assert!(default_on(false, true, true), "Windows with a card");
        assert!(!default_on(false, true, false), "Windows without one");
        assert!(!default_on(false, false, true), "anything else");
    }

    #[test]
    fn a_choice_beats_the_default_either_way() {
        let default = setting_or_default(None, true);
        assert_eq!(default, cfg!(target_os = "macos") || cfg!(windows));
        assert!(setting_or_default(Some(true), false));
        assert!(!setting_or_default(Some(false), true));
        // With no card, only the Mac defaults to on.
        assert_eq!(setting_or_default(None, false), cfg!(target_os = "macos"));
    }

    #[test]
    fn the_view_names_the_card_and_says_what_the_default_is() {
        let v = view(None, Some("NVIDIA GeForce RTX 4060"));
        assert_eq!(v.card.as_deref(), Some("NVIDIA GeForce RTX 4060"));
        assert_eq!(v.on, v.default_on);
        let off = view(Some(false), Some("NVIDIA GeForce RTX 4060"));
        assert!(!off.on && off.default_on == v.default_on);
        let json = serde_json::to_value(view(None, None)).unwrap();
        assert!(json["card"].is_null() && json["on"] == json["default_on"]);
    }

    #[test]
    fn the_notice_goes_out_once_per_kind_of_work() {
        let told = Mutex::new(None);
        assert!(first_time(&told, SPEECH));
        assert!(!first_time(&told, SPEECH));
        assert!(first_time(&told, AI), "the AI has its own notice");
        assert!(!first_time(&told, AI));
    }

    #[test]
    fn a_failed_card_is_remembered_until_it_is_reset() {
        set_speech_card_failed(true);
        assert!(speech_card_failed());
        set_speech_card_failed(false);
        assert!(!speech_card_failed());
    }
}
