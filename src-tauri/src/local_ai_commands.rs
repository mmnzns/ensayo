//! Tauri commands for the built-in local AI row in Settings › AI: what is on this computer, and the download of the
//! model. Downloads go through the shared models folder like the speech models' and run on a blocking thread (a long synchronous command
//! freezes the app on Windows). Choosing the engine itself is `save_ai_settings` with provider "local".

use crate::ai::local::{self, helper_path};
use crate::ai::local_models::{self, LocalAiStatus};
use crate::models_store::{self, DownloadSlot};
use crate::paths;
use crate::storage::settings;
use serde::Serialize;
use std::sync::atomic::AtomicBool;
use tauri::{AppHandle, Emitter};
use voice_engine_models::SharedStore;

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

pub fn view_with(saved_model: &str, store: &SharedStore, helper_found: bool) -> LocalAiView {
    LocalAiView { models: local_models::status_in(store), selected: local_models::choose(saved_model).info.id.to_string(), helper_found }
}

#[tauri::command]
pub fn local_ai_status() -> Result<LocalAiView, String> {
    let saved = settings::load(&paths::settings_file()).ai.unwrap_or_default();
    Ok(view_with(&saved.fast_model, models_store::store()?, helper_path().exists()))
}

/// The one download that may run at a time, with its cancel flag.
static ACTIVE: DownloadSlot = DownloadSlot::new();

/// Downloads `id` (the recommended model when None) into the shared models folder, unless it is already there (Ensayo's
/// or another app's copy). `progress` gets 0..1.
pub fn download_model(id: Option<&str>, store: &SharedStore, cancel: &AtomicBool, progress: &mut dyn FnMut(f32)) -> Result<(), String> {
    let m = match id {
        Some(id) => local_models::find(id).ok_or("That is not a local AI model Ensayo knows.")?,
        None => local_models::recommended(),
    };
    models_store::download(store, m.info.id, m.info.name, cancel, progress)
}

/// Emits `local-ai-progress` ({ id, fraction }) while it downloads. Resolves when the model is ready to use.
#[tauri::command]
pub async fn download_local_ai(app: AppHandle, id: Option<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let model_id = local_models::choose(id.as_deref().unwrap_or("")).info.id;
        let store = models_store::store()?;
        let cancel = ACTIVE.begin("The local AI model is already downloading.")?;
        let result = download_model(Some(model_id), store, &cancel, &mut |p| {
            let _ = app.emit("local-ai-progress", serde_json::json!({ "id": model_id, "fraction": p }));
        });
        ACTIVE.end();
        result
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Stops the download in progress (what it already fetched is kept, so the next Download resumes).
#[tauri::command]
pub fn cancel_local_ai_download() {
    ACTIVE.cancel();
}

/// Frees the model's memory now (the Settings row calls it when the engine is switched away from local).
#[tauri::command]
pub fn stop_local_ai() {
    local::stop_shared();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::Ordering;
    use voice_engine_models::{App, Status};

    fn sparse(path: &std::path::Path, size: u64) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::File::create(path).unwrap().set_len(size).unwrap();
    }

    fn store(dir: &std::path::Path, app: App) -> SharedStore {
        SharedStore::open_at(app, dir.to_path_buf()).unwrap()
    }

    #[test]
    fn the_view_names_the_models_the_selected_one_and_whether_the_helper_is_there() {
        let data = tempfile::tempdir().unwrap();
        let store = store(data.path(), App::Ensayo);
        let v = view_with("", &store, true);
        assert_eq!(v.selected, "qwen3.5-4b");
        assert!(v.helper_found);
        assert_eq!(v.models.len(), 3);
        assert!(v.models.iter().all(|m| m.state == "missing"));
        assert_eq!(view_with("qwen3.5-9b", &store, false).selected, "qwen3.5-9b");
        assert!(!view_with("qwen3.5-9b", &store, false).helper_found);
        let json = serde_json::to_value(view_with("", &store, true)).unwrap();
        assert!(json["models"][0]["state"] == "missing" && json["models"][0]["size_mb"] == 2740 && json["selected"] == "qwen3.5-4b");
    }

    #[test]
    fn a_model_already_on_this_computer_is_not_downloaded_again() {
        let data = tempfile::tempdir().unwrap();
        let m = local_models::recommended();
        sparse(&data.path().join(m.info.id).join(m.engine().files[0].name), m.engine().files[0].size);
        store(data.path(), App::Talaan).use_model(m.info.id).unwrap();
        let mine = store(data.path(), App::Ensayo);
        let mut seen = vec![];
        // The cancel flag is already set: a real download would stop at once, so success proves nothing was fetched.
        download_model(None, &mine, &AtomicBool::new(true), &mut |p| seen.push(p)).unwrap();
        assert_eq!(seen, [1.0]);
        assert_eq!(local_models::status_in(&mine)[0].state, "ready", "and now it is Ensayo's too");
    }

    #[test]
    fn an_unknown_model_is_a_plain_error() {
        let data = tempfile::tempdir().unwrap();
        let e = download_model(Some("nope"), &store(data.path(), App::Ensayo), &AtomicBool::new(false), &mut |_| {}).unwrap_err();
        assert!(e.contains("not a local AI model"), "{e}");
    }

    #[test]
    fn a_cancelled_download_reports_cancelled_and_leaves_no_model() {
        let data = tempfile::tempdir().unwrap();
        let store = store(data.path(), App::Ensayo);
        let e = download_model(None, &store, &AtomicBool::new(true), &mut |_| {}).unwrap_err();
        assert_eq!(e, "Cancelled.");
        assert_eq!(store.status(local_models::recommended().info.id), Status::Missing);
    }

    #[test]
    fn only_one_download_runs_at_a_time_and_cancel_reaches_it() {
        ACTIVE.end(); // another test may not leave one, but be sure
        let cancel = ACTIVE.begin("The local AI model is already downloading.").unwrap();
        assert!(ACTIVE.begin("The local AI model is already downloading.").unwrap_err().contains("already downloading"));
        assert!(!cancel.load(Ordering::Relaxed));
        cancel_local_ai_download();
        assert!(cancel.load(Ordering::Relaxed));
        ACTIVE.end();
        assert!(ACTIVE.begin("busy").is_ok(), "free again once it ended");
        ACTIVE.end();
    }
}
