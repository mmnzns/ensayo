//! Changing the data folder. Pointing at a folder that already holds Ensayo's data just switches to it (the way a
//! second computer joins a synced folder). Pointing at an empty folder copies the current data there first. Anything
//! else is refused, so Ensayo never mixes its files in with someone's other work. The old folder is left as it was.

use super::{Result, StorageError};
use std::fs;
use std::path::Path;

/// What Ensayo keeps in a data folder, minus the lock file, which belongs to whoever has the folder open.
const DATA: [&str; 8] = ["profile.json", "profile.v0.json", "you.json", "targets", "bank", "applications", "sessions", "eval"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Moved {
    /// The current data was copied into the new folder.
    Copied,
    /// The new folder already had Ensayo's data, so Ensayo switches to it as it is.
    UsedExisting,
}

fn io(path: &Path, e: std::io::Error) -> StorageError {
    StorageError::Io(path.to_path_buf(), e.to_string())
}

fn copy_all(from: &Path, to: &Path) -> Result<()> {
    if from.is_dir() {
        fs::create_dir_all(to).map_err(|e| io(to, e))?;
        for entry in fs::read_dir(from).map_err(|e| io(from, e))?.flatten() {
            copy_all(&entry.path(), &to.join(entry.file_name()))?;
        }
    } else {
        fs::copy(from, to).map_err(|e| io(to, e))?;
    }
    Ok(())
}

/// Checks `to` and copies the data from `from` when `to` is empty. Does not change which folder Ensayo uses.
pub fn prepare_move(from: &Path, to: &Path) -> Result<Moved> {
    if !to.is_dir() {
        return Err(StorageError::Unavailable(to.to_path_buf()));
    }
    if let (Ok(a), Ok(b)) = (fs::canonicalize(from), fs::canonicalize(to)) {
        if a == b {
            return Err(StorageError::Invalid("That is the folder Ensayo already uses.".into()));
        }
    }
    if DATA.iter().any(|name| to.join(name).exists()) {
        return Ok(Moved::UsedExisting);
    }
    if fs::read_dir(to).map_err(|e| io(to, e))?.next().is_some() {
        return Err(StorageError::Invalid("That folder already has other files in it. Choose an empty folder, or one that already holds your Ensayo data.".into()));
    }
    for name in DATA {
        let source = from.join(name);
        if source.exists() {
            copy_all(&source, &to.join(name))?;
        }
    }
    Ok(Moved::Copied)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seeded() -> (tempfile::TempDir, std::path::PathBuf) {
        let d = tempfile::tempdir().unwrap();
        let from = d.path().join("old");
        fs::create_dir_all(from.join("bank/stories")).unwrap();
        fs::write(from.join("profile.json"), "{}").unwrap();
        fs::write(from.join("bank/stories/st_a.json"), "{\"a\":1}").unwrap();
        fs::write(from.join("lock.json"), "{}").unwrap();
        (d, from)
    }

    #[test]
    fn an_empty_folder_gets_a_copy_without_the_lock_and_the_old_one_stays() {
        let (d, from) = seeded();
        let to = d.path().join("new");
        fs::create_dir_all(&to).unwrap();
        assert_eq!(prepare_move(&from, &to).unwrap(), Moved::Copied);
        assert_eq!(fs::read_to_string(to.join("bank/stories/st_a.json")).unwrap(), "{\"a\":1}");
        assert!(to.join("profile.json").exists());
        assert!(!to.join("lock.json").exists(), "the lock belongs to whoever has the old folder open");
        assert!(from.join("profile.json").exists(), "the old copy is left alone");
    }

    #[test]
    fn you_the_targets_and_the_v0_backup_are_copied_too() {
        let (d, from) = seeded();
        fs::create_dir_all(from.join("targets")).unwrap();
        fs::write(from.join("targets/tg_1.json"), "{\"t\":1}").unwrap();
        fs::write(from.join("you.json"), "{\"y\":1}").unwrap();
        fs::write(from.join("profile.v0.json"), "{\"p\":1}").unwrap();
        let to = d.path().join("new");
        fs::create_dir_all(&to).unwrap();
        assert_eq!(prepare_move(&from, &to).unwrap(), Moved::Copied);
        assert_eq!(fs::read_to_string(to.join("targets/tg_1.json")).unwrap(), "{\"t\":1}");
        assert!(to.join("you.json").exists() && to.join("profile.v0.json").exists());
    }

    #[test]
    fn a_folder_that_only_holds_targets_counts_as_holding_ensayo_data() {
        let (d, from) = seeded();
        let to = d.path().join("drive");
        fs::create_dir_all(to.join("targets")).unwrap();
        assert_eq!(prepare_move(&from, &to).unwrap(), Moved::UsedExisting);
    }

    #[test]
    fn a_folder_that_already_holds_ensayo_data_is_used_as_it_is() {
        let (d, from) = seeded();
        let to = d.path().join("drive");
        fs::create_dir_all(to.join("bank")).unwrap();
        fs::write(to.join("bank/keep.txt"), "x").unwrap();
        assert_eq!(prepare_move(&from, &to).unwrap(), Moved::UsedExisting);
        assert!(!to.join("profile.json").exists(), "nothing is copied over data that is already there");
    }

    #[test]
    fn a_folder_with_other_files_or_that_is_not_there_is_refused() {
        let (d, from) = seeded();
        let busy = d.path().join("busy");
        fs::create_dir_all(&busy).unwrap();
        fs::write(busy.join("taxes.pdf"), "x").unwrap();
        let err = prepare_move(&from, &busy).unwrap_err().to_string();
        assert!(err.contains("other files"));
        assert!(matches!(prepare_move(&from, &d.path().join("missing")), Err(StorageError::Unavailable(_))));
        assert!(!d.path().join("missing").exists(), "a folder that is not there is never created");
    }

    #[test]
    fn the_folder_already_in_use_is_refused() {
        let (_d, from) = seeded();
        assert!(prepare_move(&from, &from).unwrap_err().to_string().contains("already uses"));
    }
}
