//! Machine-local folders. Models and answer audio never go in the user's data folder (it may be synced).

use std::path::PathBuf;

pub const BUNDLE_ID: &str = "com.craftconceptsdigital.ensayo";

/// `~/Library/Application Support/<id>` on the Mac, `%LOCALAPPDATA%\<id>` on Windows.
pub fn app_local() -> PathBuf {
    dirs::data_local_dir().unwrap_or_else(|| PathBuf::from(".")).join(BUNDLE_ID)
}

/// Ensayo's own models folder from before the shared one: it only means the LEGACY place now. At start-up the models in
/// it move to the shared folder (`models_store`), leaving hard links behind; "Delete all data" still clears it. New
/// code asks `models_store::store()` where a model is.
pub fn models_dir() -> PathBuf {
    app_local().join("models")
}

pub fn audio_dir() -> PathBuf {
    app_local().join("audio")
}

/// Machine-local trash: recordings of deleted sessions wait here (`audio/<session>/`) until the session is purged or restored.
pub fn trash_dir() -> PathBuf {
    app_local().join("trash")
}

pub fn audio_trash_dir() -> PathBuf {
    trash_dir().join("audio")
}

/// Where the data folder lives unless the user chose another one (Settings › Privacy › Data folder).
pub fn default_data_dir() -> PathBuf {
    app_local().join("data")
}

/// Machine-local settings (which data folder to use). Never inside the data folder: it may be synced between computers.
pub fn settings_file() -> PathBuf {
    app_local().join("settings.json")
}

/// Ensayo's log files (`ensayo.log` and its older copies). Machine-local; "Delete all Ensayo data" removes it.
pub fn logs_dir() -> PathBuf {
    app_local().join("logs")
}
