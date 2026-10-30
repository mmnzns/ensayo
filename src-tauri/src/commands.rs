//! Tauri commands for the M0 check screen. Anything that can take time is async and runs on a blocking thread:
//! a long synchronous command freezes the app on Windows (WebView2).

use crate::models_store::{self, DownloadSlot};
use crate::paths;
use crate::recorder::capture::Capture;
use crate::recorder::mic::{input_devices, MicSource};
use crate::speech::{models, transcribe};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use voice_engine_models::{catalog, SharedStore};

#[derive(Default)]
pub struct RecorderState {
    active: AtomicBool,
    capture: Mutex<Option<Capture>>,
}

impl RecorderState {
    fn begin(&self) -> Result<(), String> {
        if self.active.swap(true, Ordering::SeqCst) {
            return Err("Already recording".into());
        }
        Ok(())
    }

    fn end(&self) {
        self.active.store(false, Ordering::SeqCst);
    }

    /// True from the start of a recording until it is stopped or fails to start (an update never installs then).
    pub fn is_active(&self) -> bool {
        self.active.load(Ordering::SeqCst)
    }
}

#[derive(Serialize)]
pub struct ModelStatus {
    id: String,
    name: String,
    size_mb: u64,
    /// "ready" (Ensayo uses it), "on_this_computer" (there, from another app), "missing", "partial" (an interrupted
    /// download), "downloading" (here) or "downloading_elsewhere" (another app is fetching it).
    state: &'static str,
    /// How much is on disk, for "partial" and the two "downloading" states.
    #[serde(skip_serializing_if = "Option::is_none")]
    fraction: Option<f32>,
}

#[tauri::command]
pub async fn list_input_devices() -> Vec<String> {
    tauri::async_runtime::spawn_blocking(input_devices).await.unwrap_or_default()
}

/// One speech model for Settings, Speech: what it is and whether it is on this computer.
#[derive(Serialize)]
pub struct SpeechModelEntry {
    id: &'static str,
    name: &'static str,
    maker: &'static str,
    note: &'static str,
    languages: &'static str,
    size_mb: u64,
    /// The same states as `ModelStatus`.
    state: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    fraction: Option<f32>,
}

/// Every model Ensayo offers for turning speech into text, in the order Settings lists them, with its state.
pub fn speech_model_list(store: &SharedStore) -> Vec<SpeechModelEntry> {
    models::speech_in_order()
        .filter_map(|o| {
            let m = models::speech_model(o.id)?;
            let status = store.status(o.id);
            Some(SpeechModelEntry { id: o.id, name: o.name, maker: o.maker, note: o.note, languages: m.languages, size_mb: m.size() / 1_000_000, state: models_store::state_name(&status), fraction: models_store::fraction_of(&status) })
        })
        .collect()
}

#[tauri::command]
pub async fn speech_models() -> Result<Vec<SpeechModelEntry>, String> {
    tauri::async_runtime::spawn_blocking(|| Ok(speech_model_list(models_store::store()?))).await.map_err(|e| e.to_string())?
}

fn model_status_in(store: &SharedStore, id: &str) -> Result<ModelStatus, String> {
    // A speech model, or the voice detection model that goes with every one.
    let m = models::speech_model(id).or_else(|| catalog::find(id).filter(|m| m.id == models::VAD)).ok_or("Unknown model")?;
    let status = store.status(m.id);
    Ok(ModelStatus { id: m.id.to_string(), name: models::label(m.id), size_mb: m.size() / 1_000_000, state: models_store::state_name(&status), fraction: models_store::fraction_of(&status) })
}

#[tauri::command]
pub fn model_status(id: String) -> Result<ModelStatus, String> {
    model_status_in(models_store::store()?, &id)
}

