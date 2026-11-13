//! Answer audio lives only on this computer, beside its rep by id: `<audio>/<session>/<n>.wav`. The retention
//! setting decides how long. Transcripts and scores stay; reps labelled for the eval set keep their audio always.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

pub fn audio_path(root: &Path, session: &str, n: u32) -> PathBuf {
    root.join(session).join(format!("{n}.wav"))
}

/// How long a loose recording may sit in the audio folder before it counts as left behind by a crash.
const STRAY_AGE: Duration = Duration::from_secs(600);

/// Removes loose `rec-*.wav` files in the audio root (a recording that never reached a session folder, left by a
/// crash). Nothing goes while a capture is active. Otherwise a file goes when it is older than ten minutes, or at
/// once when `at_once` is set (retention "Don't keep"). Returns how many went. Session folders are not touched.
pub fn remove_stray(root: &Path, now: SystemTime, recording: bool, at_once: bool) -> usize {
    if recording {
        return 0;
    }
    let Ok(entries) = std::fs::read_dir(root) else { return 0 };
    let limit = now.checked_sub(STRAY_AGE);
    let mut removed = 0;
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if !(name.starts_with("rec-") && name.ends_with(".wav")) || !e.path().is_file() {
            continue;
        }
        let old = match (e.metadata().and_then(|m| m.modified()), limit) {
            (Ok(t), Some(l)) => t < l,
            _ => false,
        };
        if (at_once || old) && std::fs::remove_file(e.path()).is_ok() {
            removed += 1;
        }
    }
    removed
}

/// Removes audio older than `days` that is not in `keep` (`"<session>/<n>"`). Returns how many files went.
/// Empty session folders are removed too. Anything that is not a numbered `.wav` is left alone. Loose recordings
/// left by a crash go too (see `remove_stray`); `recording` is true while a capture is active.
pub fn sweep(root: &Path, days: u32, keep: &HashSet<String>, now: SystemTime, recording: bool) -> usize {
    let Some(limit) = now.checked_sub(Duration::from_secs(u64::from(days) * 86_400)) else { return 0 };
    let Ok(sessions) = std::fs::read_dir(root) else { return 0 };
    let mut removed = remove_stray(root, now, recording, days == 0);
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
pub fn remove_all(root: &Path, now: SystemTime, recording: bool) -> Result<usize, String> {
    let Ok(sessions) = std::fs::read_dir(root) else { return Ok(0) };
    let mut removed = remove_stray(root, now, recording, false);
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
        assert_eq!(sweep(root, 30, &keep, later, false), 2);
        assert!(!audio_path(root, "ses_a", 1).exists());
        assert!(audio_path(root, "ses_a", 2).exists(), "a labelled rep keeps its audio");
        assert!(root.join("ses_a/notes.txt").exists(), "not an audio file");
        assert!(!root.join("ses_b").exists(), "empty folders go");
        // Today, nothing is old.
        assert_eq!(sweep(root, 30, &keep, SystemTime::now(), false), 0);
    }

    #[test]
    fn the_size_counts_every_recording_and_removing_all_clears_them_even_labelled_ones() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        touch(root, "ses_a", "1.wav");
        touch(root, "ses_a", "2.wav");
        touch(root, "ses_b", "1.wav");
        assert_eq!(audio_bytes(root), 12);
        assert_eq!(remove_all(root, SystemTime::now(), false).unwrap(), 3);
        assert_eq!(audio_bytes(root), 0);
        assert!(!root.join("ses_a").exists());
        assert_eq!(remove_all(root, SystemTime::now(), false).unwrap(), 0);
    }

    #[test]
    fn a_missing_audio_folder_is_fine() {
        assert_eq!(audio_bytes(Path::new("/definitely/not/here")), 0);
        assert_eq!(remove_all(Path::new("/definitely/not/here"), SystemTime::now(), false), Ok(0));
        assert_eq!(sweep(Path::new("/definitely/not/here"), 30, &HashSet::new(), SystemTime::now(), false), 0);
    }

    fn loose(root: &Path, name: &str) -> PathBuf {
        fs::create_dir_all(root).unwrap();
        let p = root.join(name);
        fs::write(&p, b"RIFF").unwrap();
        p
    }

    #[test]
    fn a_stray_recording_goes_only_when_it_is_old_and_nothing_is_recording() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let stray = loose(root, "rec-123.wav");
        let other = loose(root, "notes.wav");
        touch(root, "ses_a", "rec-9.wav"); // inside a session folder: not a stray
        // Fresh: kept.
        assert_eq!(remove_stray(root, SystemTime::now(), false, false), 0);
        let later = SystemTime::now() + Duration::from_secs(11 * 60);
        // Old but a capture is active: kept.
        assert_eq!(remove_stray(root, later, true, false), 0);
        assert!(stray.exists());
        assert_eq!(remove_stray(root, later, false, false), 1);
        assert!(!stray.exists());
        assert!(other.exists(), "only rec-*.wav");
        assert!(root.join("ses_a/rec-9.wav").exists());
    }

    #[test]
    fn dont_keep_removes_a_stray_at_once_but_never_during_a_capture() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let stray = loose(root, "rec-1.wav");
        assert_eq!(sweep(root, 0, &HashSet::new(), SystemTime::now(), true), 0);
        assert!(stray.exists());
        assert_eq!(sweep(root, 0, &HashSet::new(), SystemTime::now(), false), 1);
        assert!(!stray.exists());
    }

    #[test]
    fn sweep_and_remove_all_clear_old_strays() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let later = SystemTime::now() + Duration::from_secs(20 * 60);
        let a = loose(root, "rec-1.wav");
        assert_eq!(sweep(root, 30, &HashSet::new(), later, false), 1);
        assert!(!a.exists());
        let b = loose(root, "rec-2.wav");
        assert_eq!(remove_all(root, SystemTime::now(), false).unwrap(), 0, "fresh stray survives");
        assert_eq!(remove_all(root, later, false).unwrap(), 1);
        assert!(!b.exists());
    }
}
