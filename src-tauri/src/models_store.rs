//! Ensayo's models live in the shared models folder every Craft Concepts Digital app uses
//! (`voice_engine_models::SharedStore`), not in a folder of its own: a model one app downloaded is on this computer for
//! the others, and it is erased only when the last app that uses it lets go.
//!
//! Start-up (`start_up`) adopts the models Ensayo's older versions downloaded into the shared folder, without
//! downloading anything again. Every command that touches models waits for it through `store()`.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use voice_engine_models::{catalog, App, DownloadError, MoveReport, SharedStore, Status, StoreError};

static STORE: OnceLock<Result<SharedStore, String>> = OnceLock::new();

/// Start-up is a one-way latch: not begun (tests, the eval tool), running, finished.
#[derive(Clone, Copy, PartialEq)]
enum Phase {
    NotBegun,
    Running,
    Finished,
}

static PHASE: (Mutex<Phase>, Condvar) = (Mutex::new(Phase::NotBegun), Condvar::new());

fn open() -> Result<&'static SharedStore, String> {
    STORE
        .get_or_init(|| SharedStore::open(App::Ensayo).map_err(|e| format!("Ensayo couldn't open its models folder ({}). Check that the disk isn't full or read-only, then restart Ensayo.", e.kind())))
        .as_ref()
        .map_err(|e| e.clone())
}

/// The shared model folder. Waits while start-up is still adopting models, so no command sees a half-moved folder.
pub fn store() -> Result<&'static SharedStore, String> {
    let (lock, done) = &PHASE;
    let mut phase = lock.lock().unwrap_or_else(|e| e.into_inner());
    while *phase == Phase::Running {
        phase = done.wait(phase).unwrap_or_else(|e| e.into_inner());
    }
    drop(phase);
    open()
}

/// Says start-up is about to run, so `store()` waits for it. Called before the worker thread is spawned, so a command
/// that arrives first can't slip in ahead of it.
pub fn begin_start_up() {
    *PHASE.0.lock().unwrap_or_else(|e| e.into_inner()) = Phase::Running;
}

/// Adopts Ensayo's older models, erases what no app uses any more, and lets the commands go on. `used` are the models
/// this app already knows it uses (`move_in` also marks every model it adopts from Ensayo's own old folder).
pub fn start_up(used: &[&str]) {
    match open() {
        Ok(store) => log_report(&run_start_up(store, used)),
        Err(e) => log::warn!("{e}"),
    }
    let (lock, done) = &PHASE;
    *lock.lock().unwrap_or_else(|e| e.into_inner()) = Phase::Finished;
    done.notify_all();
}

/// What start-up found, for the log: ids and reasons only.
#[derive(Debug, Default, PartialEq)]
pub struct StartUp {
    pub moved: Vec<String>,
    pub linked: Vec<String>,
    pub imported: usize,
    pub left_for_later: Vec<(String, String)>,
    pub error: Option<String>,
}

/// `move_in(used)`, then `collect()`, as the engine asks apps to do at every start.
pub fn run_start_up(store: &SharedStore, used: &[&str]) -> StartUp {
    let mut out = StartUp::default();
    match store.move_in(used) {
        Ok(MoveReport { moved, linked, imported, left_for_later, .. }) => {
            out.moved = moved;
            out.linked = linked;
            out.imported = imported.len();
            out.left_for_later = left_for_later;
        }
        Err(e) => out.error = Some(format!("moving models in failed: {}", e.kind())),
    }
    if let Err(e) = store.collect() {
        out.error.get_or_insert(format!("clearing unused models failed: {}", e.kind()));
    }
    out
}

fn log_report(r: &StartUp) {
    log::info!("models: {} moved in, {} linked, {} imported, {} left for later", r.moved.len(), r.linked.len(), r.imported, r.left_for_later.len());
    for id in &r.moved {
        log::info!("models: moved {id} into the shared folder");
    }
    for id in &r.linked {
        log::info!("models: linked {id} from another app");
    }
    for (id, why) in &r.left_for_later {
        log::info!("models: {id} left for the next start ({why})");
    }
    if let Some(e) = &r.error {
        log::warn!("models: {e}");
    }
}

