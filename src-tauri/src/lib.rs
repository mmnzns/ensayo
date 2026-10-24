// The modules the `ensayo-eval` command line tool also uses are public.
pub mod ai;
pub mod ai_commands;
mod application_commands;
pub mod applications;
mod audio_retention;
pub mod backup;
mod backup_commands;
mod commands;
mod data_commands;
mod diag_commands;
mod diagnostics;
pub mod eval;
pub mod keys;
mod local_ai_commands;
mod mock_commands;
mod native_voice;
pub mod metrics;
pub mod paths;
pub mod logging;
pub mod redact;
mod platform;
pub mod rep_commands;
pub mod storage;
mod story_commands;
mod trash_commands;
mod target_commands;
mod recorder;
pub mod scoring;
mod speech;
mod update_commands;
pub mod update_notice;

pub fn run() {
    let builder = tauri::Builder::default();
    // One Ensayo at a time on Windows: a second launch brings the open window forward instead of starting a second
    // copy on the same data folder, recorder and helper (the lock can't tell two copies on one computer apart).
    // Registered first, as the plugin asks.
    #[cfg(target_os = "windows")]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        use tauri::Manager;
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.unminimize();
            let _ = w.show();
            let _ = w.set_focus();
        }
    }));
    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::RecorderState::default())
        .setup(|app| {
            logging::init();
            log::info!("Ensayo {} started on {} {} ({})", env!("CARGO_PKG_VERSION"), diagnostics::os_name(), diagnostics::os_version(), std::env::consts::ARCH);
            update_commands::setup(app.handle());
            update_commands::check_at_launch(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_input_devices,
            commands::model_status,
            commands::speech_models,
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
            target_commands::load_targets,
            target_commands::save_you,
            target_commands::save_target,
            target_commands::duplicate_target,
            target_commands::set_active_target,
            target_commands::archive_target,
            target_commands::restore_target,
            target_commands::ack_targets_note,
            target_commands::set_story_priority,
            target_commands::target_from_posting,
            data_commands::save_story,
            data_commands::delete_story,
            data_commands::set_proof_verified,
            data_commands::save_method,
            data_commands::delete_method,
            data_commands::resolve_conflict,
            data_commands::set_data_folder,
            data_commands::move_data_folder,
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
            rep_commands::audio_usage_mb,
            rep_commands::delete_all_audio,
            trash_commands::delete_session,
            trash_commands::delete_application_practice,
            trash_commands::trashed_sessions,
            trash_commands::restore_session,
            trash_commands::purge_trash,
            ai_commands::ai_settings,
            ai_commands::save_ai_settings,
            ai_commands::save_api_key,
            ai_commands::clear_api_key,
            ai_commands::test_ai,
            ai_commands::session_cost,
            story_commands::parse_story,
            mock_commands::mock_debrief,
            mock_commands::load_debrief,
            application_commands::load_applications,
            application_commands::create_application,
            application_commands::update_application,
            application_commands::delete_application,
            application_commands::save_process,
            application_commands::add_stage,
            application_commands::remove_stage,
            application_commands::reorder_stages,
            application_commands::rename_stage,
            application_commands::set_stage_time,
            application_commands::set_stage_done,
            application_commands::save_posting,
            application_commands::analyse_jd,
            application_commands::save_analysis,
            application_commands::save_question,
            application_commands::delete_question,
            application_commands::save_interview_note,
            application_commands::delete_interview_note,
            application_commands::load_interview_notes,
            application_commands::set_asked_questions_first,
            application_commands::edit_claim,
            application_commands::remove_claim,
            application_commands::add_claim,
            application_commands::mark_claim_updated,
            application_commands::mark_claim_current,
            application_commands::attach_resume,
            application_commands::attach_resume_bytes,
            application_commands::use_resume_from,
            application_commands::set_no_resume,
            application_commands::paste_resume_text,
            application_commands::read_resume,
            application_commands::open_resume,
            application_commands::record_must_say,
            application_commands::drop_story_suggestion,
            application_commands::save_locked,
            application_commands::clear_locked,
            application_commands::cue_sheet,
            application_commands::cue_sheet_markdown,
            local_ai_commands::local_ai_status,
            local_ai_commands::download_local_ai,
            local_ai_commands::cancel_local_ai_download,
            local_ai_commands::stop_local_ai,
            backup_commands::backup_data,
            backup_commands::inspect_backup,
            backup_commands::restore_backup,
            update_commands::updates_check,
            update_commands::updates_pending,
            update_commands::updates_install,
            native_voice::native_voices,
            native_voice::speak_native,
            native_voice::stop_speaking_native,
            diag_commands::diagnostics,
            diag_commands::recent_log,
            diag_commands::log_frontend,
            diag_commands::reveal_logs,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Ensayo")
        .run(|_app, event| {
            // The helper also exits by itself when Ensayo's end of its pipe closes; this just makes it immediate.
            if let tauri::RunEvent::Exit = event {
                ai::local::stop_shared();
                native_voice::stop();
                if let Err(e) = data_commands::release_lock_now() {
                    log::warn!("Could not release the data folder lock: {e}");
                }
            }
        });
}
