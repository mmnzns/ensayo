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

/// The application's fit with the targets is worked out again whenever the targets change (no new reading of any posting).
fn refit(storage: &Storage) -> StorageResult<()> {
    target_fit::refit_all(storage)
}

pub fn save_target_with(storage: &Storage, target: &Target) -> StorageResult<Target> {
    let saved = storage.save_target(target)?;
    refit(storage)?;
    Ok(saved)
}

pub fn duplicate_target_with(storage: &Storage, id: &str, name: Option<&str>) -> StorageResult<Target> {
    let saved = storage.duplicate_target(id, name)?;
    refit(storage)?;
    Ok(saved)
}

pub fn archive_target_with(storage: &Storage, id: &str, move_applications_to: Option<&str>) -> StorageResult<()> {
    storage.archive_target(id, move_applications_to)?;
    refit(storage)
}

pub fn restore_target_with(storage: &Storage, id: &str) -> StorageResult<Target> {
    let t = storage.restore_target(id)?;
    refit(storage)?;
    Ok(t)
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
    blocking(move || open_storage().and_then(|s| save_target_with(&s, &target)).map_err(plain)).await
}

#[tauri::command]
pub async fn duplicate_target(id: String, name: Option<String>) -> Result<Target, String> {
    blocking(move || open_storage().and_then(|s| duplicate_target_with(&s, &id, name.as_deref())).map_err(plain)).await
}

#[tauri::command]
pub async fn set_active_target(id: String) -> Result<You, String> {
    blocking(move || open_storage().and_then(|s| s.set_active_target(&id)).map_err(plain)).await
}

/// Puts a target away. A target with applications asks for `move_applications_to` (they move there); the last target in
/// use cannot be archived.
#[tauri::command]
pub async fn archive_target(id: String, move_applications_to: Option<String>) -> Result<(), String> {
    blocking(move || open_storage().and_then(|s| archive_target_with(&s, &id, move_applications_to.as_deref())).map_err(plain)).await
}

#[tauri::command]
pub async fn restore_target(id: String) -> Result<Target, String> {
    blocking(move || open_storage().and_then(|s| restore_target_with(&s, &id)).map_err(plain)).await
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::applications::NewApplication;
    use chrono::NaiveDate;

    fn setup() -> (tempfile::TempDir, Storage, String) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::init(dir.path().join("data")).unwrap();
        s.save_target(&Target { role: "Senior Lifecycle Marketing Manager".into(), role_family: "lifecycle".into(), sells_to: "b2c".into(), ..Default::default() }).unwrap();
        let app = s.create_application(NewApplication { company: "Northpine".into(), role: "Senior Marketing Operations Manager".into(), ..Default::default() }, NaiveDate::from_ymd_opt(2026, 10, 6).unwrap()).unwrap();
        s.save_application_text(&app.id, "jd.txt", "Own our marketing automation platform and lead scoring for B2B SaaS enterprise accounts. Pipeline reporting for the sales team.").unwrap();
        crate::applications::target_fit::refit_application(&s, &app.id).unwrap();
        (dir, s, app.id)
    }

    #[test]
    fn a_target_made_from_a_posting_is_the_best_fit_for_that_posting_straight_away() {
        let (_d, s, app) = setup();
        let before = s.application(&app).unwrap().target_fit.unwrap();
        assert_eq!(before.best_target_id, None, "nothing fits yet");
        let draft = crate::applications::target_fit::target_from_posting(&s, &app).unwrap();
        let saved = save_target_with(&s, &draft.target).unwrap();
        let fit = s.application(&app).unwrap().target_fit.unwrap();
        assert_eq!(fit.best_target_id.as_deref(), Some(saved.id.as_str()));
        assert!(fit.per_target.iter().any(|p| p.target_id == saved.id));
        s.update_application(&app, crate::storage::applications::AppPatch { target_id: Some(saved.id.clone()), ..Default::default() }).unwrap();
        assert_eq!(s.application_target(&s.application(&app).unwrap()).unwrap().as_deref(), Some(saved.id.as_str()));
    }

    #[test]
    fn editing_duplicating_archiving_and_restoring_a_target_all_refit() {
        let (_d, s, app) = setup();
        let first = s.targets().unwrap().remove(0);
        // Edit the lifecycle target into marketing ops: it now fits.
        let edited = save_target_with(&s, &Target { role_family: "marketing_ops".into(), sells_to: "b2b".into(), role: "Marketing Operations Manager".into(), ..first.clone() }).unwrap();
        assert_eq!(s.application(&app).unwrap().target_fit.unwrap().best_target_id.as_deref(), Some(edited.id.as_str()));
        let copy = duplicate_target_with(&s, &edited.id, None).unwrap();
        assert_eq!(s.application(&app).unwrap().target_fit.unwrap().per_target.len(), 2);
        assert!(copy.id != edited.id);
        archive_target_with(&s, &copy.id, None).unwrap();
        assert_eq!(s.application(&app).unwrap().target_fit.unwrap().per_target.len(), 1);
        restore_target_with(&s, &copy.id).unwrap();
        assert_eq!(s.application(&app).unwrap().target_fit.unwrap().per_target.len(), 2);
    }
}
