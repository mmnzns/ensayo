//! Machine-local folders. Models and answer audio never go in the user's data folder (it may be synced).

use std::path::PathBuf;

pub const BUNDLE_ID: &str = "com.craftconceptsdigital.ensayo";

/// `~/Library/Application Support/<id>` on the Mac, `%LOCALAPPDATA%\<id>` on Windows.
pub fn app_local() -> PathBuf {
    dirs::data_local_dir().unwrap_or_else(|| PathBuf::from(".")).join(BUNDLE_ID)
}

pub fn models_dir() -> PathBuf {
    app_local().join("models")
}

pub fn audio_dir() -> PathBuf {
    app_local().join("audio")
}
