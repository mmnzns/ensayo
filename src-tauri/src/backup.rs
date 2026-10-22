//! Backup and restore of the data folder as one zip file the user chooses.
//!
//! A backup holds what Ensayo owns in the data folder (the profile and target files, the bank, applications, sessions,
//! the eval set and the interview list) plus a `backup.json` manifest. It never holds answer audio, speech models, API
//! keys, the machine-local settings, the lock file or the trash folder: those are not in the data folder's owned list,
//! so they cannot get in by accident.
//!
//! Restore reads a zip that may come from anywhere, so every entry name is checked before anything is written (no `..`,
//! no absolute paths), only Ensayo-owned names are ever extracted, and it all happens inside the data folder. Files are
//! first extracted to a hidden staging folder, so a damaged zip changes nothing.

use crate::storage::migrate::CURRENT;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

/// The line shown when a backup was made by a newer Ensayo than this one.
pub const NEWER_LINE: &str = "This backup is from a newer Ensayo. Update the app first.";
const NOT_A_BACKUP: &str = "That file isn't an Ensayo backup.";
const UNSAFE_PATHS: &str = "This backup has files with unsafe paths, so Ensayo won't open it.";
/// The layout of `backup.json` and the zip itself.
const FORMAT: u32 = 1;
const MANIFEST: &str = "backup.json";
const MANIFEST_MAX_BYTES: u64 = 1024 * 1024;
/// A backup that would unpack to more than this is refused (a zip bomb, or not a backup).
const MAX_TOTAL_BYTES: u64 = 4 * 1024 * 1024 * 1024;

/// What a backup holds and a replace swaps out. Same list as "Delete all Ensayo data", plus the interview list, and
/// without `lock.json` (that belongs to whichever computer has the folder open). The trash folder is not here on purpose.
pub const OWNED: [&str; 9] = ["profile.json", "profile.v0.json", "you.json", "targets", "bank", "applications", "sessions", "eval", "interviews.json"];

/// Audio never goes in a backup, even if some turns up inside an owned folder.
const AUDIO_EXTENSIONS: [&str; 9] = ["wav", "mp3", "m4a", "aac", "ogg", "opus", "flac", "webm", "aiff"];

type Res<T> = std::result::Result<T, String>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct Counts {
    pub stories: usize,
    pub targets: usize,
    pub applications: usize,
    pub sessions: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Manifest {
    pub format: u32,
    pub app_version: String,
    pub created_at: String,
    /// Every `schema_version` found in the JSON files, smallest first.
    pub schema_versions: Vec<u64>,
    pub counts: Counts,
    /// How many files are in the backup (not counting this manifest).
    pub files: usize,
}

/// What the summary card shows before a restore.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct BackupInfo {
    pub app_version: String,
    pub created_at: String,
    pub counts: Counts,
    pub schema_versions: Vec<u64>,
    pub files: usize,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Merge,
    Replace,
}

