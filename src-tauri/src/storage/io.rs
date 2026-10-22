//! File helpers: atomic writes, listing, ids. Plain files only, so a synced drive can move them around safely.

use super::{Result, StorageError};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static COUNTER: AtomicU64 = AtomicU64::new(0);

fn base36(mut n: u128) -> String {
    const DIGITS: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if n == 0 {
        return "0".into();
    }
    let mut out = Vec::new();
    while n > 0 {
        out.push(DIGITS[(n % 36) as usize]);
        n /= 36;
    }
    out.reverse();
    String::from_utf8(out).unwrap_or_default()
}

/// A new record id such as `st_m1x9k2a40`: the prefix, then the clock and a counter in base 36.
pub fn new_id(prefix: &str) -> String {
    let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}_{}{}", base36(nanos), base36(n as u128))
}

/// True for ids that are safe to use as a file name: letters, digits, `_` and `-`, nothing else.
pub fn is_safe_id(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// Writes to a temp file in the same folder, flushes it to disk, then renames it over the target. A crash or a sync
/// in the middle never leaves a half-written file.
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let io = |e: std::io::Error| StorageError::Io(path.to_path_buf(), e.to_string());
    let parent = path.parent().ok_or_else(|| StorageError::Invalid(format!("{} has no folder", path.display())))?;
    fs::create_dir_all(parent).map_err(io)?;
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let tmp = parent.join(format!(".{name}.{}.tmp", new_id("w")));
    let result = (|| -> std::io::Result<()> {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        fs::rename(&tmp, path)
    })();
    if let Err(e) = result {
        let _ = fs::remove_file(&tmp);
        return Err(io(e));
    }
    Ok(())
}

/// The file's text, or `None` when it does not exist.
pub fn read_text(path: &Path) -> Result<Option<String>> {
    match fs::read_to_string(path) {
        Ok(t) => Ok(Some(t)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(StorageError::Io(path.to_path_buf(), e.to_string())),
    }
}

/// The `*.json` files directly inside a folder, sorted by name. A folder that is not there is an empty list.
pub fn list_json(dir: &Path) -> Result<Vec<PathBuf>> {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(StorageError::Io(dir.to_path_buf(), e.to_string())),
    };
    let mut out: Vec<PathBuf> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_file() && p.extension().is_some_and(|x| x == "json") && !p.file_name().is_some_and(|n| n.to_string_lossy().starts_with('.')))
        .collect();
    out.sort();
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn a_write_creates_parent_folders_and_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a/b/c.json");
        atomic_write(&path, b"{}").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "{}");
    }

    #[test]
    fn overwriting_replaces_the_whole_content_and_leaves_no_temp_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("x.json");
        atomic_write(&path, b"a long first version of the file").unwrap();
        atomic_write(&path, b"short").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "short");
        let names: Vec<_> = fs::read_dir(dir.path()).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
        assert_eq!(names, vec!["x.json"]);
    }

    #[test]
    fn a_failed_write_leaves_nothing_behind() {
        let dir = tempfile::tempdir().unwrap();
        let blocker = dir.path().join("file");
        fs::write(&blocker, "not a folder").unwrap();
        assert!(atomic_write(&blocker.join("inside.json"), b"{}").is_err());
        let names: Vec<_> = fs::read_dir(dir.path()).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
        assert_eq!(names, vec!["file"]);
    }

    #[test]
    fn listing_returns_only_json_files_sorted_and_skips_temp_files_and_folders() {
        let dir = tempfile::tempdir().unwrap();
        for n in ["b.json", "a.json", "c.txt", ".d.json.123.tmp", "e.json.tmp"] {
            fs::write(dir.path().join(n), "x").unwrap();
        }
        fs::create_dir(dir.path().join("sub.json")).unwrap();
        let names: Vec<_> = list_json(dir.path()).unwrap().iter().map(|p| p.file_name().unwrap().to_string_lossy().into_owned()).collect();
        assert_eq!(names, vec!["a.json", "b.json"]);
    }

    #[test]
    fn listing_a_missing_folder_is_empty_and_reading_a_missing_file_is_none() {
        let dir = tempfile::tempdir().unwrap();
        assert!(list_json(&dir.path().join("nope")).unwrap().is_empty());
        assert_eq!(read_text(&dir.path().join("nope.json")).unwrap(), None);
    }

    #[test]
    fn ids_have_a_prefix_use_only_safe_characters_and_do_not_repeat() {
        let mut seen = std::collections::HashSet::new();
        for _ in 0..1000 {
            let id = new_id("st");
            assert!(id.starts_with("st_"), "{id}");
            assert!(id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_'), "{id}");
            assert!(seen.insert(id));
        }
    }

    #[test]
    fn only_plain_ids_are_accepted_as_file_names() {
        for ok in ["st_abc123", "problem_solving", "a-b_c"] {
            assert!(is_safe_id(ok), "{ok}");
        }
        for bad in ["", "../x", "a/b", "a\\b", ".hidden", "a b", "x.json"] {
            assert!(!is_safe_id(bad), "{bad}");
        }
    }
}