/// The state names the window switches on. `ready`, `on_this_computer` and `missing` are the ones it has always had.
pub fn state_name(s: &Status) -> &'static str {
    match s {
        Status::Installed { used_by_me: true, .. } => "ready",
        Status::Installed { used_by_me: false, .. } => "on_this_computer",
        Status::Missing => "missing",
        Status::Partial { .. } => "partial",
        Status::Downloading { by_me: true, .. } => "downloading",
        Status::Downloading { by_me: false, .. } => "downloading_elsewhere",
    }
}

/// How much is on disk (0..1) for the states that have an unfinished download.
pub fn fraction_of(s: &Status) -> Option<f32> {
    match s {
        Status::Partial { fraction, .. } | Status::Downloading { fraction, .. } => Some(fraction.clamp(0.0, 1.0)),
        _ => None,
    }
}

/// True when the model is completely on this computer.
pub fn is_installed(s: &Status) -> bool {
    matches!(s, Status::Installed { .. })
}

/// The words for a download that didn't finish, naming the model and saying what to do. `Cancelled` is the person's
/// own doing: the window already knows it asked, so it gets the short line the cancel has always had.
pub fn download_message(model_name: &str, size: u64, e: &StoreError) -> String {
    match e {
        StoreError::DownloadingElsewhere => format!("Another Craft Concepts app is downloading {model_name}. It will be ready here when that finishes."),
        StoreError::Download(d) => match d {
            DownloadError::Cancelled => "Cancelled.".to_string(),
            DownloadError::Offline => format!("Couldn't download {model_name}: Ensayo couldn't reach the download server. Are you offline? Check your connection and try again; the download picks up where it stopped."),
            DownloadError::Refused { status } if (200..300).contains(status) => {
                format!("Couldn't download {model_name}: the network sent a web page instead. You may need to sign in to this Wi-Fi in your browser first.")
            }
            DownloadError::Refused { status } => format!("Couldn't download {model_name}: the download server refused the request (error {status}). Try again later."),
            DownloadError::DiskFull => format!("There isn't enough room on this computer to download {model_name}, which needs about {}. Free some space and try again.", size_text(size)),
            DownloadError::Checksum { .. } => format!("{model_name} was damaged in transit. Try again."),
            DownloadError::Stalled => format!("The download of {model_name} stopped: no data for 30 seconds. Check your connection and try again."),
            DownloadError::Io(_) => format!("Couldn't save {model_name} to this computer. Check that the disk isn't full or read-only, then try again."),
        },
        StoreError::Io(_) => format!("Couldn't save {model_name} to this computer. Check that the disk isn't full or read-only, then try again."),
        StoreError::UnknownModel(_) | StoreError::NotInstalled(_) => format!("Ensayo doesn't have {model_name} to download. Pick another in Settings."),
    }
}

fn size_text(bytes: u64) -> String {
    if bytes >= 1_000_000_000 {
        format!("{:.1} GB", bytes as f64 / 1e9)
    } else {
        format!("{} MB", bytes / 1_000_000)
    }
}

/// Downloads `id` into the shared folder unless it is already complete there, and says `progress` (0..1) as it goes.
/// A model that is already on this computer, from this app or another, is just marked as used by Ensayo. `name` is what
/// the person calls the model. A stop the person asked for is `Err("Cancelled.")`, as it has always been.
pub fn download(store: &SharedStore, id: &str, name: &str, cancel: &AtomicBool, progress: &mut dyn FnMut(f32)) -> Result<(), String> {
    let size = catalog::find(id).map(|m| m.size()).unwrap_or(0);
    if is_installed(&store.status(id)) {
        store.use_model(id).map_err(|e| download_message(name, size, &e))?;
        progress(1.0);
        return Ok(());
    }
    if cancel.load(Ordering::Relaxed) {
        return Err(download_message(name, size, &StoreError::Download(DownloadError::Cancelled)));
    }
    store.download(id, cancel, &mut |p| progress(p.fraction)).map(|_| ()).map_err(|e| download_message(name, size, &e))
}

/// The one download of a kind that may run at a time, with its cancel flag.
pub struct DownloadSlot(Mutex<Option<Arc<AtomicBool>>>);

impl DownloadSlot {
    pub const fn new() -> Self {
        DownloadSlot(Mutex::new(None))
    }