impl Mode {
    pub fn parse(text: &str) -> Res<Mode> {
        match text {
            "merge" => Ok(Mode::Merge),
            "replace" => Ok(Mode::Replace),
            other => Err(format!("Unknown restore mode: {other}")),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RestoreReport {
    pub mode: &'static str,
    /// Files written to the data folder (merge: the ones that were missing).
    pub written: usize,
    /// Merge only: files already there with the same content.
    pub unchanged: usize,
    /// Merge only: files already there with different content. The existing file was kept.
    pub skipped: usize,
    /// Replace only: where the copy of the data from before the restore went.
    pub safety_backup: Option<String>,
}

// ---------- names ----------

/// The parts of a zip entry name, or `None` when the name could write outside the data folder: an absolute path, a drive
/// letter, a `..` or `.` part, an empty part in the middle, a backslash trick, or a NUL.
fn name_parts(name: &str) -> Option<Vec<String>> {
    if name.contains('\0') {
        return None;
    }
    let name = name.replace('\\', "/");
    if name.starts_with('/') {
        return None;
    }
    let trimmed = name.strip_suffix('/').unwrap_or(&name);
    if trimmed.is_empty() {
        return None;
    }
    let parts: Vec<String> = trimmed.split('/').map(str::to_string).collect();
    for p in &parts {
        if p.is_empty() || p == "." || p == ".." || p.contains(':') {
            return None;
        }
    }
    Some(parts)
}

fn is_noise(file: &str) -> bool {
    matches!(file, ".DS_Store" | "Thumbs.db" | "desktop.ini") || (file.starts_with('.') && file.ends_with(".tmp"))
}

/// True for a file a backup carries: inside an owned name, not audio, not a temp or system file.
fn is_owned_file(parts: &[String]) -> bool {
    let Some(first) = parts.first() else { return false };
    if !OWNED.contains(&first.as_str()) {
        return false;
    }
    let last = parts.last().map(String::as_str).unwrap_or("");
    if is_noise(last) {
        return false;
    }
    let ext = Path::new(last).extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase).unwrap_or_default();
    if AUDIO_EXTENSIONS.contains(&ext.as_str()) {
        return false;
    }
    // A file name (profile.json) is the whole entry; a folder name (bank) needs something inside it.
    if first.ends_with(".json") { parts.len() == 1 } else { parts.len() >= 2 }
}

fn count_names<'a>(names: impl Iterator<Item = &'a str>) -> Counts {
    let mut c = Counts::default();
    for name in names {
        let p: Vec<&str> = name.split('/').collect();
        match p.as_slice() {
            ["bank", "stories", f] if f.ends_with(".json") => c.stories += 1,
            ["targets", f] if f.ends_with(".json") => c.targets += 1,
            ["applications", _, "application.json"] => c.applications += 1,
            ["sessions", _, "session.json"] => c.sessions += 1,
            _ => {}
        }
    }
    c
}

fn io_err(path: &Path, e: impl std::fmt::Display) -> String {
    format!("Couldn't read or write {}: {e}", path.display())
}

fn schema_of(bytes: &[u8]) -> Option<u64> {
    serde_json::from_slice::<serde_json::Value>(bytes).ok()?.get("schema_version")?.as_u64()
}

// ---------- backup ----------

/// Every file a backup would carry: the name inside the zip (always `/`) and where it is. Symlinks are skipped.
fn collect(root: &Path) -> Res<Vec<(String, PathBuf)>> {
    fn walk(dir: &Path, rel: &str, out: &mut Vec<(String, PathBuf)>) -> Res<()> {
        let mut entries: Vec<_> = fs::read_dir(dir).map_err(|e| io_err(dir, e))?.flatten().collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let name = entry.file_name().to_string_lossy().into_owned();
            let Ok(kind) = entry.file_type() else { continue };
            let child = format!("{rel}/{name}");
            if kind.is_dir() {
                walk(&entry.path(), &child, out)?;
            } else if kind.is_file() {
                out.push((child, entry.path()));
            }
        }
        Ok(())
    }
    let mut out = vec![];
    for name in OWNED {
        let path = root.join(name);
        let Ok(meta) = fs::symlink_metadata(&path) else { continue };
        if meta.is_dir() {
            walk(&path, name, &mut out)?;
        } else if meta.is_file() {
            out.push((name.to_string(), path));
        }
    }
    out.retain(|(name, _)| name_parts(name).is_some_and(|p| is_owned_file(&p)));
    Ok(out)
}

/// Writes a zip of the data folder to `dest` (a temporary file first, then moved into place) and returns its manifest.
pub fn create_backup(root: &Path, dest: &Path, now: DateTime<Utc>) -> Res<Manifest> {
    if !root.is_dir() {
        return Err(format!("The data folder isn't available: {}", root.display()));
    }
    let files = collect(root)?;
    let parent = dest.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or(Path::new("."));
    fs::create_dir_all(parent).map_err(|e| io_err(parent, e))?;
    let tmp = parent.join(format!(".{}.partial", dest.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "backup.zip".into())));
    let manifest = match write_zip(&tmp, &files, now) {
        Ok(m) => m,
        Err(e) => {
            let _ = fs::remove_file(&tmp);
            return Err(e);
        }
    };
    fs::rename(&tmp, dest).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        io_err(dest, e)
    })?;
    Ok(manifest)
}

