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
    fn a_missing_audio_folder_is_fine() {
        assert_eq!(sweep(Path::new("/definitely/not/here"), 30, &HashSet::new(), SystemTime::now()), 0);
    }
}