    /// Claims the slot. Err (with `busy`) when a download is already running.
    pub fn begin(&self, busy: &str) -> Result<Arc<AtomicBool>, String> {
        let mut slot = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if slot.is_some() {
            return Err(busy.to_string());
        }
        let cancel = Arc::new(AtomicBool::new(false));
        *slot = Some(cancel.clone());
        Ok(cancel)
    }

    pub fn end(&self) {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }

    /// Stops the download in progress (what it already fetched is kept, so the next Download resumes).
    pub fn cancel(&self) {
        if let Some(flag) = self.0.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
            flag.store(true, Ordering::Relaxed);
        }
    }
}

/// What `delete_model` answers.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct Deleted {
    /// "erased" (no other app uses it, so it is gone), "kept" (another app still uses it) or "not_using".
    pub result: &'static str,
}

/// Ensayo stops using `id`. The folder goes only when no other app uses it or has it open.
pub fn release(store: &SharedStore, id: &str) -> Result<Deleted, String> {
    use voice_engine_models::Released;
    match store.release(id) {
        Ok(Released::Erased) => Ok(Deleted { result: "erased" }),
        Ok(Released::Kept { .. }) => Ok(Deleted { result: "kept" }),
        Ok(Released::NotUsing) => Ok(Deleted { result: "not_using" }),
        Err(e) => Err(format!("Ensayo couldn't delete that model ({}). Close other apps that use it and try again.", e.kind())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;
    use voice_engine_models::catalog;

    fn sparse(path: &Path, size: u64) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::File::create(path).unwrap().set_len(size).unwrap();
    }

    /// Puts every file of a catalog model in the store, at its real size but empty.
    fn install(store: &SharedStore, id: &str) {
        for f in catalog::find(id).unwrap().files {
            sparse(&store.model_dir(id).join(f.name), f.size);
        }
    }

    fn temp_store(app: App) -> (tempfile::TempDir, SharedStore) {
        let dir = tempfile::tempdir().unwrap();
        let store = SharedStore::open_at(app, dir.path().to_path_buf()).unwrap();
        (dir, store)
    }

    #[test]
    fn every_store_state_has_its_ui_state() {
        let dir = std::path::PathBuf::from("/m");
        let cases = [
            (Status::Installed { dir: dir.clone(), users: vec![App::Ensayo], used_by_me: true }, "ready", None),
            (Status::Installed { dir, users: vec![App::Talaan], used_by_me: false }, "on_this_computer", None),
            (Status::Missing, "missing", None),
            (Status::Partial { fraction: 0.4, bytes: 4, cancelled: true }, "partial", Some(0.4)),
            (Status::Downloading { fraction: 0.25, bytes: 1, by_me: true }, "downloading", Some(0.25)),
            (Status::Downloading { fraction: 0.5, bytes: 2, by_me: false }, "downloading_elsewhere", Some(0.5)),
        ];
        for (status, state, fraction) in cases {
            assert_eq!(state_name(&status), state);
            assert_eq!(fraction_of(&status), fraction, "{state}");
        }
    }

    #[test]
    fn a_fraction_never_leaves_zero_to_one() {
        assert_eq!(fraction_of(&Status::Partial { fraction: 1.7, bytes: 0, cancelled: false }), Some(1.0));
    }

    #[test]
    fn a_model_the_store_has_is_installed_and_its_state_follows_who_uses_it() {
        let (_d, store) = temp_store(App::Ensayo);
        assert_eq!(state_name(&store.status("whisper-tiny")), "missing");
        install(&store, "whisper-tiny");
        assert_eq!(state_name(&store.status("whisper-tiny")), "on_this_computer");
        store.use_model("whisper-tiny").unwrap();
        assert_eq!(state_name(&store.status("whisper-tiny")), "ready");
        assert!(is_installed(&store.status("whisper-tiny")));
    }

    #[test]
    fn a_half_downloaded_model_is_partial_and_not_installed() {
        let (_d, store) = temp_store(App::Ensayo);
        let m = catalog::find("whisper-tiny").unwrap();
        sparse(&store.model_dir(m.id).join(format!("{}.part", m.files[0].name)), m.files[0].size / 2);
        let s = store.status(m.id);
        assert_eq!(state_name(&s), "partial");
        assert!(!is_installed(&s));
        assert!((fraction_of(&s).unwrap() - 0.5).abs() < 0.01);
    }

    const WHISPER: &str = "Whisper Large Turbo";

    fn said(e: StoreError) -> String {
        download_message(WHISPER, 574_041_195, &e)
    }

    #[test]
    fn offline_names_the_model_and_still_reads_as_a_lost_connection_to_the_window() {
        let m = said(StoreError::Download(DownloadError::Offline));
        assert!(m.starts_with("Couldn't download Whisper Large Turbo"), "{m}");
        // The window turns "Couldn't download ..." plus one of these words into its own offline sentence.
        assert!(m.to_lowercase().contains("offline"), "{m}");
    }

    #[test]
    fn a_web_page_where_the_model_should_be_says_to_sign_in_to_the_wifi() {
        let m = said(StoreError::Download(DownloadError::Refused { status: 200 }));
        assert!(m.contains("web page") && m.contains("sign in to this Wi-Fi") && m.contains(WHISPER), "{m}");
    }

    #[test]
    fn a_server_that_refuses_says_so_with_its_status() {
        let m = said(StoreError::Download(DownloadError::Refused { status: 503 }));
        assert!(m.contains("refused") && m.contains("503") && m.contains(WHISPER), "{m}");
        assert!(!m.contains("web page"), "{m}");
    }

    #[test]
    fn a_full_disk_says_how_much_room_the_model_needs() {
        let m = said(StoreError::Download(DownloadError::DiskFull));
        assert!(m.contains(WHISPER) && m.contains("574 MB") && m.contains("room"), "{m}");
        let big = download_message("Qwen3.5 9B", 5_680_522_464, &StoreError::Download(DownloadError::DiskFull));
        assert!(big.contains("5.7 GB"), "{big}");
    }

    #[test]
    fn a_damaged_download_says_try_again() {
        let m = said(StoreError::Download(DownloadError::Checksum { file: "x.bin".into() }));
        assert!(m.contains(WHISPER) && m.contains("damaged") && m.contains("Try again"), "{m}");
        assert!(!m.contains("x.bin"), "the model's name, not a file name: {m}");
    }

    #[test]
    fn a_stalled_download_says_so_and_that_it_resumes() {
        let m = said(StoreError::Download(DownloadError::Stalled));
        assert!(m.contains(WHISPER) && m.contains("no data for 30 seconds"), "{m}");
    }

    #[test]
    fn a_cancel_is_the_short_line_it_has_always_been() {
        assert_eq!(said(StoreError::Download(DownloadError::Cancelled)), "Cancelled.");
    }

    #[test]
    fn a_model_another_app_is_downloading_says_it_will_be_ready_when_that_finishes() {
        assert_eq!(said(StoreError::DownloadingElsewhere), "Another Craft Concepts app is downloading Whisper Large Turbo. It will be ready here when that finishes.");
    }

    #[test]
    fn the_other_failures_name_the_model_and_say_what_to_do() {
        for e in [StoreError::Io("permission denied".into()), StoreError::Download(DownloadError::Io("x".into()))] {
            let m = said(e);
            assert!(m.contains(WHISPER) && m.contains("try again"), "{m}");
        }
    }

    #[test]
    fn no_message_carries_a_path_or_the_engines_own_text() {
        let m = said(StoreError::Io("/Users/dana/Library/secret".into()));
        assert!(!m.contains("/Users") && !m.contains("secret"), "{m}");
    }

    #[test]
    fn start_up_with_nothing_to_move_finds_nothing_and_marks_what_ensayo_uses() {
        let (_d, store) = temp_store(App::Ensayo);
        let r = run_start_up(&store, &["whisper-tiny", "vad"]);
        assert_eq!(r, StartUp::default());
        // `open_at` never moves anything in, so it has nothing to say about it.
        assert!(r.error.is_none());
    }

    #[test]
    fn a_model_ensayo_uses_alone_is_erased_by_delete_and_kept_while_another_app_uses_it() {
        let dir = tempfile::tempdir().unwrap();
        let mine = SharedStore::open_at(App::Ensayo, dir.path().to_path_buf()).unwrap();
        let talaan = SharedStore::open_at(App::Talaan, dir.path().to_path_buf()).unwrap();
        install(&mine, "whisper-tiny");
        install(&mine, "whisper-base");
        mine.use_model("whisper-tiny").unwrap();
        mine.use_model("whisper-base").unwrap();
        talaan.use_model("whisper-base").unwrap();
        assert_eq!(release(&mine, "whisper-tiny"), Ok(Deleted { result: "erased" }));
        assert!(!mine.model_dir("whisper-tiny").exists());
        assert_eq!(release(&mine, "whisper-base"), Ok(Deleted { result: "kept" }));
        assert!(is_installed(&talaan.status("whisper-base")), "Talaan still has it");
        assert_eq!(release(&mine, "whisper-base"), Ok(Deleted { result: "not_using" }), "already let go");
    }

    #[test]
    fn releasing_every_model_erases_ensayos_own_and_leaves_the_ones_talaan_uses() {
        let dir = tempfile::tempdir().unwrap();
        let mine = SharedStore::open_at(App::Ensayo, dir.path().to_path_buf()).unwrap();
        let talaan = SharedStore::open_at(App::Talaan, dir.path().to_path_buf()).unwrap();
        for id in ["whisper-tiny", "whisper-base", "vad"] {
            install(&mine, id);
            mine.use_model(id).unwrap();
        }
        talaan.use_model("whisper-base").unwrap();
        mine.release_all().unwrap();
        assert!(!mine.model_dir("whisper-tiny").exists());
        assert!(!mine.model_dir("vad").exists());
        assert!(is_installed(&talaan.status("whisper-base")));
        assert_eq!(state_name(&mine.status("whisper-base")), "on_this_computer", "still there, no longer Ensayo's");
    }

    #[test]
    fn a_model_already_on_this_computer_is_not_downloaded_again_and_becomes_ensayos() {
        let dir = tempfile::tempdir().unwrap();
        let mine = SharedStore::open_at(App::Ensayo, dir.path().to_path_buf()).unwrap();
        let talaan = SharedStore::open_at(App::Talaan, dir.path().to_path_buf()).unwrap();
        install(&talaan, "whisper-tiny");
        talaan.use_model("whisper-tiny").unwrap();
        assert_eq!(state_name(&mine.status("whisper-tiny")), "on_this_computer");
        let mut seen = vec![];
        // The cancel flag is already set: a real download would stop at once, so success proves nothing was fetched.
        download(&mine, "whisper-tiny", "Whisper Tiny", &AtomicBool::new(true), &mut |p| seen.push(p)).unwrap();
        assert_eq!(seen, [1.0]);
        assert_eq!(state_name(&mine.status("whisper-tiny")), "ready");
    }

    #[test]
    fn a_download_cancelled_before_it_starts_reports_cancelled_and_leaves_nothing() {
        let (_d, store) = temp_store(App::Ensayo);
        let e = download(&store, "whisper-tiny", "Whisper Tiny", &AtomicBool::new(true), &mut |_| {}).unwrap_err();
        assert_eq!(e, "Cancelled.");
        assert_eq!(store.status("whisper-tiny"), Status::Missing);
    }

    #[test]
    fn a_model_the_catalog_does_not_have_is_a_plain_error() {
        let (_d, store) = temp_store(App::Ensayo);
        let e = download(&store, "nope", "nope", &AtomicBool::new(false), &mut |_| {}).unwrap_err();
        assert!(e.contains("nope") && e.contains("Settings"), "{e}");
    }

    #[test]
    fn only_one_download_runs_at_a_time_and_cancel_reaches_it() {
        let slot = DownloadSlot::new();
        let cancel = slot.begin("busy").unwrap();
        assert_eq!(slot.begin("busy").unwrap_err(), "busy");
        assert!(!cancel.load(Ordering::Relaxed));
        slot.cancel();
        assert!(cancel.load(Ordering::Relaxed));
        slot.end();
        assert!(slot.begin("busy").is_ok(), "free again once it ended");
    }

    #[test]
    fn a_model_that_is_loaded_is_not_erased_under_it() {
        let dir = tempfile::tempdir().unwrap();
        let mine = SharedStore::open_at(App::Ensayo, dir.path().to_path_buf()).unwrap();
        let talaan = SharedStore::open_at(App::Talaan, dir.path().to_path_buf()).unwrap();
        install(&mine, "whisper-tiny");
        mine.use_model("whisper-tiny").unwrap();
        let held = talaan.hold("whisper-tiny").unwrap();
        assert_eq!(release(&mine, "whisper-tiny"), Ok(Deleted { result: "kept" }));
        assert!(mine.model_dir("whisper-tiny").exists());
        drop(held);
    }
}