fn write_zip(tmp: &Path, files: &[(String, PathBuf)], now: DateTime<Utc>) -> Res<Manifest> {
    let file = fs::File::create(tmp).map_err(|e| io_err(tmp, e))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let mut versions = BTreeSet::new();
    for (name, path) in files {
        let bytes = fs::read(path).map_err(|e| io_err(path, e))?;
        if name.ends_with(".json") {
            if let Some(v) = schema_of(&bytes) {
                versions.insert(v);
            }
        }
        zip.start_file(name.as_str(), options).map_err(|e| io_err(tmp, e))?;
        zip.write_all(&bytes).map_err(|e| io_err(tmp, e))?;
    }
    let manifest = Manifest {
        format: FORMAT,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        created_at: now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        schema_versions: versions.into_iter().collect(),
        counts: count_names(files.iter().map(|(n, _)| n.as_str())),
        files: files.len(),
    };
    let text = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    zip.start_file(MANIFEST, options).map_err(|e| io_err(tmp, e))?;
    zip.write_all(text.as_bytes()).map_err(|e| io_err(tmp, e))?;
    let mut out = zip.finish().map_err(|e| io_err(tmp, e))?;
    out.flush().map_err(|e| io_err(tmp, e))?;
    out.sync_all().map_err(|e| io_err(tmp, e))?;
    Ok(manifest)
}

// ---------- inspect ----------

fn open_archive(path: &Path) -> Res<zip::ZipArchive<fs::File>> {
    let file = fs::File::open(path).map_err(|e| io_err(path, e))?;
    zip::ZipArchive::new(file).map_err(|_| NOT_A_BACKUP.to_string())
}

/// Every entry name, checked: one that could escape the data folder refuses the whole zip.
fn checked_names(archive: &mut zip::ZipArchive<fs::File>) -> Res<Vec<(usize, Vec<String>, bool)>> {
    let mut out = vec![];
    for i in 0..archive.len() {
        let entry = archive.by_index_raw(i).map_err(|_| NOT_A_BACKUP.to_string())?;
        let parts = name_parts(entry.name()).ok_or_else(|| UNSAFE_PATHS.to_string())?;
        out.push((i, parts, entry.is_dir()));
    }
    Ok(out)
}

fn read_manifest(archive: &mut zip::ZipArchive<fs::File>) -> Res<Manifest> {
    let mut entry = archive.by_name(MANIFEST).map_err(|_| "This zip has no backup.json, so it isn't an Ensayo backup.".to_string())?;
    let mut text = String::new();
    (&mut entry).take(MANIFEST_MAX_BYTES).read_to_string(&mut text).map_err(|_| NOT_A_BACKUP.to_string())?;
    let manifest: Manifest = serde_json::from_str(&text).map_err(|_| "This backup's backup.json can't be read.".to_string())?;
    if manifest.format > FORMAT || manifest.schema_versions.iter().any(|v| *v > CURRENT) {
        return Err(NEWER_LINE.to_string());
    }
    Ok(manifest)
}

/// Reads the manifest and checks the entry names, without touching the data folder.
pub fn inspect(path: &Path) -> Res<BackupInfo> {
    let mut archive = open_archive(path)?;
    let names = checked_names(&mut archive)?;
    let manifest = read_manifest(&mut archive)?;
    let mut warnings = vec![];
    let owned: Vec<String> = names.iter().filter(|(_, p, dir)| !dir && is_owned_file(p)).map(|(_, p, _)| p.join("/")).collect();
    let ignored = names.iter().filter(|(_, p, dir)| !dir && !(p.len() == 1 && p[0] == MANIFEST) && !is_owned_file(p)).count();
    if ignored > 0 {
        warnings.push(format!("{ignored} {} in this zip aren't Ensayo data and will be ignored.", if ignored == 1 { "file" } else { "files" }));
    }
    if count_names(owned.iter().map(String::as_str)) != manifest.counts || owned.len() != manifest.files {
        warnings.push("What's in this backup doesn't match its summary. It may be damaged or edited.".to_string());
    }
    Ok(BackupInfo { app_version: manifest.app_version, created_at: manifest.created_at, counts: manifest.counts, schema_versions: manifest.schema_versions, files: manifest.files, warnings })
}

