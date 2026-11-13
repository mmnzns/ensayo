//! Changing the data folder. Pointing at a folder that already holds Ensayo's data just switches to it (the way a
//! second computer joins a synced folder). Pointing at an empty folder copies the current data there first. Anything
//! else is refused, so Ensayo never mixes its files in with someone's other work. The old folder is left as it was.

use super::{Result, StorageError};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

/// What Ensayo keeps in a data folder, minus the lock file, which belongs to whoever has the folder open.
const DATA: [&str; 9] = ["profile.json", "profile.v0.json", "you.json", "targets", "bank", "applications", "sessions", "eval", "trash"];

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

/// True when `dir` holds anything of Ensayo's (a folder Ensayo can use as it is).
pub fn holds_data(dir: &Path) -> bool {
    DATA.iter().any(|name| dir.join(name).exists())
}

/// The suffix of a folder that is still being copied. Such a folder is never a finished move.
const PARTIAL: &str = ".partial";

/// The sibling folder `to` is copied into first.
pub fn partial_of(to: &Path) -> std::path::PathBuf {
    let mut name = to.file_name().map(|n| n.to_os_string()).unwrap_or_default();
    name.push(PARTIAL);
    to.with_file_name(name)
}

/// Every file under `root` (only the parts that are Ensayo's data) with its size, by path inside `root`.
fn summary(root: &Path) -> Result<BTreeMap<String, u64>> {
    fn walk(base: &Path, path: &Path, out: &mut BTreeMap<String, u64>) -> Result<()> {
        if path.is_dir() {
            for entry in fs::read_dir(path).map_err(|e| io(path, e))?.flatten() {
                walk(base, &entry.path(), out)?;
            }
        } else {
            let size = fs::metadata(path).map_err(|e| io(path, e))?.len();
            out.insert(path.strip_prefix(base).unwrap_or(path).to_string_lossy().replace('\\', "/"), size);
        }
        Ok(())
    }
    let mut out = BTreeMap::new();
    for name in DATA {
        let p = root.join(name);
        if p.exists() {
            walk(root, &p, &mut out)?;
        }
    }
    Ok(out)
}

/// Checks `to` and copies the data from `from` when `to` is empty. Does not change which folder Ensayo uses.
///
/// The copy goes into a sibling `<to>.partial` folder first. Only when every file is there with the same size is
/// `.partial` renamed to `to`, so a move that is interrupted leaves a `.partial` folder and never a half-filled `to`.
/// The next attempt deletes the `.partial` folder and starts again. A `.partial` folder is never taken as data.
pub fn prepare_move(from: &Path, to: &Path) -> Result<Moved> {
    if to.file_name().is_some_and(|n| n.to_string_lossy().ends_with(PARTIAL)) {
        return Err(StorageError::Invalid("That folder looks like an unfinished copy. Choose another folder.".into()));
    }
    if !to.is_dir() {
        return Err(StorageError::Unavailable(to.to_path_buf()));
    }
    if let (Ok(a), Ok(b)) = (fs::canonicalize(from), fs::canonicalize(to)) {
        if a == b {
            return Err(StorageError::Invalid("That is the folder Ensayo already uses.".into()));
        }
    }
    if holds_data(to) {
        return Ok(Moved::UsedExisting);
    }
    if fs::read_dir(to).map_err(|e| io(to, e))?.next().is_some() {
        return Err(StorageError::Invalid("That folder already has other files in it. Choose an empty folder, or one that already holds your Ensayo data.".into()));
    }
    let partial = partial_of(to);
    if partial.exists() {
        fs::remove_dir_all(&partial).map_err(|e| io(&partial, e))?;
    }
    fs::create_dir(&partial).map_err(|e| io(&partial, e))?;
    let copied = (|| -> Result<()> {
        for name in DATA {
            let source = from.join(name);
            if source.exists() {
                copy_all(&source, &partial.join(name))?;
            }
        }
        if summary(from)? != summary(&partial)? {
            return Err(StorageError::Invalid("The copy didn't match your data, so nothing was moved. Try again.".into()));
        }
        Ok(())
    })();
    if let Err(e) = copied {
        let _ = fs::remove_dir_all(&partial);
        return Err(e);
    }
    // `to` is empty (checked above): drop it so the finished copy can take its name (Windows won't rename over a folder).
    fs::remove_dir(to).map_err(|e| io(to, e))?;
    if let Err(e) = fs::rename(&partial, to) {
        let _ = fs::create_dir_all(to);
        return Err(io(to, e));
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

    #[test]
    fn the_copy_goes_through_a_partial_folder_that_is_gone_afterwards() {
        let (d, from) = seeded();
        let to = d.path().join("new");
        fs::create_dir_all(&to).unwrap();
        assert_eq!(prepare_move(&from, &to).unwrap(), Moved::Copied);
        assert!(!partial_of(&to).exists(), "renamed into place");
        assert_eq!(fs::read_to_string(to.join("profile.json")).unwrap(), "{}");
    }

    #[test]
    fn an_interrupted_move_is_redone_and_never_accepted() {
        let (d, from) = seeded();
        let to = d.path().join("new");
        fs::create_dir_all(&to).unwrap();
        // What an interrupted move leaves: a half-filled .partial beside the (empty) target.
        let partial = partial_of(&to);
        fs::create_dir_all(partial.join("bank")).unwrap();
        fs::write(partial.join("profile.json"), "half").unwrap();
        assert_eq!(prepare_move(&from, &to).unwrap(), Moved::Copied);
        assert_eq!(fs::read_to_string(to.join("profile.json")).unwrap(), "{}", "redone from the source");
        assert!(!partial.exists());
        // A .partial folder is never taken as the destination, even with data in it.
        fs::create_dir_all(partial.join("bank")).unwrap();
        assert!(matches!(prepare_move(&from, &partial), Err(StorageError::Invalid(_))));
    }

    #[test]
    fn the_copy_check_sees_sizes_and_a_finished_copy_matches_its_source() {
        let (d, from) = seeded();
        let a = summary(&from).unwrap();
        fs::write(from.join("profile.json"), "{ }").unwrap();
        let b = summary(&from).unwrap();
        assert_ne!(a, b, "sizes are part of the check");
        let to = d.path().join("new");
        fs::create_dir_all(&to).unwrap();
        assert_eq!(prepare_move(&from, &to).unwrap(), Moved::Copied);
        assert_eq!(summary(&from).unwrap(), summary(&to).unwrap());
    }
}
