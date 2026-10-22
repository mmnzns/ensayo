// Provider table and key store are wired into the UI in M4; they are tested now.
#[allow(dead_code)]
mod ai;
mod audio_retention;
mod commands;
mod data_commands;
#[allow(dead_code)]
mod keys;
mod metrics;
mod paths;
mod platform;
mod rep_commands;
mod storage;
mod recorder;
mod scoring;
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
            rep_commands::finish_rep,
            rep_commands::rescore_rep,
            rep_commands::delete_rep,
            rep_commands::label_rep,
            rep_commands::discard_recording,
            rep_commands::rep_audio_available,
            rep_commands::read_rep_audio,
            rep_commands::load_session,
            rep_commands::list_sessions,
            rep_commands::sweep_audio,
            rep_commands::audio_retention,
            rep_commands::set_audio_retention,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ensayo");
}
