//! Tauri commands for diagnostics: the text block, the recent log, messages from the window, and showing the log
//! folder. The logic is in `diagnostics` (the block), `logging` (the file) and `redact`.

use crate::diagnostics::{self, Inputs, LOG_LINES};
use crate::redact::Redactor;
use crate::storage::settings;
use crate::{ai::local, ai::local_models, data_commands, keys, logging, models_store, paths, speech::models};
use voice_engine_models::{App, SharedStore};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

type Cmd<T> = std::result::Result<T, String>;

/// The diagnostics block for this computer. `speech_model` is the one picked in Settings (the window keeps that
/// choice); without it the first speech model on this computer is shown.
pub fn diagnostics_text(speech_model: Option<&str>) -> String {
    let saved = settings::load(&paths::settings_file());
    let provider_key = saved.ai.as_ref().and_then(|a| crate::ai::providers::Provider::parse(a.provider.trim())).map(|p| p.key_id());
    let has_key = provider_key.is_some_and(|id| keys::get(id).is_some());
    // Every saved key, so a key that ended up anywhere in the text is blanked.
    let secrets: Vec<String> = keys::ACCOUNTS.iter().filter_map(|a| keys::get(a)).collect();
    let data_state = data_commands::status_for(&data_commands::data_folder(), &paths::default_data_dir(), &crate::storage::lock::machine_name(), chrono::Utc::now()).state;
    let tail = logging::read_tail(&paths::logs_dir(), LOG_LINES);
    // Looking at the models folder never changes it, and works even when the folder couldn't be opened for writing.
    let root = models_store::store().map(|s| s.root().to_path_buf()).unwrap_or_else(|_| SharedStore::default_dir().unwrap_or_default());
    let speech_store = SharedStore::read_only(App::Ensayo, root);
    let local_ai = local_models::status_in(&speech_store);
    let version = env!("CARGO_PKG_VERSION");
    diagnostics::build(
        &Inputs {
            app_version: version,
            os: diagnostics::os_name(),
            os_version: &diagnostics::os_version(),
            arch: std::env::consts::ARCH,
            settings: &saved,
            speech_choice: speech_model.filter(|m| models::speech_model(m).is_some()),
            speech_store: &speech_store,
            local_ai: &local_ai,
            helper_found: local::helper_path().exists(),
            data_state,
            has_key,
            free_disk_mb: diagnostics::free_disk_mb(&paths::app_local()),
            log_tail: &tail,
        },
        &Redactor::for_this_computer().with_secrets(secrets),
    )
}

#[tauri::command]
pub async fn diagnostics(speech_model: Option<String>) -> Cmd<String> {
    tauri::async_runtime::spawn_blocking(move || diagnostics_text(speech_model.as_deref())).await.map_err(|e| e.to_string())
}

/// The last `lines` lines of the log (at most 500), oldest first.
#[tauri::command]
pub async fn recent_log(lines: usize) -> Cmd<String> {
    tauri::async_runtime::spawn_blocking(move || Redactor::for_this_computer().apply(&logging::read_tail(&paths::logs_dir(), lines.min(500)).join("\n"))).await.map_err(|e| e.to_string())
}

/// An error from the window (`window.onerror`, an unhandled promise rejection). `origin` says where it came from.
#[tauri::command]
pub fn log_frontend(level: String, message: String, origin: String) {
    logging::log_frontend(&level, &message, &origin);
}

/// Shows the log folder in Finder or File Explorer.
#[tauri::command]
pub async fn reveal_logs(app: AppHandle) -> Cmd<()> {
    let dir = paths::logs_dir();
    std::fs::create_dir_all(&dir).map_err(|_| "Ensayo couldn't make its log folder.".to_string())?;
    app.opener().open_path(dir.to_string_lossy(), None::<&str>).map_err(|_| "Ensayo couldn't open the log folder.".to_string())
}
