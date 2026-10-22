// The modules the `ensayo-eval` command line tool also uses are public.
pub mod ai;
pub mod ai_commands;
mod audio_retention;
mod commands;
mod data_commands;
pub mod eval;
pub mod keys;
mod local_ai_commands;
pub mod metrics;
pub mod paths;
mod platform;
pub mod rep_commands;
pub mod storage;
mod story_commands;
mod recorder;
pub mod scoring;
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
            rep_commands::next_follow_up,
            rep_commands::clarify_reply,
            rep_commands::ai_ready,
            rep_commands::label_criteria,
            rep_commands::rep_labels,
            rep_commands::discard_recording,
            rep_commands::rep_audio_available,
            rep_commands::read_rep_audio,
            rep_commands::load_session,
            rep_commands::list_sessions,
            rep_commands::rep_summaries,
            rep_commands::sweep_audio,
            rep_commands::audio_retention,
            rep_commands::set_audio_retention,
            ai_commands::ai_settings,
            ai_commands::save_ai_settings,
            ai_commands::save_api_key,
            ai_commands::clear_api_key,
            ai_commands::test_ai,
            ai_commands::session_cost,
            story_commands::parse_story,
            local_ai_commands::local_ai_status,
            local_ai_commands::download_local_ai,
            local_ai_commands::cancel_local_ai_download,
            local_ai_commands::stop_local_ai,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Ensayo")
        .run(|_app, event| {
            // The helper also exits by itself when Ensayo's end of its pipe closes; this just makes it immediate.
            if let tauri::RunEvent::Exit = event {
                ai::local::stop_shared();
            }
        });
}
