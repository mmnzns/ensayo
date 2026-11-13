//! Sync conflict copies. Drives that sync a folder (Google Drive, Dropbox, iCloud) make a second file when two
//! computers changed the same one: `story (1).json`, `story (Miguel's conflicted copy 2026-10-21).json`, `story 2.json`.
//! Ensayo shows them and the user picks one. Nothing is ever merged silently (Build Plan, Sync-safe rules).

use super::io::{atomic_write, is_safe_id};
use super::migrate;
use super::model::{Method, Profile, Story};
use super::reps::{Rep, Session};
use super::applications::AppRecord;
use super::targets::{Target, You};
use super::versioned::load_record_from_str;
use super::{Result, Storage, StorageError};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Conflict {
    /// "story", "method", "target", "profile" (the profile's files: `you.json`, and `profile.json` before it moved),
    /// "application" (a file inside `applications/<id>/`) or "session" (a file inside `sessions/<id>/`).
    pub kind: String,
    pub original: PathBuf,
    pub copy: PathBuf,
    pub original_exists: bool,
    pub original_modified: Option<String>,
    pub copy_modified: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Keep {
    Original,
    Copy,
}

/// The name a synced drive would have copied from, or `None` for an ordinary file name.
fn original_stem(stem: &str) -> Option<String> {
    let base = if stem.ends_with(')') {
        stem.rfind(" (").map(|i| &stem[..i])
    } else {
        stem.rsplit_once(' ').filter(|(_, n)| !n.is_empty() && n.chars().all(|c| c.is_ascii_digit())).map(|(b, _)| b)
    }?;
    is_safe_id(base).then(|| base.to_string())
}

/// True when `file_name` is a sync copy of `<base>.json` (`you (1).json`, `you 2.json`, `you (Miguel's conflicted copy).json`).
pub(crate) fn is_copy_of(file_name: &str, base: &str) -> bool {
    let Some(stem) = file_name.strip_suffix(".json") else { return false };
    let Some(rest) = stem.strip_prefix(base).and_then(|r| r.strip_prefix(' ')) else { return false };
    (rest.starts_with('(') && rest.ends_with(')')) || (!rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit()))
}

fn modified(path: &Path) -> Option<String> {
    let t = fs::metadata(path).ok()?.modified().ok()?;
    Some(DateTime::<Utc>::from(t).to_rfc3339())
}

/// Reads `text` the way the file `<base>.json` of this kind is read, and says whether it loads.
fn check_loads(kind: &str, base: &str, text: &str) -> Result<()> {
    let value = |text: &str| load_record_from_str::<serde_json::Value>(text, migrate::unchanged).map(|_| ());
    match (kind, base) {
        ("story", _) => load_record_from_str::<Story>(text, migrate::story).map(|_| ()),
        ("method", _) => load_record_from_str::<Method>(text, migrate::unchanged).map(|_| ()),
        ("target", _) => load_record_from_str::<Target>(text, migrate::unchanged).map(|_| ()),
        ("profile", "you") => load_record_from_str::<You>(text, migrate::unchanged).map(|_| ()),
        ("profile", _) => load_record_from_str::<Profile>(text, migrate::unchanged).map(|_| ()),
        ("application", "application") => load_record_from_str::<AppRecord>(text, migrate::application).map(|_| ()),
        ("session", "session") => load_record_from_str::<Session>(text, migrate::unchanged).map(|_| ()),
        ("session", "rep") => load_record_from_str::<Rep>(text, migrate::unchanged).map(|_| ()),
        // The other files next to an application or a session: they must at least be saved records of a known format.
        _ => value(text),
    }
}

