//! Tauri commands for the built-in local AI row in Settings › AI: what is on this computer, and the download of the
//! model. Downloads use the speech models' downloader and run on a blocking thread (a long synchronous command
//! freezes the app on Windows). Choosing the engine itself is `save_ai_settings` with provider "local".

use crate::ai::local::{self, helper_path};
use crate::ai::local_models::{self, LocalAiStatus};
use crate::paths;
use crate::speech::download;
use crate::speech::models::Location;
use crate::storage::settings;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

/// What the Settings row needs.
#[derive(Debug, Serialize)]
pub struct LocalAiView {
    /// Every model Ensayo offers, the recommended one first.
    pub models: Vec<LocalAiStatus>,
    /// The id the engine will use: the one saved in Settings, or the recommended one.
    pub selected: String,
    /// False when the helper program is not next to the app (a broken install): the row should say it cannot run.
    pub helper_found: bool,
}

pub fn view_with(saved_model: &str, store: &crate::speech::models::ModelStore, helper_found: bool) -> LocalAiView {
    LocalAiView { models: local_models::status_in(store), selected: local_models::choose(saved_model).info.id.to_string(), helper_found }
}

#[tauri::command]
pub fn local_ai_status() -> LocalAiView {
    let saved = settings::load(&paths::settings_file()).ai.unwrap_or_default();
    view_with(&saved.fast_model, &local_models::store(), helper_path().exists())
}

/// The one download that may run at a time, with its cancel flag.
static ACTIVE: Mutex<Option<Arc<AtomicBool>>> = Mutex::new(None);

/// Claims the download slot. Err when one is already running.
fn begin() -> Result<Arc<AtomicBool>, String> {
    let mut slot = ACTIVE.lock().unwrap_or_else(|e| e.into_inner());
    if slot.is_some() {
        return Err("The local AI model is already downloading.".to_string());
    }
    let cancel = Arc::new(AtomicBool::new(false));
    *slot = Some(cancel.clone());
    Ok(cancel)
}

fn end() {
    *ACTIVE.lock().unwrap_or_else(|e| e.into_inner()) = None;
}

/// Downloads `id` (the recommended model when None) into Ensayo's own folder, unless it is already there or Talaan's
/// copy can be used. `progress` gets 0..1.
pub fn download_model(id: Option<&str>, store: &crate::speech::models::ModelStore, cancel: &AtomicBool, progress: &mut dyn FnMut(f32)) -> Result<(), String> {
    let m = match id {
        Some(id) => local_models::find(id).ok_or("That is not a local AI model Ensayo knows.")?,
        None => local_models::recommended(),
    };
    if !matches!(store.locate(&m.info), Location::Missing) {
        progress(1.0);
        return Ok(());
    }
    if cancel.load(Ordering::Relaxed) {
        return Err(download::DownloadError::Cancelled.user_message());
    }
    download::clear_cancelled(&store.own_dir(&m.info));
    download::download_model(&m.info, &store.own_dir(&m.info), cancel, progress).map_err(|e| e.user_message())
}

/// Emits `local-ai-progress` ({ id, fraction }) while it downloads. Resolves when the model is ready to use.
#[tauri::command]
pub async fn download_local_ai(app: AppHandle, id: Option<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let model_id = local_models::choose(id.as_deref().unwrap_or("")).info.id;
        let cancel = begin()?;
        let result = download_model(Some(model_id), &local_models::store(), &cancel, &mut |p| {
            let _ = app.emit("local-ai-progress", serde_json::json!({ "id": model_id, "fraction": p }));
        });
        end();
        result
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Stops the download in progress (what it already fetched is kept, so the next Download resumes).
#[tauri::command]
pub fn cancel_local_ai_download() {
    if let Some(flag) = ACTIVE.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
        flag.store(true, Ordering::Relaxed);
    }
}

/// Frees the model's memory now (the Settings row calls it when the engine is switched away from local).
#[tauri::command]
pub fn stop_local_ai() {
    local::stop_shared();
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::speech::models::ModelStore;

    fn sparse(path: &std::path::Path, size: u64) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::File::create(path).unwrap().set_len(size).unwrap();
    }

    #[test]
    fn the_view_names_the_models_the_selected_one_and_whether_the_helper_is_there() {
        let data = tempfile::tempdir().unwrap();
        let store = ModelStore { root: data.path().to_path_buf(), talaan_root: None, reuse: true };
        let v = view_with("", &store, true);
        assert_eq!(v.selected, "qwen3.5-4b");
        assert!(v.helper_found);
        assert_eq!(v.models.len(), 2);
        assert!(v.models.iter().all(|m| m.state == "missing"));
        assert_eq!(view_with("qwen3.5-9b", &store, false).selected, "qwen3.5-9b");
        assert!(!view_with("qwen3.5-9b", &store, false).helper_found);
        let json = serde_json::to_value(view_with("", &store, true)).unwrap();
        assert!(json["models"][0]["state"] == "missing" && json["models"][0]["size_mb"] == 2740 && json["selected"] == "qwen3.5-4b");
    }

    #[test]
    fn a_model_already_on_this_computer_is_not_downloaded_again() {
        let data = tempfile::tempdir().unwrap();
        let talaan = tempfile::tempdir().unwrap();
        let m = local_models::recommended();
        sparse(&talaan.path().join(m.info.id).join(m.info.files[0].name), m.info.files[0].size);
        let store = ModelStore { root: data.path().join("llm"), talaan_root: Some(talaan.path().to_path_buf()), reuse: true };
        let mut seen = vec![];
        // The cancel flag is already set: a real download would stop at once, so success proves nothing was fetched.
        download_model(None, &store, &AtomicBool::new(true), &mut |p| seen.push(p)).unwrap();
        assert_eq!(seen, [1.0]);
        assert!(!data.path().join("llm").exists(), "nothing was written");
    }

    #[test]
    fn an_unknown_model_is_a_plain_error() {
        let data = tempfile::tempdir().unwrap();
        let store = ModelStore { root: data.path().to_path_buf(), talaan_root: None, reuse: true };
        let e = download_model(Some("nope"), &store, &AtomicBool::new(false), &mut |_| {}).unwrap_err();
        assert!(e.contains("not a local AI model"), "{e}");
    }

    #[test]
    fn a_cancelled_download_reports_cancelled_and_leaves_no_model() {
        let data = tempfile::tempdir().unwrap();
        let store = ModelStore { root: data.path().to_path_buf(), talaan_root: None, reuse: false };
        let e = download_model(None, &store, &AtomicBool::new(true), &mut |_| {}).unwrap_err();
        assert_eq!(e, "Cancelled.");
        let m = local_models::recommended();
        assert_eq!(store.locate(&m.info), Location::Missing);
    }

    #[test]
    fn only_one_download_runs_at_a_time_and_cancel_reaches_it() {
        end(); // another test may not leave one, but be sure
        let cancel = begin().unwrap();
        assert!(begin().unwrap_err().contains("already downloading"));
        assert!(!cancel.load(Ordering::Relaxed));
        cancel_local_ai_download();
        assert!(cancel.load(Ordering::Relaxed));
        end();
        assert!(begin().is_ok(), "free again once it ended");
        end();
    }
}