// ---------- restore ----------

/// A hidden folder inside the data folder where a restore unpacks first. Removed when it goes out of scope.
struct Staging(PathBuf);

impl Drop for Staging {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn extract(archive: &mut zip::ZipArchive<fs::File>, names: &[(usize, Vec<String>, bool)], staging: &Path) -> Res<usize> {
    let total: u64 = names.iter().filter(|(_, p, dir)| !dir && is_owned_file(p)).map(|(i, _, _)| archive.by_index_raw(*i).map(|e| e.size()).unwrap_or(0)).sum();
    if total > MAX_TOTAL_BYTES {
        return Err("This backup is too big to be an Ensayo backup.".to_string());
    }
    let mut written = 0;
    for (i, parts, dir) in names {
        if *dir || !is_owned_file(parts) {
            continue;
        }
        let mut entry = archive.by_index(*i).map_err(|_| "This backup is damaged and can't be read.".to_string())?;
        if entry.is_symlink() {
            continue;
        }
        let mut bytes = Vec::with_capacity(entry.size().min(1 << 20) as usize);
        let size = entry.size();
        (&mut entry).take(size).read_to_end(&mut bytes).map_err(|_| "This backup is damaged and can't be read.".to_string())?;
        if parts.last().is_some_and(|f| f.ends_with(".json")) && schema_of(&bytes).is_some_and(|v| v > CURRENT) {
            return Err(NEWER_LINE.to_string());
        }
        let mut dest = staging.to_path_buf();
        for p in parts {
            dest.push(p);
        }
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| io_err(parent, e))?;
        }
        fs::write(&dest, &bytes).map_err(|e| io_err(&dest, e))?;
        written += 1;
    }
    Ok(written)
}

fn remove_any(path: &Path) -> Res<()> {
    let result = match fs::symlink_metadata(path) {
        Ok(m) if m.is_dir() => fs::remove_dir_all(path),
        Ok(_) => fs::remove_file(path),
        Err(_) => Ok(()),
    };
    result.map_err(|e| io_err(path, e))
}

fn staged_files(staging: &Path) -> Res<Vec<PathBuf>> {
    fn walk(dir: &Path, out: &mut Vec<PathBuf>) -> Res<()> {
        for entry in fs::read_dir(dir).map_err(|e| io_err(dir, e))?.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk(&path, out)?;
            } else {
                out.push(path);
            }
        }
        Ok(())
    }
    let mut out = vec![];
    walk(staging, &mut out)?;
    out.sort();
    Ok(out)
}

