// Provider table and key store are wired into the UI in M4; they are tested now.
#[allow(dead_code)]
mod ai;
mod commands;
#[allow(dead_code)]
mod keys;
mod paths;
mod platform;
mod storage;
mod recorder;
mod speech;

pub fn run() {
    tauri::Builder::default()
        .manage(commands::RecorderState::default())
        .invoke_handler(tauri::generate_handler![
            commands::list_input_devices,
            commands::model_status,
            commands::download_model,
            commands::mic_permission,
            commands::request_mic_permission,
            commands::open_mic_settings,
            commands::start_recording,
            commands::recording_level,
            commands::stop_recording,
            commands::transcribe_recording,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ensayo");
}
