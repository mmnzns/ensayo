//! The automatic updater: Ensayo checks for a newer signed version, says so (`update-available`), and installs it
//! on request. Ported from Talaan's updater (its own MIT code), without the system notification and the tray.
//!
//! The newest version found is kept in `UpdateState`, so every part of the UI shows the same thing: the banner
//! and Settings › About ask with `updates_pending` and hear `update-available` when a check finds one. The
//! schedule and the once-per-version bookkeeping are in `crate::update_notice` (pure, tested).
//!
//! Where the updater looks is `plugins.updater.endpoints` in tauri.conf.json (one place). The public key that
//! checks every download is `plugins.updater.pubkey` there too.

use crate::commands::RecorderState;
use crate::paths;
use crate::update_notice::{check_due, InstallFlag, Last, Notice, NoticeFiles, CHECK_TIMEOUT, DOWNLOAD_TIMEOUT};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

pub const UPDATE_AVAILABLE: &str = "update-available";
/// Download progress while installing: `{ percent }` (null when the size isn't known yet), then `{ restarting }`,
/// or `{ error }` when it fails.
pub const UPDATE_PROGRESS: &str = "update-progress";

#[derive(Serialize, Clone)]
pub struct Available {
    version: String,
    notes: Option<String>,
    /// True the first time this version was ever found on this computer.
    first: bool,
}

/// The shared update state: the newest version found, and which one was announced.
pub struct UpdateState {
    pending: Mutex<Option<Available>>,
    notice: Mutex<Notice>,
    notice_files: NoticeFiles,
    installing: InstallFlag,
}

impl UpdateState {
    fn pending(&self) -> std::sync::MutexGuard<'_, Option<Available>> {
        self.pending.lock().unwrap_or_else(|e| e.into_inner())
    }
    fn notice(&self) -> std::sync::MutexGuard<'_, Notice> {
        self.notice.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// Call once at launch.
pub fn setup(app: &AppHandle) {
    let notice_files = NoticeFiles::new(&paths::app_local(), &std::env::temp_dir());
    let notice = Notice::new(notice_files.read());
    app.manage(UpdateState { pending: Mutex::new(None), notice: Mutex::new(notice), notice_files, installing: InstallFlag::default() });
}

/// The updater, with a time limit, so a request that hangs can't hold the background check (or Update now) forever.
fn updater(app: &AppHandle) -> tauri_plugin_updater::Result<tauri_plugin_updater::Updater> {
    app.updater_builder().timeout(CHECK_TIMEOUT).build()
}

/// Asks the update server and records the answer in the shared state. Nothing is downloaded.
async fn check(app: &AppHandle) -> Result<Option<Available>, String> {
    let current = app.package_info().version.to_string();
    let updater = updater(app).inspect_err(|e| log::warn!("update check failed: {e}")).map_err(|_| "Ensayo couldn't check for updates.".to_string())?;
    let update = updater.check().await.inspect_err(|e| log::warn!("update check failed (offline?): {e}")).map_err(|_| "Couldn't reach the update server. Check your internet connection.".to_string())?;
    match &update {
        Some(u) => log::info!("update check: {} is available (this is {current})", u.version),
        None => log::info!("update check: {current} is the newest"),
    }
    let state = app.try_state::<UpdateState>();
    let found = update.map(|u| {
        let first = state.as_ref().is_some_and(|s| {
            let news = s.notice().first_time(&u.version);
            if news {
                remember_notified(s, &u.version);
            }
            news
        });
        Available { version: u.version, notes: u.body, first }
    });
    if let Some(s) = &state {
        *s.pending() = found.clone();
    }
    if let Some(a) = &found {
        let _ = app.emit(UPDATE_AVAILABLE, a);
    }
    Ok(found)
}

/// Check now (Settings › About). What it finds is what the banner shows.
#[tauri::command]
pub async fn updates_check(app: AppHandle) -> Result<Option<Available>, String> {
    check(&app).await
}

/// The newer version found by the last check, if any, for a screen that opens after it.
#[tauri::command]
pub fn updates_pending(app: AppHandle) -> Option<Available> {
    app.try_state::<UpdateState>().and_then(|s| s.pending().clone())
}

/// True while an update downloads and installs: recordings don't start then (`commands::start_recording`).
pub fn installing(app: &AppHandle) -> bool {
    app.try_state::<UpdateState>().is_some_and(|s| s.installing.is_set())
}

