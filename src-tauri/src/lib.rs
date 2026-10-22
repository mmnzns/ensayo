// Provider table and key store are wired into the UI in M4; they are tested now.
#[allow(dead_code)]
mod ai;
mod commands;
mod data_commands;
#[allow(dead_code)]
mod keys;
mod metrics;
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
            data_commands::data_status,
            data_commands::acquire_data_lock,
            data_commands::data_heartbeat,
            data_commands::release_data_lock,
            data_commands::load_all,
            data_commands::save_profile,
            data_commands::save_story,
            data_commands::delete_story,
            data_commands::set_proof_verified,
            data_commands::save_method,
            data_commands::delete_method,
            data_commands::resolve_conflict,
            data_commands::set_data_folder,
            data_commands::delete_all_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ensayo");
}
