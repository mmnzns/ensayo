//! The data folder: the user's profile, stories and methods as plain JSON files, safe to keep on a synced drive.
//! Sync-safe rules (Build Plan, Data model): plain JSON only, atomic writes, one small file per record, conflict
//! copies shown and never merged, a lock file for "another computer has it open", and a missing folder is an error,
//! never an empty bank created in its place.

pub mod bank;
pub mod conflicts;
pub mod io;
pub mod lock;
pub mod migrate;
pub mod model;
pub mod versioned;

use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    /// The data folder is not there (a drive that is not mounted, an unplugged disk).
    #[error("the data folder is not available: {0}")]
    Unavailable(PathBuf),
    #[error("couldn't read or write {0}: {1}")]
    Io(PathBuf, String),
    #[error("{0} is not valid JSON: {1}")]
    Json(PathBuf, String),
    /// Written by a newer Ensayo. Left untouched so an older build cannot damage it.
    #[error("{0} was saved by a newer Ensayo (format {1}, this one understands up to {2})")]
    TooNew(PathBuf, u32, u32),
    #[error("{0} was not found")]
    NotFound(String),
    #[error("{0}")]
    Invalid(String),
}

pub type Result<T> = std::result::Result<T, StorageError>;

use std::path::Path;

/// A handle on one data folder.
#[derive(Debug, Clone)]
pub struct Storage {
    root: PathBuf,
}

/// Records read from a folder, plus a plain-words line for each file that could not be read (so one bad or newer
/// file never hides the rest).
#[derive(Debug)]
pub struct Loaded<T> {
    pub items: Vec<T>,
    pub problems: Vec<String>,
}

impl<T> Default for Loaded<T> {
    fn default() -> Self {
        Loaded { items: vec![], problems: vec![] }
    }
}

impl Storage {
    /// Creates the data folder (and the bank folders in it) if needed. Only for a folder the user chose to start.
    pub fn init(root: PathBuf) -> Result<Storage> {
        for sub in ["bank/stories", "bank/methods"] {
            std::fs::create_dir_all(root.join(sub)).map_err(|e| StorageError::Io(root.clone(), e.to_string()))?;
        }
        Ok(Storage { root })
    }

    /// Opens an existing data folder. A folder that is not there is `Unavailable`; it is never created here, so an
    /// unmounted drive can never turn into an empty bank.
    pub fn open(root: PathBuf) -> Result<Storage> {
        if !root.is_dir() {
            return Err(StorageError::Unavailable(root));
        }
        Ok(Storage { root })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }
}
