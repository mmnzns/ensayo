//! Tauri commands for backup and restore. The logic is in `backup`; these pick the data folder and the machine-local
//! folder for safety copies. Async, with the file work on a blocking thread.

use crate::backup::{self, BackupInfo, Manifest, Mode, RestoreReport};
use crate::data_commands::{blocking, open_storage, plain};
use crate::paths;
use chrono::Utc;
use std::path::PathBuf;

type Cmd<T> = std::result::Result<T, String>;

/// Where the automatic copy made before a replace goes: on this computer, never in the (possibly synced) data folder.
fn safety_dir() -> PathBuf {
    paths::app_local().join("backups")
}

/// Writes a zip of the data folder to `path` and says what went in.
#[tauri::command]
pub async fn backup_data(path: PathBuf) -> Cmd<Manifest> {
    blocking(move || {
        let storage = open_storage().map_err(plain)?;
        backup::create_backup(storage.root(), &path, Utc::now())
    })
    .await
}

/// What is in a backup, without touching the data folder.
#[tauri::command]
pub async fn inspect_backup(path: PathBuf) -> Cmd<BackupInfo> {
    blocking(move || backup::inspect(&path)).await
}

/// `mode` is "merge" or "replace". The window reloads its data afterwards.
#[tauri::command]
pub async fn restore_backup(path: PathBuf, mode: String) -> Cmd<RestoreReport> {
    blocking(move || {
        let mode = Mode::parse(&mode)?;
        let storage = open_storage().map_err(plain)?;
        backup::restore(&path, storage.root(), mode, &safety_dir(), Utc::now())
    })
    .await
}