/// Ensayo uses this speech model: another app that also uses it can't erase it while Ensayo does. The window says it
/// once at start with the model picked in Settings, and again whenever the person picks another.
#[tauri::command]
pub async fn use_speech_model(id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        models::speech_model(&id).ok_or("Unknown model")?;
        models_store::store()?.use_model(&id).map_err(|_| "Ensayo couldn't note that it uses that speech model.".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

static SPEECH_DOWNLOAD: DownloadSlot = DownloadSlot::new();

/// Downloads the model, then the small voice detection model every speech model needs; `emit` gets (id, 0..1).
fn download_speech(store: &SharedStore, id: &str, cancel: &AtomicBool, emit: &mut dyn FnMut(&str, f32)) -> Result<(), String> {
    models::speech_model(id).ok_or("Unknown model")?;
    for part in [id, models::VAD] {
        models_store::download(store, part, &models::label(part), cancel, &mut |p| emit(part, p))?;
    }
    Ok(())
}

/// Emits `model-progress` ({ id, fraction }) for the model and then for voice detection. Resolves when both are ready.
#[tauri::command]
pub async fn download_model(app: AppHandle, id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = models_store::store()?;
        let cancel = SPEECH_DOWNLOAD.begin("A speech model is already downloading.")?;
        let result = download_speech(store, &id, &cancel, &mut |part, fraction| {
            let _ = app.emit("model-progress", serde_json::json!({ "id": part, "fraction": fraction }));
        });
        SPEECH_DOWNLOAD.end();
        result
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Stops the speech download in progress (what it already fetched is kept, so the next Download resumes).
#[tauri::command]
pub fn cancel_model_download() {
    SPEECH_DOWNLOAD.cancel();
}

/// Frees the model if it is the one in use, then lets go of it. The folder goes only when no other app uses it.
fn delete_in(store: &SharedStore, id: &str, unload: impl FnOnce()) -> Result<models_store::Deleted, String> {
    let known = models::speech_model(id).is_some() || crate::ai::local_models::find(id).is_some();
    if !known {
        return Err("Unknown model".into());
    }
    // A loaded model holds its files open (Windows won't delete them) and a hold on its folder.
    unload();
    models_store::release(store, id)
}

/// Delete a model from this computer: "erased" when no other app uses it, "kept" when another still does, "not_using"
/// when Ensayo never used it.
#[tauri::command]
pub async fn delete_model(id: String) -> Result<models_store::Deleted, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = models_store::store()?;
        delete_in(store, &id, || {
            if crate::speech::loaded::is_loaded(&id) {
                crate::speech::loaded::unload();
            }
            if crate::ai::local_models::find(&id).is_some() {
                crate::ai::local::unload_shared();
            }
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn mic_permission() -> &'static str {
    crate::platform::mic_status()
}

#[tauri::command]
pub async fn request_mic_permission() -> bool {
    tauri::async_runtime::spawn_blocking(crate::platform::request_mic).await.unwrap_or(false)
}

#[tauri::command]
pub fn open_mic_settings() -> Result<(), String> {
    crate::platform::open_mic_settings()
}

#[tauri::command]
pub async fn start_recording(app: AppHandle, state: State<'_, RecorderState>, device: Option<String>) -> Result<String, String> {
    state.begin()?;
    // The update flag is set before the installer looks at `is_active` and this looks at the flag only after
    // `begin`, so a recording and an install can't both go ahead (the installer quits Ensayo mid-answer).
    if crate::update_commands::installing(&app) {
        state.end();
        return Err("Ensayo is installing an update. Try again in a moment.".into());
    }
    let started = (|| {
        std::fs::create_dir_all(paths::audio_dir()).map_err(|e| e.to_string())?;
        let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
        let path = paths::audio_dir().join(format!("rec-{stamp}.wav"));
        let mic = MicSource::with_device(device.as_deref().unwrap_or(""));
        Capture::start(Box::new(mic), &path)
    })();
    match started {
        Ok(cap) => {
            let name = cap.mic_name().to_string();
            *state.capture.lock().unwrap_or_else(|e| e.into_inner()) = Some(cap);
            Ok(name)
        }
        Err(e) => {
            state.end();
            Err(e)
        }
    }
}

#[derive(Serialize)]
pub struct RecordingLevel {
    level: f32,
    elapsed_ms: u64,
}

#[tauri::command]
pub fn recording_level(state: State<'_, RecorderState>) -> Option<RecordingLevel> {
    state.capture.lock().unwrap_or_else(|e| e.into_inner()).as_ref().map(|c| RecordingLevel { level: c.level(), elapsed_ms: c.elapsed_ms() })
}

#[derive(Serialize)]
pub struct StoppedRecording {
    path: PathBuf,
    duration_ms: u64,
}

#[tauri::command]
pub async fn stop_recording(state: State<'_, RecorderState>) -> Result<StoppedRecording, String> {
    let cap = state.capture.lock().unwrap_or_else(|e| e.into_inner()).take().ok_or("Not recording")?;
    let result = tauri::async_runtime::spawn_blocking(move || cap.stop()).await.map_err(|e| e.to_string())?;
    state.end();
    let rec = result?;
    Ok(StoppedRecording { path: rec.path, duration_ms: rec.duration_ms })
}

#[tauri::command]
pub async fn transcribe_recording(path: PathBuf, model_id: String) -> Result<transcribe::Transcript, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _t = crate::logging::Timer::new("transcribe_recording");
        crate::speech::loaded::transcribe_wav(&path, &model_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_second_start_while_recording_is_refused() {
        let state = RecorderState::default();
        state.begin().unwrap();
        assert_eq!(state.begin().unwrap_err(), "Already recording");
        state.end();
        assert!(state.begin().is_ok(), "stopping makes the recorder free again");
    }

    fn temp_store() -> (tempfile::TempDir, SharedStore) {
        let dir = tempfile::tempdir().unwrap();
        let store = SharedStore::open_at(voice_engine_models::App::Ensayo, dir.path().to_path_buf()).unwrap();
        (dir, store)
    }

    fn install(store: &SharedStore, id: &str) {
        for f in catalog::find(id).unwrap().files {
            std::fs::create_dir_all(store.model_dir(id)).unwrap();
            std::fs::File::create(store.model_dir(id).join(f.name)).unwrap().set_len(f.size).unwrap();
        }
    }

    #[test]
    fn model_status_reports_missing_for_a_model_nobody_downloaded() {
        let (_d, store) = temp_store();
        let s = model_status_in(&store, "whisper-tiny").unwrap();
        assert_eq!(s.id, "whisper-tiny");
        assert_eq!(s.name, "Whisper Tiny");
        assert!(s.size_mb > 10);
        assert_eq!(s.state, "missing");
        let json = serde_json::to_value(&s).unwrap();
        assert!(json.get("fraction").is_none(), "no fraction when nothing is on disk");
    }

    #[test]
    fn model_status_follows_the_store_and_a_partial_download_has_a_fraction() {
        let (_d, store) = temp_store();
        install(&store, "whisper-tiny");
        assert_eq!(model_status_in(&store, "whisper-tiny").unwrap().state, "on_this_computer");
        store.use_model("whisper-tiny").unwrap();
        assert_eq!(model_status_in(&store, "whisper-tiny").unwrap().state, "ready");
        let m = catalog::find("whisper-base").unwrap();
        std::fs::create_dir_all(store.model_dir(m.id)).unwrap();
        std::fs::File::create(store.model_dir(m.id).join(format!("{}.part", m.files[0].name))).unwrap().set_len(m.files[0].size / 4).unwrap();
        let partial = serde_json::to_value(model_status_in(&store, "whisper-base").unwrap()).unwrap();
        assert_eq!(partial["state"], "partial");
        assert!((partial["fraction"].as_f64().unwrap() - 0.25).abs() < 0.01, "{partial}");
    }

    #[test]
    fn the_voice_detection_model_has_a_status_too() {
        let (_d, store) = temp_store();
        assert_eq!(model_status_in(&store, "vad").unwrap().state, "missing");
    }

    #[test]
    fn the_speech_list_has_every_offered_model_and_nothing_else() {
        let (_d, store) = temp_store();
        let list = speech_model_list(&store);
        assert_eq!(list[0].id, models::DEFAULT_MODEL, "this computer's recommended model comes first");
        assert!(list.iter().all(|m| m.state == "missing"), "an empty folder has nothing");
        assert!(list.iter().all(|m| m.id != "vad"), "voice detection is not a model to pick");
        assert_eq!(list.len(), models::OFFERED.len());
        assert!(list.iter().all(|m| m.size_mb > 10 && !m.languages.is_empty()));
    }

    #[test]
    fn model_status_rejects_an_unknown_model_and_one_that_is_not_for_speech() {
        let (_d, store) = temp_store();
        assert_eq!(model_status_in(&store, "nope").err().as_deref(), Some("Unknown model"));
        assert_eq!(model_status_in(&store, "qwen3.5-4b").err().as_deref(), Some("Unknown model"));
    }

    #[test]
    fn a_speech_download_of_a_model_already_here_also_checks_voice_detection_and_emits_both() {
        let (_d, store) = temp_store();
        install(&store, "whisper-tiny");
        install(&store, "vad");
        let mut seen = vec![];
        // Cancelled up front: success shows nothing was fetched.
        download_speech(&store, "whisper-tiny", &AtomicBool::new(true), &mut |id, f| seen.push((id.to_string(), f))).unwrap();
        assert_eq!(seen, [("whisper-tiny".to_string(), 1.0), ("vad".to_string(), 1.0)]);
    }

    #[test]
    fn a_speech_download_of_something_that_is_not_a_speech_model_is_refused() {
        let (_d, store) = temp_store();
        assert_eq!(download_speech(&store, "qwen3.5-4b", &AtomicBool::new(false), &mut |_, _| {}).unwrap_err(), "Unknown model");
    }

    #[test]
    fn delete_unloads_first_then_lets_go_and_says_what_happened() {
        let (_d, store) = temp_store();
        install(&store, "whisper-tiny");
        store.use_model("whisper-tiny").unwrap();
        let mut order = vec![];
        let got = delete_in(&store, "whisper-tiny", || order.push("unload")).unwrap();
        assert_eq!(got, models_store::Deleted { result: "erased" });
        assert_eq!(order, ["unload"]);
        assert!(!store.model_dir("whisper-tiny").exists());
        assert_eq!(delete_in(&store, "whisper-tiny", || {}).unwrap(), models_store::Deleted { result: "not_using" });
    }

    #[test]
    fn delete_keeps_a_model_another_app_uses() {
        let dir = tempfile::tempdir().unwrap();
        let mine = SharedStore::open_at(voice_engine_models::App::Ensayo, dir.path().to_path_buf()).unwrap();
        let talaan = SharedStore::open_at(voice_engine_models::App::Talaan, dir.path().to_path_buf()).unwrap();
        install(&mine, "whisper-tiny");
        mine.use_model("whisper-tiny").unwrap();
        talaan.use_model("whisper-tiny").unwrap();
        assert_eq!(delete_in(&mine, "whisper-tiny", || {}).unwrap().result, "kept");
        assert!(mine.model_dir("whisper-tiny").exists());
    }

    #[test]
    fn delete_refuses_a_model_ensayo_does_not_know() {
        let (_d, store) = temp_store();
        assert_eq!(delete_in(&store, "nope", || panic!("nothing to unload")).unwrap_err(), "Unknown model");
        assert_eq!(delete_in(&store, "vad", || panic!("voice detection is not deleted by itself")).unwrap_err(), "Unknown model");
    }
}
