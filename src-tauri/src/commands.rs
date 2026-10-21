//! Tauri commands for the M0 check screen. Anything that can take time is async and runs on a blocking thread:
//! a long synchronous command freezes the app on Windows (WebView2).

use crate::paths;
use crate::recorder::capture::Capture;
use crate::recorder::mic::{input_devices, MicSource};
use crate::speech::{download, engine, models, transcribe};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct RecorderState {
    active: AtomicBool,
    capture: Mutex<Option<Capture>>,
}

impl RecorderState {
    fn begin(&self) -> Result<(), String> {
        if self.active.swap(true, Ordering::AcqRel) {
            return Err("Already recording".into());
        }
        Ok(())
    }

    fn end(&self) {
        self.active.store(false, Ordering::Release);
    }
}

#[derive(Serialize)]
pub struct ModelStatus {
    id: &'static str,
    name: &'static str,
    size_mb: u64,
    /// "ready" (Ensayo's copy), "on_this_computer" (reused from Talaan) or "missing".
    state: &'static str,
}

#[tauri::command]
pub async fn list_input_devices() -> Vec<String> {
    tauri::async_runtime::spawn_blocking(input_devices).await.unwrap_or_default()
}

#[tauri::command]
pub fn model_status(id: String) -> Result<ModelStatus, String> {
    let m = models::find(&id).ok_or("Unknown model")?;
    let store = models::ModelStore::new(paths::models_dir(), true);
    let state = match store.locate(m) {
        models::Location::Own(_) => "ready",
        models::Location::OnThisComputer(_) => "on_this_computer",
        models::Location::Missing => "missing",
    };
    Ok(ModelStatus { id: m.id, name: m.name, size_mb: m.size() / 1_000_000, state })
}

#[tauri::command]
pub async fn download_model(app: AppHandle, id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let m = models::find(&id).ok_or("Unknown model")?;
        let store = models::ModelStore::new(paths::models_dir(), false);
        let cancel = AtomicBool::new(false);
        // The voice detection model is tiny and every speech model needs it.
        for info in [m, &models::VAD] {
            download::download_model(info, &store.own_dir(info), &cancel, &mut |p| {
                let _ = app.emit("model-progress", serde_json::json!({ "id": info.id, "fraction": p }));
            })
            .map_err(|e| e.user_message())?;
        }
        Ok(())
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
pub async fn start_recording(state: State<'_, RecorderState>, device: Option<String>) -> Result<String, String> {
    state.begin()?;
    let started = (|| {
        std::fs::create_dir_all(paths::audio_dir()).map_err(|e| e.to_string())?;
        let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
        let path = paths::audio_dir().join(format!("m0-{stamp}.wav"));
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
        let m = models::find(&model_id).ok_or("Unknown model")?;
        let store = models::ModelStore::new(paths::models_dir(), true);
        let dir = store.locate(m).dir().ok_or("That speech model isn't downloaded yet")?.to_path_buf();
        let vad_dir = store.locate(&models::VAD).dir().ok_or("The voice detection model isn't downloaded yet")?.to_path_buf();
        let mut eng = engine::load(m, &dir, cfg!(target_os = "macos"))?;
        transcribe::transcribe_wav(&path, eng.as_mut(), &vad_dir.join(models::VAD.files[0].name))
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

    #[test]
    fn model_status_reports_missing_for_a_model_nobody_downloaded() {
        let s = model_status("whisper-tiny".into()).unwrap();
        assert_eq!(s.id, "whisper-tiny");
        assert!(s.size_mb > 10);
        assert!(["ready", "on_this_computer", "missing"].contains(&s.state));
    }

    #[test]
    fn model_status_rejects_an_unknown_model() {
        assert_eq!(model_status("nope".into()).err().as_deref(), Some("Unknown model"));
    }
}