impl Storage {
    /// Every conflict copy of the profile files and in the story, method and target folders, and inside the folder of
    /// each application and each session.
    pub fn conflicts(&self) -> Result<Vec<Conflict>> {
        let mut folders: Vec<(PathBuf, &str)> = vec![(self.root().to_path_buf(), "profile"), (self.root().join("bank/stories"), "story"), (self.root().join("bank/methods"), "method"), (self.root().join("targets"), "target")];
        for (parent, kind) in [("applications", "application"), ("sessions", "session")] {
            let mut stack: Vec<(PathBuf, usize)> = vec![(self.root().join(parent), 0)];
            while let Some((dir, depth)) = stack.pop() {
                let Ok(entries) = fs::read_dir(&dir) else { continue };
                for e in entries.filter_map(|e| e.ok()) {
                    // A synced drive's conflict copy of a whole folder is not a record: only the folders themselves are walked.
                    if e.path().is_dir() && depth < 3 && !e.file_name().to_string_lossy().starts_with('.') {
                        folders.push((e.path(), kind));
                        stack.push((e.path(), depth + 1));
                    }
                }
            }
        }
        let mut out = vec![];
        for (dir, kind) in folders {
            let Ok(entries) = fs::read_dir(&dir) else { continue };
            let mut names: Vec<_> = entries.filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.is_file() && p.extension().is_some_and(|x| x == "json")).collect();
            names.sort();
            for copy in names {
                let stem = copy.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
                if stem.starts_with('.') {
                    continue;
                }
                let Some(base) = original_stem(&stem) else { continue };
                if kind == "profile" && base != "profile" && base != "you" {
                    continue;
                }
                let original = dir.join(format!("{base}.json"));
                out.push(Conflict { kind: kind.into(), original_exists: original.is_file(), original_modified: modified(&original), copy_modified: modified(&copy), original, copy });
            }
        }
        Ok(out)
    }

    /// Settles one conflict: keep the original (the copy is deleted) or keep the copy (it replaces the original).
    /// Only a conflict copy found inside the data folder can be settled.
    pub fn resolve_conflict(&self, copy: &Path, keep: Keep) -> Result<()> {
        self.ensure_writable()?;
        let same = |a: &Path, b: &Path| a == b || fs::canonicalize(a).ok().zip(fs::canonicalize(b).ok()).is_some_and(|(x, y)| x == y);
        let conflict = self.conflicts()?.into_iter().find(|c| same(&c.copy, copy)).ok_or_else(|| StorageError::Invalid(format!("{} is not a conflict copy", copy.display())))?;
        match keep {
            Keep::Original => {
                if !conflict.original_exists {
                    return Err(StorageError::Invalid("there is no original to keep".into()));
                }
            }
            Keep::Copy => {
                let bytes = fs::read(&conflict.copy).map_err(|e| StorageError::Io(conflict.copy.clone(), e.to_string()))?;
                // The copy goes through the loader the original would: one that doesn't read is never put in its place.
                let base = conflict.original.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
                if check_loads(&conflict.kind, &base, &String::from_utf8_lossy(&bytes)).is_err() {
                    return Err(StorageError::Invalid("That copy can't be read as saved work, so it was not used. Keep the original instead.".into()));
                }
                atomic_write(&conflict.original, &bytes)?;
            }
        }
        fs::remove_file(&conflict.copy).map_err(|e| StorageError::Io(conflict.copy.clone(), e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::Storage;
    use std::fs;

    fn fresh() -> (tempfile::TempDir, Storage) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::init(dir.path().join("data")).unwrap();
        (dir, s)
    }

    fn put(s: &Storage, rel: &str, text: &str) -> std::path::PathBuf {
        let p = s.root().join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(&p, text).unwrap();
        p
    }

    const STORY_COPY: &str = r#"{"schema_version": 2, "id": "st_a", "title": "The copy"}"#;

    #[test]
    fn copies_inside_an_application_and_a_session_folder_are_found() {
        let (_d, s) = fresh();
        put(&s, "applications/app_1/application.json", "x");
        put(&s, "applications/app_1/application (1).json", "x");
        put(&s, "applications/app_1/claims (Miguel's conflicted copy 2026-10-21).json", "x");
        put(&s, "applications/app_1/resume/resume 2.json", "x");
        put(&s, "sessions/ses_1/session (1).json", "x");
        put(&s, "sessions/ses_1/reps/1/rep (1).json", "x");
        put(&s, "sessions/ses_1/reps/1/rep.json", "x");
        let mut found: Vec<(String, String)> = s.conflicts().unwrap().into_iter().map(|c| (c.kind, c.original.file_name().unwrap().to_string_lossy().into_owned())).collect();
        found.sort();
        let want: Vec<(String, String)> = [("application", "application.json"), ("application", "claims.json"), ("application", "resume.json"), ("session", "rep.json"), ("session", "session.json")].iter().map(|(a, b)| (a.to_string(), b.to_string())).collect();
        assert_eq!(found, want);
    }

    #[test]
    fn keeping_a_copy_that_does_not_load_is_refused_and_changes_nothing() {
        let (_d, s) = fresh();
        let orig = put(&s, "bank/stories/st_a.json", STORY_COPY);
        for bad in ["not json at all", r#"{"schema_version": 2, "title": "no id"}"#, r#"{"schema_version": 99, "id": "st_a", "title": "newer"}"#] {
            let copy = put(&s, "bank/stories/st_a (1).json", bad);
            assert!(s.resolve_conflict(&copy, Keep::Copy).is_err(), "{bad}");
            assert!(copy.exists(), "the copy stays so the person can look at it");
            assert_eq!(fs::read_to_string(&orig).unwrap(), STORY_COPY);
        }
        // An application's file is read the way an application is.
        let app = put(&s, "applications/app_1/application.json", "orig");
        let app_copy = put(&s, "applications/app_1/application (1).json", r#"{"id": "app_1"}"#);
        assert!(s.resolve_conflict(&app_copy, Keep::Copy).is_err());
        assert_eq!(fs::read_to_string(app).unwrap(), "orig");
        // A session file that is a saved record of a known format is accepted.
        let sess = put(&s, "sessions/ses_1/debrief.json", "{}");
        let sess_copy = put(&s, "sessions/ses_1/debrief (1).json", r#"{"schema_version": 2, "note": "ok"}"#);
        s.resolve_conflict(&sess_copy, Keep::Copy).unwrap();
        assert!(fs::read_to_string(sess).unwrap().contains("note"));
    }

    #[test]
    fn is_copy_of_matches_the_drive_naming_and_nothing_else() {
        assert!(is_copy_of("you (1).json", "you") && is_copy_of("you 2.json", "you") && is_copy_of("profile.v0 (1).json", "profile.v0"));
        assert!(is_copy_of("you (Miguel's conflicted copy 2026-10-21).json", "you"));
        assert!(!is_copy_of("you.json", "you") && !is_copy_of("your notes.json", "you") && !is_copy_of("you x.json", "you") && !is_copy_of("you (1).txt", "you"));
    }

    #[test]
    fn copies_made_by_synced_drives_are_found_next_to_their_originals() {
        let (_d, s) = fresh();
        put(&s, "bank/stories/st_a.json", "orig");
        put(&s, "bank/stories/st_a (1).json", "copy1");
        put(&s, "bank/stories/st_a (Miguel's conflicted copy 2026-10-21).json", "copy2");
        put(&s, "bank/stories/st_a 2.json", "copy3");
        put(&s, "bank/stories/st_b.json", "fine");
        let found = s.conflicts().unwrap();
        assert_eq!(found.len(), 3, "{found:?}");
        assert!(found.iter().all(|c| c.original.ends_with("st_a.json") && c.original_exists && c.kind == "story"));
    }

    #[test]
    fn copies_of_you_and_of_a_target_are_found_too() {
        let (_d, s) = fresh();
        put(&s, "you.json", "orig");
        put(&s, "you (1).json", "copy");
        put(&s, "targets/tg_1.json", "orig");
        put(&s, "targets/tg_1 (1).json", "copy");
        put(&s, "other (1).json", "not ours");
        let found = s.conflicts().unwrap();
        let mut kinds: Vec<_> = found.iter().map(|c| (c.kind.clone(), c.original.file_name().unwrap().to_string_lossy().into_owned())).collect();
        kinds.sort();
        assert_eq!(kinds, vec![("profile".to_string(), "you.json".to_string()), ("target".to_string(), "tg_1.json".to_string())]);
    }

    #[test]
    fn ordinary_files_and_temp_files_are_not_conflicts() {
        let (_d, s) = fresh();
        put(&s, "bank/stories/st_a.json", "x");
        put(&s, "bank/methods/problem_solving.json", "x");
        put(&s, "profile.json", "x");
        put(&s, "bank/stories/.st_a.json.w_123.tmp", "x");
        put(&s, "notes.txt", "x");
        assert!(s.conflicts().unwrap().is_empty());
    }

    #[test]
    fn keeping_the_original_deletes_the_copy_and_changes_nothing_else() {
        let (_d, s) = fresh();
        let orig = put(&s, "bank/stories/st_a.json", "orig");
        let copy = put(&s, "bank/stories/st_a (1).json", "copy");
        s.resolve_conflict(&copy, Keep::Original).unwrap();
        assert!(!copy.exists());
        assert_eq!(fs::read_to_string(orig).unwrap(), "orig");
    }

    #[test]
    fn keeping_the_copy_replaces_the_original_and_removes_the_copy_without_merging() {
        let (_d, s) = fresh();
        let orig = put(&s, "bank/stories/st_a.json", "orig");
        let copy = put(&s, "bank/stories/st_a (1).json", STORY_COPY);
        s.resolve_conflict(&copy, Keep::Copy).unwrap();
        assert!(!copy.exists());
        assert_eq!(fs::read_to_string(orig).unwrap(), STORY_COPY);
    }

    #[test]
    fn a_copy_with_no_original_is_reported_and_can_be_kept() {
        let (_d, s) = fresh();
        let copy = put(&s, "bank/stories/st_z (1).json", STORY_COPY);
        let found = s.conflicts().unwrap();
        assert_eq!(found.len(), 1);
        assert!(!found[0].original_exists);
        assert!(s.resolve_conflict(&copy, Keep::Original).is_err(), "there is no original to keep");
        s.resolve_conflict(&copy, Keep::Copy).unwrap();
        assert_eq!(fs::read_to_string(s.root().join("bank/stories/st_z.json")).unwrap(), STORY_COPY);
        assert!(!copy.exists());
    }

    #[test]
    fn only_detected_conflicts_inside_the_data_folder_can_be_resolved() {
        let (d, s) = fresh();
        let outside = d.path().join("elsewhere (1).json");
        fs::write(&outside, "x").unwrap();
        assert!(s.resolve_conflict(&outside, Keep::Copy).is_err());
        assert!(outside.exists());
        let normal = put(&s, "bank/stories/st_a.json", "x");
        assert!(s.resolve_conflict(&normal, Keep::Original).is_err());
        assert!(normal.exists(), "a normal file is never deleted as a conflict");
    }
}
