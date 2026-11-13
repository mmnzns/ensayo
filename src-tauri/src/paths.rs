//! Machine-local folders. Models and answer audio never go in the user's data folder (it may be synced).

use std::path::{Path, PathBuf};

pub const BUNDLE_ID: &str = "com.craftconceptsdigital.ensayo";

/// `~/Library/Application Support/<id>` on the Mac, `%LOCALAPPDATA%\<id>` on Windows.
pub fn app_local() -> PathBuf {
    dirs::data_local_dir().unwrap_or_else(|| PathBuf::from(".")).join(BUNDLE_ID)
}

/// Ensayo's own models folder from before the shared one: it only means the LEGACY place now. At start-up the models in
/// it move to the shared folder (`models_store`), leaving hard links behind; "Delete all data" still clears it. New
/// code asks `models_store::store()` where a model is.
pub fn models_dir() -> PathBuf {
    app_local().join("models")
}

pub fn audio_dir() -> PathBuf {
    app_local().join("audio")
}

/// Machine-local trash: recordings of deleted sessions wait here (`audio/<session>/`) until the session is purged or restored.
pub fn trash_dir() -> PathBuf {
    app_local().join("trash")
}

pub fn audio_trash_dir() -> PathBuf {
    trash_dir().join("audio")
}

/// The data folder Ensayo used before 0.3.0: `data` inside the app's local folder. Hidden in `~/Library` on the Mac, and
/// on Windows the uninstaller's "Delete the application data" box removes it. Still the folder of anyone who has data
/// there, until they choose to move it.
pub fn legacy_default_data_dir() -> PathBuf {
    app_local().join("data")
}

/// `<Documents>/Ensayo`, or None when this computer can't say where Documents is. Windows answers with the real
/// Documents folder, including one that OneDrive redirects (the path is then inside OneDrive: it is still safe from the
/// uninstaller). Tests never see the real folder.
pub fn documents_data_dir() -> Option<PathBuf> {
    #[cfg(test)]
    return None;
    #[cfg(not(test))]
    return dirs::document_dir().map(|d| d.join("Ensayo"));
}

/// Which folder is the default, given where the old default and the new one are. The old default stays the default for
/// anyone who has data in it (Ensayo never switches folders silently); everyone else gets Documents, and the old
/// default when Documents can't be found.
pub fn choose_default(legacy: &Path, documents: Option<&Path>) -> PathBuf {
    match documents {
        Some(docs) if !crate::storage::relocate::holds_data(legacy) => docs.to_path_buf(),
        _ => legacy.to_path_buf(),
    }
}

/// Where the data folder lives unless the user chose another one (Settings › Privacy › Data folder).
pub fn default_data_dir() -> PathBuf {
    choose_default(&legacy_default_data_dir(), documents_data_dir().as_deref())
}

/// Machine-local settings (which data folder to use). Never inside the data folder: it may be synced between computers.
pub fn settings_file() -> PathBuf {
    app_local().join("settings.json")
}

/// Ensayo's log files (`ensayo.log` and its older copies). Machine-local; "Delete all Ensayo data" removes it.
pub fn logs_dir() -> PathBuf {
    app_local().join("logs")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn a_new_install_uses_documents_ensayo() {
        let d = tempfile::tempdir().unwrap();
        let legacy = d.path().join("local/data");
        let docs = d.path().join("Documents/Ensayo");
        assert_eq!(choose_default(&legacy, Some(&docs)), docs);
        // An old default folder with nothing of Ensayo's in it does not count.
        fs::create_dir_all(&legacy).unwrap();
        assert_eq!(choose_default(&legacy, Some(&docs)), docs);
    }

    #[test]
    fn an_existing_install_keeps_working_from_the_old_default() {
        let d = tempfile::tempdir().unwrap();
        let legacy = d.path().join("local/data");
        let docs = d.path().join("Documents/Ensayo");
        fs::create_dir_all(legacy.join("bank/stories")).unwrap();
        assert_eq!(choose_default(&legacy, Some(&docs)), legacy);
        // Even when Documents/Ensayo has data too: nothing switches silently.
        fs::create_dir_all(docs.join("bank")).unwrap();
        assert_eq!(choose_default(&legacy, Some(&docs)), legacy);
    }

    #[test]
    fn without_a_documents_folder_the_old_default_is_used() {
        let d = tempfile::tempdir().unwrap();
        let legacy = d.path().join("local/data");
        assert_eq!(choose_default(&legacy, None), legacy);
        assert!(legacy_default_data_dir().starts_with(app_local()));
    }
}
