//! The data folder: the user's profile, stories and methods as plain JSON files, safe to keep on a synced drive.
//! Sync-safe rules (Build Plan, Data model): plain JSON only, atomic writes, one small file per record, conflict
//! copies shown and never merged, a lock file for "another computer has it open", and a missing folder is an error,
//! never an empty bank created in its place.

pub mod io;
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
