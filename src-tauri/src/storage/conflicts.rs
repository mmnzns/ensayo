//! Sync conflict copies. Drives that sync a folder (Google Drive, Dropbox, iCloud) make a second file when two
//! computers changed the same one: `story (1).json`, `story (Miguel's conflicted copy 2026-10-21).json`, `story 2.json`.
//! Ensayo shows them and the user picks one. Nothing is ever merged silently (Build Plan, Sync-safe rules).

use super::io::{atomic_write, is_safe_id};
use super::{Result, Storage, StorageError};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Conflict {
    /// "story", "method", "target" or "profile" (the profile's files: `you.json`, and `profile.json` before it moved).
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

fn modified(path: &Path) -> Option<String> {
    let t = fs::metadata(path).ok()?.modified().ok()?;
    Some(DateTime::<Utc>::from(t).to_rfc3339())
}

impl Storage {
    /// Every conflict copy of the profile files and in the story, method and target folders.
    pub fn conflicts(&self) -> Result<Vec<Conflict>> {
        let folders: [(PathBuf, &str); 4] = [(self.root().to_path_buf(), "profile"), (self.root().join("bank/stories"), "story"), (self.root().join("bank/methods"), "method"), (self.root().join("targets"), "target")];
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
        let copy = put(&s, "bank/stories/st_a (1).json", "copy");
        s.resolve_conflict(&copy, Keep::Copy).unwrap();
        assert!(!copy.exists());
        assert_eq!(fs::read_to_string(orig).unwrap(), "copy");
    }

    #[test]
    fn a_copy_with_no_original_is_reported_and_can_be_kept() {
        let (_d, s) = fresh();
        let copy = put(&s, "bank/stories/st_z (1).json", "only");
        let found = s.conflicts().unwrap();
        assert_eq!(found.len(), 1);
        assert!(!found[0].original_exists);
        assert!(s.resolve_conflict(&copy, Keep::Original).is_err(), "there is no original to keep");
        s.resolve_conflict(&copy, Keep::Copy).unwrap();
        assert_eq!(fs::read_to_string(s.root().join("bank/stories/st_z.json")).unwrap(), "only");
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