fn recording(app: &AppHandle) -> bool {
    app.try_state::<RecorderState>().is_some_and(|r| r.is_active())
}

/// Downloads, verifies (signature), installs and relaunches. Refused while a practice answer is being recorded,
/// and no recording can start while it runs (the installer quits Ensayo).
///
/// The UI hears how it goes (`update-progress`), failures included (`{ error }`).
#[tauri::command]
pub async fn updates_install(app: AppHandle) -> Result<(), String> {
    let state = app.state::<UpdateState>();
    let Some(_installing) = state.installing.begin() else {
        return Err("An update is already installing.".into());
    };
    let result = install(&app).await;
    if let Err(e) = &result {
        let _ = app.emit(UPDATE_PROGRESS, serde_json::json!({ "error": e }));
    }
    result
}

/// `updates_install` once it holds the install flag.
async fn install(app: &AppHandle) -> Result<(), String> {
    const STOP: &str = "Finish or stop your recording first, then update.";
    // The flag is set before this look, and a recording starts only after looking at the flag, so from here on
    // no recording can start and none is running.
    if recording(app) {
        return Err(STOP.into());
    }
    let updater = updater(app).map_err(|e| format!("Ensayo couldn't check for updates: {e}"))?;
    let mut update = match updater.check().await {
        Ok(Some(u)) => u,
        Ok(None) => return Err("Ensayo is already up to date.".into()),
        Err(_) => return Err("Couldn't reach the update server. Check your internet connection.".into()),
    };
    log::info!("installing update {}", update.version);
    let (progress_app, finish_app) = (app.clone(), app.clone());
    let mut got: u64 = 0;
    let mut said: Option<Option<u8>> = None;
    let on_chunk = move |chunk: usize, total: Option<u64>| {
        got += chunk as u64;
        let percent = total.filter(|t| *t > 0).map(|t| (got.saturating_mul(100) / t).min(100) as u8);
        // Only when the whole percent changes (chunks are a few kilobytes).
        if said != Some(percent) {
            said = Some(percent);
            let _ = progress_app.emit(UPDATE_PROGRESS, serde_json::json!({ "percent": percent }));
        }
    };
    let on_finish = move || {
        let _ = finish_app.emit(UPDATE_PROGRESS, serde_json::json!({ "percent": 100, "restarting": true }));
    };
    // The package is megabytes: more time than the check, still never forever.
    update.timeout = Some(DOWNLOAD_TIMEOUT);
    let bytes = update
        .download(on_chunk, on_finish)
        .await
        .inspect_err(|e| log::error!("update download failed: {e}"))
        .map_err(|e| format!("The update didn't download: {e}"))?;
    // Last look before the installer quits Ensayo.
    if recording(app) {
        log::warn!("update not installed: a recording is running");
        return Err(STOP.into());
    }
    update.install(bytes).inspect_err(|e| log::error!("update install failed: {e}")).map_err(|e| format!("The update didn't install: {e}"))?;
    log::info!("update installed, restarting");
    app.restart()
}

/// The background check: 20 s after launch, then every 6 hours (`update_notice`). Not in debug builds
/// (`tauri dev`), where there is nothing real to update.
pub fn check_at_launch(app: &AppHandle) {
    if cfg!(debug_assertions) {
        log::info!("update checks: skipped (debug build)");
        return;
    }
    let app = app.clone();
    let started = now_secs();
    let _ = std::thread::Builder::new().name("ensayo-updates".into()).spawn(move || {
        let mut last: Option<Last> = None;
        loop {
            std::thread::sleep(Duration::from_secs(5));
            if !check_due(started, last, now_secs()) {
                continue;
            }
            let result = tauri::async_runtime::block_on(check(&app));
            last = Some(Last { at: now_secs(), ok: result.is_ok() });
        }
    });
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Saves the announced version. If neither file can be written it's still remembered until Ensayo quits; that is
/// logged once, not at every check.
fn remember_notified(state: &UpdateState, version: &str) {
    static WARNED: AtomicBool = AtomicBool::new(false);
    if let Err(e) = state.notice_files.write(version) {
        if !WARNED.swap(true, Ordering::Relaxed) {
            log::warn!("couldn't save which update was announced: {e}");
        }
    }
}