/// Restores `zip` into the data folder `root`. Merge adds what is missing and keeps every file that is already there.
/// Replace first saves the current data to `safety_dir/before-restore-<time>.zip`, then swaps the owned content.
pub fn restore(zip: &Path, root: &Path, mode: Mode, safety_dir: &Path, now: DateTime<Utc>) -> Res<RestoreReport> {
    if !root.is_dir() {
        return Err(format!("The data folder isn't available: {}", root.display()));
    }
    let mut archive = open_archive(zip)?;
    let names = checked_names(&mut archive)?;
    read_manifest(&mut archive)?;

    let staging = Staging(root.join(format!(".ensayo-restore-{}", now.format("%Y%m%d-%H%M%S"))));
    remove_any(&staging.0)?;
    fs::create_dir_all(&staging.0).map_err(|e| io_err(&staging.0, e))?;
    if extract(&mut archive, &names, &staging.0)? == 0 {
        return Err("This backup has no Ensayo data in it.".to_string());
    }

    match mode {
        Mode::Merge => {
            let (mut written, mut unchanged, mut skipped) = (0, 0, 0);
            for file in staged_files(&staging.0)? {
                let rel = file.strip_prefix(&staging.0).map_err(|e| e.to_string())?;
                let dest = root.join(rel);
                if dest.exists() {
                    if fs::read(&dest).ok() == fs::read(&file).ok() { unchanged += 1 } else { skipped += 1 }
                    continue;
                }
                if let Some(parent) = dest.parent() {
                    fs::create_dir_all(parent).map_err(|e| io_err(parent, e))?;
                }
                fs::rename(&file, &dest).map_err(|e| io_err(&dest, e))?;
                written += 1;
            }
            Ok(RestoreReport { mode: "merge", written, unchanged, skipped, safety_backup: None })
        }
        Mode::Replace => {
            let safety = safety_dir.join(format!("before-restore-{}.zip", now.format("%Y%m%d-%H%M%S")));
            create_backup(root, &safety, now).map_err(|e| format!("Ensayo couldn't save a safety copy first, so nothing was changed. {e}"))?;
            let mut written = 0;
            for name in OWNED {
                remove_any(&root.join(name)).map_err(|e| format!("{e} Your data from before is saved in {}.", safety.display()))?;
                let staged = staging.0.join(name);
                if staged.exists() {
                    written += if staged.is_dir() { staged_files(&staged)?.len() } else { 1 };
                    fs::rename(&staged, root.join(name)).map_err(|e| format!("{} Your data from before is saved in {}.", io_err(&root.join(name), e), safety.display()))?;
                }
            }
            Ok(RestoreReport { mode: "replace", written, unchanged: 0, skipped: 0, safety_backup: Some(safety.to_string_lossy().into_owned()) })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use std::collections::BTreeMap;

    fn now() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 10, 22, 9, 30, 0).unwrap()
    }

    fn put(root: &Path, rel: &str, text: &str) {
        let p = root.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, text).unwrap();
    }

    fn seed(root: &Path) {
        put(root, "you.json", r#"{"schema_version":1,"name":"Sam"}"#);
        put(root, "targets/tg_a.json", r#"{"schema_version":1,"id":"tg_a"}"#);
        put(root, "targets/tg_b.json", r#"{"schema_version":1,"id":"tg_b"}"#);
        put(root, "bank/stories/st_a.json", r#"{"schema_version":1,"id":"st_a","title":"A"}"#);
        put(root, "bank/stories/st_b.json", r#"{"schema_version":1,"id":"st_b","title":"B"}"#);
        put(root, "bank/stories/st_c.json", r#"{"schema_version":1,"id":"st_c","title":"C"}"#);
        put(root, "bank/methods/me_a.json", r#"{"schema_version":1,"id":"me_a"}"#);
        put(root, "applications/app_1/application.json", r#"{"schema_version":1,"id":"app_1"}"#);
        put(root, "applications/app_1/analysis.json", r#"{"schema_version":1}"#);
        put(root, "sessions/ses_1/session.json", r#"{"schema_version":1,"id":"ses_1"}"#);
        put(root, "sessions/ses_1/reps/1/rep.json", r#"{"schema_version":1}"#);
        put(root, "eval/ses_1-1.json", r#"{"schema_version":1}"#);
        put(root, "interviews.json", r#"{"schema_version":1,"items":[]}"#);
    }

    fn tree(root: &Path) -> BTreeMap<String, Vec<u8>> {
        let mut out = BTreeMap::new();
        fn walk(dir: &Path, rel: &str, out: &mut BTreeMap<String, Vec<u8>>) {
            for e in fs::read_dir(dir).unwrap().flatten() {
                let name = e.file_name().to_string_lossy().into_owned();
                let child = if rel.is_empty() { name } else { format!("{rel}/{name}") };
                if e.path().is_dir() {
                    walk(&e.path(), &child, out);
                } else {
                    out.insert(child, fs::read(e.path()).unwrap());
                }
            }
        }
        walk(root, "", &mut out);
        out
    }

    fn zip_names(path: &Path) -> Vec<String> {
        let mut a = zip::ZipArchive::new(fs::File::open(path).unwrap()).unwrap();
        (0..a.len()).map(|i| a.by_index(i).unwrap().name().to_string()).collect()
    }

    /// A zip written by hand, so a test can put anything in it, including entries Ensayo would never write.
    fn handmade(path: &Path, entries: &[(&str, &str)]) {
        let mut z = zip::ZipWriter::new(fs::File::create(path).unwrap());
        let o = zip::write::SimpleFileOptions::default();
        for (name, body) in entries {
            z.start_file(*name, o).unwrap();
            z.write_all(body.as_bytes()).unwrap();
        }
        z.finish().unwrap();
    }

    fn manifest_text(schema: &str, format: u32) -> String {
        format!(r#"{{"format":{format},"app_version":"9.9.9","created_at":"2026-10-22T09:30:00Z","schema_versions":[{schema}],"counts":{{"stories":0,"targets":0,"applications":0,"sessions":0}},"files":1}}"#)
    }

    #[test]
    fn a_backup_restored_into_an_empty_folder_gives_identical_files() {
        let d = tempfile::tempdir().unwrap();
        let a = d.path().join("a");
        fs::create_dir_all(&a).unwrap();
        seed(&a);
        let zip = d.path().join("out/backup.zip");
        create_backup(&a, &zip, now()).unwrap();
        for mode in [Mode::Merge, Mode::Replace] {
            let c = d.path().join(format!("c-{mode:?}"));
            fs::create_dir_all(&c).unwrap();
            restore(&zip, &c, mode, &d.path().join("safety"), now()).unwrap();
            assert_eq!(tree(&c), tree(&a), "{mode:?}");
        }
    }

    #[test]
    fn trash_audio_models_settings_keys_and_the_lock_stay_out() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("data");
        fs::create_dir_all(&root).unwrap();
        seed(&root);
        put(&root, "trash/st_old.json", "{}");
        put(&root, "lock.json", "{}");
        put(&root, "settings.json", "{}");
        put(&root, "models/whisper.bin", "x");
        put(&root, "keys.txt", "secret");
        put(&root, "notes.txt", "mine");
        put(&root, "sessions/ses_1/reps/1/answer.wav", "RIFF");
        put(&root, "sessions/ses_1/answer.MP3", "ID3");
        put(&root, "bank/stories/.st_a.json.w_abc.tmp", "half");
        put(&root, "bank/stories/.DS_Store", "x");
        let zip = d.path().join("b.zip");
        create_backup(&root, &zip, now()).unwrap();
        let names = zip_names(&zip);
        for out in ["trash", "lock.json", "settings.json", "models", "keys.txt", "notes.txt", ".wav", ".MP3", ".tmp", ".DS_Store"] {
            assert!(!names.iter().any(|n| n.contains(out)), "{out} leaked into {names:?}");
        }
        assert!(names.contains(&"backup.json".to_string()) && names.contains(&"interviews.json".to_string()));
        assert_eq!(names.len(), 13 + 1, "{names:?}");
    }

    #[test]
    fn the_manifest_counts_are_right() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("data");
        fs::create_dir_all(&root).unwrap();
        seed(&root);
        let m = create_backup(&root, &d.path().join("b.zip"), now()).unwrap();
        assert_eq!(m.counts, Counts { stories: 3, targets: 2, applications: 1, sessions: 1 });
        assert_eq!((m.format, m.files, m.schema_versions.clone()), (1, 13, vec![1]));
        assert_eq!(m.created_at, "2026-10-22T09:30:00Z");
        let info = inspect(&d.path().join("b.zip")).unwrap();
        assert_eq!(info.counts, m.counts);
        assert_eq!(info.app_version, env!("CARGO_PKG_VERSION"));
        assert!(info.warnings.is_empty(), "{:?}", info.warnings);
    }

    #[test]
    fn a_zip_without_a_manifest_or_not_a_zip_is_refused() {
        let d = tempfile::tempdir().unwrap();
        let z = d.path().join("x.zip");
        handmade(&z, &[("bank/stories/st_a.json", "{}")]);
        assert!(inspect(&z).unwrap_err().contains("no backup.json"));
        let junk = d.path().join("junk.zip");
        fs::write(&junk, "not a zip").unwrap();
        assert_eq!(inspect(&junk).unwrap_err(), NOT_A_BACKUP);
    }

    #[test]
    fn entries_that_escape_the_folder_are_refused_and_nothing_is_written() {
        for bad in ["../evil.json", "bank/../../evil.json", "/etc/evil.json", "C:/evil.json", "bank\\..\\..\\evil.json", "bank//x.json"] {
            let d = tempfile::tempdir().unwrap();
            let root = d.path().join("data");
            fs::create_dir_all(&root).unwrap();
            let z = d.path().join("evil.zip");
            handmade(&z, &[(MANIFEST, &manifest_text("1", 1)), (bad, "{}")]);
            assert_eq!(inspect(&z).unwrap_err(), UNSAFE_PATHS, "{bad}");
            assert_eq!(restore(&z, &root, Mode::Replace, &d.path().join("safety"), now()).unwrap_err(), UNSAFE_PATHS, "{bad}");
            assert!(tree(d.path()).keys().all(|k| k == "evil.zip"), "{bad}: {:?}", tree(d.path()).keys());
        }
    }

    #[test]
    fn a_backup_from_a_newer_ensayo_is_refused_with_the_plain_line() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("data");
        fs::create_dir_all(&root).unwrap();
        put(&root, "you.json", "mine");
        for (schema, format) in [("1,2", 1), ("1", 2)] {
            let z = d.path().join(format!("n{format}.zip"));
            handmade(&z, &[(MANIFEST, &manifest_text(schema, format)), ("you.json", "{}")]);
            assert_eq!(inspect(&z).unwrap_err(), "This backup is from a newer Ensayo. Update the app first.");
            assert_eq!(restore(&z, &root, Mode::Replace, &d.path().join("safety"), now()).unwrap_err(), NEWER_LINE);
        }
        // A manifest that says 1 but a file that says 99: caught before anything changes.
        let z = d.path().join("liar.zip");
        handmade(&z, &[(MANIFEST, &manifest_text("1", 1)), ("bank/stories/st_x.json", r#"{"schema_version":99}"#)]);
        assert_eq!(restore(&z, &root, Mode::Replace, &d.path().join("safety"), now()).unwrap_err(), NEWER_LINE);
        assert_eq!(fs::read_to_string(root.join("you.json")).unwrap(), "mine");
        assert!(!d.path().join("safety").exists(), "no safety copy for a restore that never started");
        assert_eq!(tree(&root).len(), 1, "the staging folder is cleaned up");
    }

    #[test]
    fn merge_adds_what_is_missing_and_keeps_existing_files_counting_the_skipped() {
        let d = tempfile::tempdir().unwrap();
        let (from, root) = (d.path().join("from"), d.path().join("data"));
        fs::create_dir_all(&from).unwrap();
        fs::create_dir_all(&root).unwrap();
        seed(&from);
        let zip = d.path().join("b.zip");
        create_backup(&from, &zip, now()).unwrap();
        // The data folder has st_a changed (a conflict), st_b the same, and a story the backup lacks.
        put(&root, "bank/stories/st_a.json", r#"{"schema_version":1,"id":"st_a","title":"A, edited here"}"#);
        put(&root, "bank/stories/st_b.json", r#"{"schema_version":1,"id":"st_b","title":"B"}"#);
        put(&root, "bank/stories/st_z.json", r#"{"schema_version":1,"id":"st_z"}"#);
        let r = restore(&zip, &root, Mode::Merge, &d.path().join("safety"), now()).unwrap();
        assert_eq!((r.written, r.unchanged, r.skipped, r.safety_backup.clone()), (11, 1, 1, None));
        assert!(fs::read_to_string(root.join("bank/stories/st_a.json")).unwrap().contains("edited here"));
        assert!(root.join("bank/stories/st_z.json").is_file() && root.join("bank/stories/st_c.json").is_file());
        assert!(!d.path().join("safety").exists());
    }

    #[test]
    fn replace_saves_the_current_data_first_then_swaps_it() {
        let d = tempfile::tempdir().unwrap();
        let (from, root, safety) = (d.path().join("from"), d.path().join("data"), d.path().join("local/backups"));
        fs::create_dir_all(&from).unwrap();
        fs::create_dir_all(&root).unwrap();
        seed(&from);
        let zip = d.path().join("b.zip");
        create_backup(&from, &zip, now()).unwrap();
        put(&root, "bank/stories/st_old.json", r#"{"schema_version":1,"id":"st_old"}"#);
        put(&root, "targets/tg_old.json", r#"{"schema_version":1,"id":"tg_old"}"#);
        put(&root, "lock.json", "lock");
        put(&root, "trash/keep.json", "{}");
        let r = restore(&zip, &root, Mode::Replace, &safety, now()).unwrap();
        let saved = safety.join("before-restore-20261022-093000.zip");
        assert_eq!(r.safety_backup.as_deref(), Some(saved.to_str().unwrap()));
        let names = zip_names(&saved);
        assert!(names.contains(&"bank/stories/st_old.json".to_string()) && !names.iter().any(|n| n.contains("lock") || n.contains("trash")), "{names:?}");
        assert_eq!(inspect(&saved).unwrap().counts, Counts { stories: 1, targets: 1, applications: 0, sessions: 0 });
        let after = tree(&root);
        assert!(!after.contains_key("bank/stories/st_old.json") && !after.contains_key("targets/tg_old.json"));
        assert_eq!(after.get("lock.json").map(Vec::as_slice), Some(&b"lock"[..]), "the lock is not Ensayo data to replace");
        assert!(after.contains_key("trash/keep.json"), "the trash folder is left alone");
        let mut expected = tree(&from);
        expected.insert("lock.json".into(), b"lock".to_vec());
        expected.insert("trash/keep.json".into(), b"{}".to_vec());
        assert_eq!(after, expected);
        assert_eq!(r.written, 13);
    }

    #[test]
    fn restore_ignores_names_that_are_not_ensayo_data() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("data");
        fs::create_dir_all(&root).unwrap();
        let z = d.path().join("odd.zip");
        handmade(&z, &[(MANIFEST, &manifest_text("1", 1)), ("you.json", r#"{"schema_version":1}"#), ("settings.json", "{}"), ("trash/x.json", "{}"), ("sessions/s/a.wav", "RIFF"), ("models/m.bin", "x")]);
        let info = inspect(&z).unwrap();
        assert!(info.warnings.iter().any(|w| w.starts_with("4 files in this zip aren't Ensayo data")), "{:?}", info.warnings);
        restore(&z, &root, Mode::Merge, &d.path().join("s"), now()).unwrap();
        assert_eq!(tree(&root).keys().cloned().collect::<Vec<_>>(), vec!["you.json".to_string()]);
    }

    #[test]
    fn an_empty_backup_is_refused_and_a_bad_mode_is_an_error() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("data");
        fs::create_dir_all(&root).unwrap();
        put(&root, "you.json", "mine");
        let z = d.path().join("empty.zip");
        handmade(&z, &[(MANIFEST, &manifest_text("", 1))]);
        assert!(restore(&z, &root, Mode::Replace, &d.path().join("s"), now()).unwrap_err().contains("no Ensayo data"));
        assert_eq!(fs::read_to_string(root.join("you.json")).unwrap(), "mine");
        assert!(Mode::parse("merge").is_ok() && Mode::parse("replace").is_ok() && Mode::parse("wipe").is_err());
    }
}
