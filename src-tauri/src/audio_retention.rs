//! Answer audio lives only on this computer, beside its rep by id: `<audio>/<session>/<n>.wav`. The retention
//! setting decides how long. Transcripts and scores stay; reps labelled for the eval set keep their audio always.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

pub fn audio_path(root: &Path, session: &str, n: u32) -> PathBuf {
    root.join(session).join(format!("{n}.wav"))
}

/// Removes audio older than `days` that is not in `keep` (`"<session>/<n>"`). Returns how many files went.
/// Empty session folders are removed too. Anything that is not a numbered `.wav` is left alone.
pub fn sweep(root: &Path, days: u32, keep: &HashSet<String>, now: SystemTime) -> usize {
    let Some(limit) = now.checked_sub(Duration::from_secs(u64::from(days) * 86_400)) else { return 0 };
    let Ok(sessions) = std::fs::read_dir(root) else { return 0 };
    let mut removed = 0;
    for s in sessions.flatten() {
        let dir = s.path();
        if !dir.is_dir() {
            continue;
        }
        let session = s.file_name().to_string_lossy().into_owned();
        if let Ok(files) = std::fs::read_dir(&dir) {
            for f in files.flatten() {
                let path = f.path();
                let stem = path.file_stem().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default();
                if path.extension().is_none_or(|e| e != "wav") || stem.parse::<u32>().is_err() || keep.contains(&format!("{session}/{stem}")) {
                    continue;
                }
                let old = f.metadata().and_then(|m| m.modified()).map(|t| t < limit).unwrap_or(false);
                if old && std::fs::remove_file(&path).is_ok() {
                    removed += 1;
                }
            }
        }
        let _ = std::fs::remove_dir(&dir); // only succeeds when empty
    }
    removed
}

/// Bytes of answer audio on this computer: every file under `root`.
pub fn audio_bytes(root: &Path) -> u64 {
    fn walk(dir: &Path) -> u64 {
        let Ok(entries) = std::fs::read_dir(dir) else { return 0 };
        entries.flatten().map(|e| match e.metadata() {
            Ok(m) if m.is_dir() => walk(&e.path()),
            Ok(m) => m.len(),
            Err(_) => 0,
        }).sum()
    }
    walk(root)
}

/// Removes every recording, the ones kept for the eval set too: the person asked for all of them to go. The text of
/// the answers stays. Returns how many files went.
pub fn remove_all(root: &Path) -> Result<usize, String> {
    let Ok(sessions) = std::fs::read_dir(root) else { return Ok(0) };
    let mut removed = 0;
    for s in sessions.flatten() {
        let dir = s.path();
        if !dir.is_dir() {
            continue;
        }
        if let Ok(files) = std::fs::read_dir(&dir) {
            for f in files.flatten() {
                let path = f.path();
                if path.extension().is_some_and(|e| e == "wav") {
                    std::fs::remove_file(&path).map_err(|e| format!("Couldn't remove {}: {e}", path.display()))?;
                    removed += 1;
                }
            }
        }
        let _ = std::fs::remove_dir(&dir); // only succeeds when empty
    }
    Ok(removed)
}

// ---------- the audio trash ----------
// A deleted session's recordings move to `<app local>/trash/audio/<session>/` (never into the data folder: audio is
// machine-local). They come back with the session if they are still on this computer, and go when the session is purged.

/// Moves a session's recordings into the audio trash. False when there were none.
pub fn move_to_trash(audio_root: &Path, trash_root: &Path, session: &str) -> std::io::Result<bool> {
    move_dir(&audio_root.join(session), &trash_root.join(session))
}

/// Moves a session's recordings back out of the audio trash. False when they are no longer on this computer.
pub fn restore_from_trash(audio_root: &Path, trash_root: &Path, session: &str) -> std::io::Result<bool> {
    move_dir(&trash_root.join(session), &audio_root.join(session))
}

/// Removes a session's trashed recordings for good.
pub fn remove_trashed(trash_root: &Path, session: &str) {
    let _ = std::fs::remove_dir_all(trash_root.join(session));
}

/// The sessions that have recordings in the audio trash.
pub fn trashed_ids(trash_root: &Path) -> Vec<String> {
    let Ok(rd) = std::fs::read_dir(trash_root) else { return vec![] };
    let mut v: Vec<String> = rd.flatten().filter(|e| e.path().is_dir()).map(|e| e.file_name().to_string_lossy().into_owned()).collect();
    v.sort();
    v
}

/// Moves the files of one folder into another (made if needed), then removes the empty folder.
fn move_dir(from: &Path, to: &Path) -> std::io::Result<bool> {
    let Ok(files) = std::fs::read_dir(from) else { return Ok(false) };
    std::fs::create_dir_all(to)?;
    let mut moved = false;
    for f in files.flatten() {
        if f.path().is_file() {
            std::fs::rename(f.path(), to.join(f.file_name()))?;
            moved = true;
        }
    }
    let _ = std::fs::remove_dir(from);
    Ok(moved)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn touch(root: &Path, session: &str, name: &str) {
        fs::create_dir_all(root.join(session)).unwrap();
        fs::write(root.join(session).join(name), b"RIFF").unwrap();
    }

    #[test]
    fn old_audio_goes_new_audio_stays_and_labelled_audio_is_kept() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        touch(root, "ses_a", "1.wav");
        touch(root, "ses_a", "2.wav");
        touch(root, "ses_b", "1.wav");
        touch(root, "ses_a", "notes.txt");
        let keep: HashSet<String> = ["ses_a/2".to_string()].into();
        // Ninety days from now, a 30-day setting makes everything old.
        let later = SystemTime::now() + Duration::from_secs(90 * 86_400);
        assert_eq!(sweep(root, 30, &keep, later), 2);
        assert!(!audio_path(root, "ses_a", 1).exists());
        assert!(audio_path(root, "ses_a", 2).exists(), "a labelled rep keeps its audio");
        assert!(root.join("ses_a/notes.txt").exists(), "not an audio file");
        assert!(!root.join("ses_b").exists(), "empty folders go");
        // Today, nothing is old.
        assert_eq!(sweep(root, 30, &keep, SystemTime::now()), 0);
    }

    #[test]
    fn the_size_counts_every_recording_and_removing_all_clears_them_even_labelled_ones() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        touch(root, "ses_a", "1.wav");
        touch(root, "ses_a", "2.wav");
        touch(root, "ses_b", "1.wav");
        assert_eq!(audio_bytes(root), 12);
        assert_eq!(remove_all(root).unwrap(), 3);
        assert_eq!(audio_bytes(root), 0);
        assert!(!root.join("ses_a").exists());
        assert_eq!(remove_all(root).unwrap(), 0);
    }

    #[test]
    fn a_missing_audio_folder_is_fine() {
        assert_eq!(audio_bytes(Path::new("/definitely/not/here")), 0);
        assert_eq!(remove_all(Path::new("/definitely/not/here")), Ok(0));
        assert_eq!(sweep(Path::new("/definitely/not/here"), 30, &HashSet::new(), SystemTime::now()), 0);
    }
}
