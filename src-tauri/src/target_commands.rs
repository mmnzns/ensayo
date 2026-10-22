//! Tauri commands for you and your targets (v0.1). The rules live in `storage::targets`; these pick the data folder and
//! turn errors into plain strings. Every command is async and does its file work on a blocking thread.

use crate::applications::target_fit::{self, TargetDraft};
use crate::data_commands::{blocking, open_storage, plain};
use crate::storage::targets::{Target, You};
use crate::storage::{Result as StorageResult, Storage};
use serde::Serialize;

/// What `load_targets` returns, and what the screens take after every target command.
#[derive(Debug, Serialize)]
pub struct TargetsBundle {
    pub you: Option<You>,
    /// Every target, archived ones included, in the order they were made.
    pub targets: Vec<Target>,
    #[serde(rename = "targetsNotePending")]
    pub targets_note_pending: bool,
}

pub fn bundle_of(storage: &Storage) -> StorageResult<TargetsBundle> {
    let you = storage.you()?;
    let pending = you.as_ref().is_some_and(|y| y.targets_note_pending);
    Ok(TargetsBundle { you, targets: storage.targets()?, targets_note_pending: pending })
}

#[tauri::command]
pub async fn load_targets() -> Result<TargetsBundle, String> {
    blocking(|| open_storage().and_then(|s| bundle_of(&s)).map_err(plain)).await
}

/// Saves your name, full name and habits. The active target only changes to one that can be used.
#[tauri::command]
pub async fn save_you(you: You) -> Result<You, String> {
    blocking(move || open_storage().and_then(|s| s.save_you(&you)).map_err(plain)).await
}

/// Saves a target; an empty `id` makes a new one (next colour, name from the role when none was typed).
#[tauri::command]
pub async fn save_target(target: Target) -> Result<Target, String> {
    blocking(move || open_storage().and_then(|s| s.save_target(&target)).map_err(plain)).await
}

#[tauri::command]
pub async fn duplicate_target(id: String, name: Option<String>) -> Result<Target, String> {
    blocking(move || open_storage().and_then(|s| s.duplicate_target(&id, name.as_deref())).map_err(plain)).await
}

#[tauri::command]
pub async fn set_active_target(id: String) -> Result<You, String> {
    blocking(move || open_storage().and_then(|s| s.set_active_target(&id)).map_err(plain)).await
}

/// Puts a target away. A target with applications asks for `move_applications_to` (they move there); the last target in
/// use cannot be archived.
#[tauri::command]
pub async fn archive_target(id: String, move_applications_to: Option<String>) -> Result<(), String> {
    blocking(move || open_storage().and_then(|s| s.archive_target(&id, move_applications_to.as_deref())).map_err(plain)).await
}

#[tauri::command]
pub async fn restore_target(id: String) -> Result<Target, String> {
    blocking(move || open_storage().and_then(|s| s.restore_target(&id)).map_err(plain)).await
}

#[tauri::command]
pub async fn ack_targets_note() -> Result<(), String> {
    blocking(|| open_storage().and_then(|s| s.ack_targets_note()).map_err(plain)).await
}

/// `priority` is `pin`, `hide` or `none`.
#[tauri::command]
pub async fn set_story_priority(target_id: String, story_id: String, priority: String) -> Result<Target, String> {
    blocking(move || open_storage().and_then(|s| s.set_story_priority(&target_id, &story_id, &priority)).map_err(plain)).await
}

/// A new target filled in from an application's posting. Nothing is saved, and Ensayo never writes the pitch: the closest
/// target's is copied in and `pitchCopied` says so.
#[tauri::command]
pub async fn target_from_posting(application_id: String) -> Result<TargetDraft, String> {
    blocking(move || open_storage().and_then(|s| target_fit::target_from_posting(&s, &application_id)).map_err(plain)).await
}
