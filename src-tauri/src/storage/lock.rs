//! The lock file: which computer has the data folder open. Running Ensayo on two computers at once is how sync
//! conflicts happen, so a recent lock from another computer is shown as a warning before opening.

use super::io::{atomic_write, read_text};
use super::{Result, Storage, StorageError};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// A lock not refreshed for this long is treated as left behind (the app was closed, the computer slept or crashed).
pub const STALE_AFTER_SECS: i64 = 600;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum LockState {
    Free,
    Mine,
    Other { machine: String, age_secs: i64 },
    Stale { machine: String, age_secs: i64 },
}

#[derive(Debug, Serialize, Deserialize)]
struct LockFile {
    machine: String,
    pid: u32,
    started: DateTime<Utc>,
    heartbeat: DateTime<Utc>,
}

pub fn machine_name() -> String {
    gethostname::gethostname().to_string_lossy().into_owned()
}

impl Storage {
    fn lock_path(&self) -> std::path::PathBuf {
        self.root().join("lock.json")
    }

    /// A missing or damaged lock file is `None`: it must never lock the user out of their own data.
    fn read_lock(&self) -> Result<Option<LockFile>> {
        Ok(read_text(&self.lock_path())?.and_then(|t| serde_json::from_str(&t).ok()))
    }

    fn write_lock(&self, lock: &LockFile) -> Result<()> {
        let text = serde_json::to_string_pretty(lock).map_err(|e| StorageError::Json(self.lock_path(), e.to_string()))?;
        atomic_write(&self.lock_path(), text.as_bytes())
    }

    pub fn lock_state(&self, me: &str, now: DateTime<Utc>) -> Result<LockState> {
        let Some(lock) = self.read_lock()? else { return Ok(LockState::Free) };
        if lock.machine == me {
            return Ok(LockState::Mine);
        }
        let age_secs = (now - lock.heartbeat).num_seconds().max(0);
        Ok(if age_secs <= STALE_AFTER_SECS { LockState::Other { machine: lock.machine, age_secs } } else { LockState::Stale { machine: lock.machine, age_secs } })
    }

    /// Takes the lock for this computer (the user chose "Open anyway", or nobody had it).
    pub fn acquire_lock(&self, me: &str, now: DateTime<Utc>) -> Result<()> {
        self.write_lock(&LockFile { machine: me.to_string(), pid: std::process::id(), started: now, heartbeat: now })
    }

    /// Refreshes our lock; does nothing when the lock is someone else's.
    pub fn heartbeat(&self, me: &str, now: DateTime<Utc>) -> Result<()> {
        match self.read_lock()? {
            Some(mut lock) if lock.machine == me => {
                lock.heartbeat = now;
                self.write_lock(&lock)
            }
            _ => Ok(()),
        }
    }

    /// Removes our lock when the app closes; never removes someone else's.
    pub fn release_lock(&self, me: &str) -> Result<()> {
        match self.read_lock()? {
            Some(lock) if lock.machine == me => std::fs::remove_file(self.lock_path()).map_err(|e| StorageError::Io(self.lock_path(), e.to_string())),
            _ => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::Storage;
    use chrono::{Duration, TimeZone, Utc};

    fn fresh() -> (tempfile::TempDir, Storage) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::init(dir.path().join("data")).unwrap();
        (dir, s)
    }

    fn t0() -> chrono::DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 10, 21, 20, 0, 0).unwrap()
    }

    #[test]
    fn no_lock_file_means_free() {
        let (_d, s) = fresh();
        assert_eq!(s.lock_state("mac", t0()).unwrap(), LockState::Free);
    }

    #[test]
    fn a_lock_taken_by_this_machine_is_mine() {
        let (_d, s) = fresh();
        s.acquire_lock("mac", t0()).unwrap();
        assert_eq!(s.lock_state("mac", t0() + Duration::seconds(30)).unwrap(), LockState::Mine);
    }

    #[test]
    fn another_machines_recent_lock_blocks_and_an_old_one_is_stale() {
        let (_d, s) = fresh();
        s.acquire_lock("pc", t0()).unwrap();
        assert_eq!(s.lock_state("mac", t0() + Duration::minutes(3)).unwrap(), LockState::Other { machine: "pc".into(), age_secs: 180 });
        assert_eq!(s.lock_state("mac", t0() + Duration::minutes(10)).unwrap(), LockState::Other { machine: "pc".into(), age_secs: 600 });
        assert_eq!(s.lock_state("mac", t0() + Duration::minutes(11)).unwrap(), LockState::Stale { machine: "pc".into(), age_secs: 660 });
    }

    #[test]
    fn the_heartbeat_keeps_our_lock_fresh_and_ignores_someone_elses() {
        let (_d, s) = fresh();
        s.acquire_lock("pc", t0()).unwrap();
        s.heartbeat("mac", t0() + Duration::minutes(5)).unwrap();
        assert_eq!(s.lock_state("mac", t0() + Duration::minutes(6)).unwrap(), LockState::Other { machine: "pc".into(), age_secs: 360 });
        s.heartbeat("pc", t0() + Duration::minutes(5)).unwrap();
        assert_eq!(s.lock_state("mac", t0() + Duration::minutes(6)).unwrap(), LockState::Other { machine: "pc".into(), age_secs: 60 });
    }

    #[test]
    fn release_removes_only_our_own_lock() {
        let (_d, s) = fresh();
        s.acquire_lock("pc", t0()).unwrap();
        s.release_lock("mac").unwrap();
        assert!(matches!(s.lock_state("mac", t0()).unwrap(), LockState::Other { .. }));
        s.release_lock("pc").unwrap();
        assert_eq!(s.lock_state("mac", t0()).unwrap(), LockState::Free);
        s.release_lock("pc").unwrap(); // nothing to release is fine
    }

    #[test]
    fn a_damaged_lock_file_never_locks_the_user_out() {
        let (_d, s) = fresh();
        std::fs::write(s.root().join("lock.json"), "garbage").unwrap();
        assert_eq!(s.lock_state("mac", t0()).unwrap(), LockState::Free);
    }

    #[test]
    fn this_computer_has_a_name() {
        assert!(!machine_name().trim().is_empty());
    }
}
