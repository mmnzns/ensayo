//! Tauri commands for applications: the tracker, the process, the posting, the claims log, the resume and the night
//! before. The logic is in `storage::applications` and `applications/`; these pick the data folder and the engine and
//! turn errors into plain strings. Every command is async and does its file and model work on a blocking thread.
//!
//! Almost every command returns an `AppBundle`: the application in the shape of `Application` in `src/data/types.ts`
//! and its extras, so the screen can replace both after one call.

use crate::ai::llm::Llm;
use crate::applications::claims::{self, ClaimEdit, ClaimInput};
use crate::applications::cue::{self, CueSheet, LockInput};
use crate::applications::jd::{self, JdResult, QuestionInput};
use crate::applications::resume::{self, AttachResult, NoFallback, ReadResult};
use crate::applications::view::{self, ApplicationView, ExtrasView};
use crate::audio_retention::audio_path;
use crate::data_commands::{data_folder, open_for};
use crate::paths;
use crate::rep_commands::AiCtx;
use crate::storage::application_files::DerivedAnalysis;
use crate::storage::applications::{AppPatch, NewApplication, RemoveStage, SaveProcess, StageInput};
use crate::storage::targets::TargetFit;
use crate::storage::{Result as StorageResult, Storage, StorageError};
use chrono::{Local, NaiveDateTime};
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

type Cmd<T> = std::result::Result<T, String>;

fn plain(e: StorageError) -> String {
    match e {
        StorageError::Unavailable(p) => format!("The data folder isn't available: {}", p.display()),
        other => other.to_string(),
    }
}

fn open() -> StorageResult<Storage> {
    open_for(&data_folder(), &paths::default_data_dir())
}

fn now() -> NaiveDateTime {
    Local::now().naive_local()
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Cmd<T> + Send + 'static) -> Cmd<T> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

/// An application as the screens read it, with its extras.
#[derive(Debug, Serialize)]
pub struct AppBundle {
    pub application: ApplicationView,
    pub extras: ExtrasView,
}

pub fn bundle(storage: &Storage, id: &str, at: NaiveDateTime) -> StorageResult<AppBundle> {
    let rec = storage.application(id)?;
    let stories = storage.load_stories()?.items;
    let sessions = storage.sessions()?.items;
    let targets = storage.targets()?;
    let ctx = view::Ctx { now: at, stories: &stories, sessions: &sessions, targets: &targets };
    Ok(AppBundle { application: view::build(storage, &rec, &ctx)?, extras: view::build_extras(storage, &rec, &ctx)? })
}

/// Every application in list order, with extras. What `load_all` also returns, for refreshing the list on its own.
#[derive(Debug, Serialize)]
pub struct ApplicationsState {
    pub applications: Vec<ApplicationView>,
    pub application_extras: BTreeMap<String, ExtrasView>,
    pub problems: Vec<String>,
}

pub fn state_with(storage: &Storage, at: NaiveDateTime) -> StorageResult<ApplicationsState> {
    let all = view::load_all(storage, at)?;
    Ok(ApplicationsState { applications: all.applications, application_extras: all.extras, problems: all.problems })
}

/// Runs `f` with the chosen engine and the application's budget when one is set up and usable. When none is, runs it
/// without one; the reason comes back in plain words when an engine is chosen but cannot be used.
fn with_engine<T>(application_id: &str, f: impl FnOnce(Option<AiCtx>) -> T) -> (T, Option<String>) {
    match crate::ai_commands::resolved_from_disk() {
        Ok(Some(engine)) => {
            let llm = engine.client();
            let (provider, cap_usd) = engine.budget_basis();
            let out = crate::ai_commands::with_budget(&format!("application-{application_id}"), provider, cap_usd, |budget| f(Some(AiCtx { llm: llm.as_ref() as &dyn Llm, budget })));
            (out, None)
        }
        Ok(None) => (f(None), None),
        Err(reason) => (f(None), Some(reason)),
    }
}

fn reborrow<'a>(ai: &'a mut Option<AiCtx<'_>>) -> Option<AiCtx<'a>> {
    ai.as_mut().map(|c| AiCtx { llm: c.llm, budget: &mut *c.budget })
}

/// The notice for a reading that fell back because the chosen engine cannot be used.
fn engine_problem(reason: &str, what: &str) -> String {
    format!("{reason} {what}")
}

// ---------- the tracker ----------

pub fn create_with(storage: &Storage, new: NewApplication, posting: Option<&str>, today: chrono::NaiveDate, at: NaiveDateTime) -> StorageResult<AppBundle> {
    let rec = storage.create_application(new, today)?;
    if let Some(text) = posting.filter(|t| !t.trim().is_empty()) {
        storage.save_application_text(&rec.id, "jd.txt", text)?;
    }
    bundle(storage, &rec.id, at)
}

#[derive(Debug, Serialize)]
pub struct DeleteResult {
    /// Sessions kept as "practice without an application".
    pub kept_sessions: usize,
    /// Reps deleted along with the application.
    pub deleted_reps: usize,
}

/// Deletes an application. Its reps stay as practice without an application unless `delete_reps` says to delete them
/// too; then the sessions go to the trash (restorable for seven days), and their audio to the audio trash.
pub fn delete_with(storage: &Storage, audio_root: &Path, trash_audio: &Path, id: &str, delete_reps: bool) -> StorageResult<DeleteResult> {
    let out = storage.delete_application(id, delete_reps)?;
    for session in &out.trashed_sessions {
        let _ = crate::audio_retention::move_to_trash(audio_root, trash_audio, session);
    }
    Ok(DeleteResult { kept_sessions: out.kept_sessions, deleted_reps: out.deleted_reps.len() })
}

/// Changes the core fields. When the application moves to another target and `rebuild_questions` is set, the prepared
/// questions are made again for the new target (the ones the user edited stay).
pub fn update_with(storage: &Storage, ai: Option<AiCtx>, id: &str, patch: AppPatch, at: NaiveDateTime) -> StorageResult<AppBundle> {
    let rebuild = patch.rebuild_questions;
    let before = storage.application_target(&storage.application(id)?)?;
    let rec = storage.update_application(id, patch)?;
    if storage.application_target(&rec)? != before {
        if rebuild {
            jd::rebuild_questions(storage, ai, id)?;
        }
        // The notes on where the posting does not fit are about the target it is filed under.
        crate::applications::target_fit::refit_application(storage, id)?;
    }
    bundle(storage, id, at)
}

// ---------- the process ----------

/// Asking before a stage that has sessions is removed: `needs_confirm`, then call again with the yes.
#[derive(Debug, Serialize)]
pub struct ProcessOutcome {
    /// `saved` or `needs_confirm`.
    pub status: &'static str,
    /// For `needs_confirm`: how many sessions the stages being removed have.
    pub sessions: usize,
    pub stage_ids: Vec<String>,
    pub bundle: Option<AppBundle>,
}

pub fn save_process_with(storage: &Storage, id: &str, stages: Vec<StageInput>, confirm: bool, at: NaiveDateTime) -> StorageResult<ProcessOutcome> {
    Ok(match storage.save_process(id, stages, confirm)? {
        SaveProcess::NeedsConfirm { sessions, stage_ids } => ProcessOutcome { status: "needs_confirm", sessions, stage_ids, bundle: None },
        SaveProcess::Saved(_) => ProcessOutcome { status: "saved", sessions: 0, stage_ids: vec![], bundle: Some(bundle(storage, id, at)?) },
    })
}

pub fn remove_stage_with(storage: &Storage, id: &str, stage_id: &str, confirm: bool, at: NaiveDateTime) -> StorageResult<ProcessOutcome> {
    Ok(match storage.remove_stage(id, stage_id, confirm)? {
        RemoveStage::NeedsConfirm { sessions } => ProcessOutcome { status: "needs_confirm", sessions, stage_ids: vec![stage_id.to_string()], bundle: None },
        RemoveStage::Removed { .. } => ProcessOutcome { status: "saved", sessions: 0, stage_ids: vec![], bundle: Some(bundle(storage, id, at)?) },
    })
}

// ---------- the posting ----------

#[derive(Debug, Serialize)]
pub struct PostingOutcome {
    pub changed: bool,
    /// There is already a reading: ask "Read it again?" (`analyse_jd`).
    pub has_analysis: bool,
    pub bundle: AppBundle,
}

#[derive(Debug, Serialize)]
pub struct JdOutcome {
    pub result: JdResult,
    /// How the posting reads against the targets (the same as `bundle.application.targetFit`); null with no target to compare.
    #[serde(rename = "targetFit")]
    pub target_fit: Option<TargetFit>,
    /// The resume was read again with the new reading of the posting (the "say these out loud" list).
    pub resume: Option<ReadResult>,
    pub bundle: AppBundle,
}

/// Reads the posting (saving `text` first when given), and when the engine did it and the resume has been read before,
/// reads the resume again so its "say these out loud" list matches the posting.
pub fn analyse_with(storage: &Storage, mut ai: Option<AiCtx>, unavailable: Option<&str>, id: &str, text: Option<&str>, at: NaiveDateTime) -> StorageResult<JdOutcome> {
    if let Some(t) = text {
        jd::save_posting(storage, id, t)?;
    }
    let mut result = jd::analyse(storage, reborrow(&mut ai), id)?;
    if let (Some(reason), Some(_)) = (unavailable, result.notice.as_ref()) {
        result.notice = Some(engine_problem(reason, "The posting was read by keywords only, and the questions come from the general set."));
    }
    let mut resume = None;
    if result.source == "ai" && ai.is_some() {
        let read_before = storage.load_application_part::<crate::storage::application_files::ResumeRec>(id, "resume/resume.json")?.is_some_and(|r| r.status == "read");
        if read_before {
            resume = Some(resume::read_resume(storage, reborrow(&mut ai), id)?);
        }
    }
    Ok(JdOutcome { target_fit: result.target_fit.clone(), result, resume, bundle: bundle(storage, id, at)? })
}

// ---------- the resume ----------

#[derive(Debug, Serialize)]
pub struct ResumeOutcome {
    pub attach: Option<AttachResult>,
    pub read: Option<ReadResult>,
    pub bundle: AppBundle,
}

fn finish_attach(storage: &Storage, mut ai: Option<AiCtx>, unavailable: Option<&str>, id: &str, attach: AttachResult, read: bool, at: NaiveDateTime) -> StorageResult<ResumeOutcome> {
    let mut read_result = None;
    if read && attach.status == "attached" {
        let mut r = resume::read_resume(storage, reborrow(&mut ai), id)?;
        if let (Some(reason), Some(_)) = (unavailable, r.notice.as_ref()) {
            r.notice = Some(engine_problem(reason, "The resume was read by pattern only: the numbers and dates in it."));
        }
        read_result = Some(r);
    }
    Ok(ResumeOutcome { attach: Some(attach), read: read_result, bundle: bundle(storage, id, at)? })
}

pub fn attach_with(storage: &Storage, ai: Option<AiCtx>, unavailable: Option<&str>, id: &str, path: &Path, confirm_replace: bool, read: bool, at: NaiveDateTime) -> StorageResult<ResumeOutcome> {
    let attach = resume::attach_resume(storage, id, path, confirm_replace, &NoFallback)?;
    finish_attach(storage, ai, unavailable, id, attach, read, at)
}

pub fn attach_bytes_with(storage: &Storage, ai: Option<AiCtx>, unavailable: Option<&str>, id: &str, file_name: &str, data: &[u8], confirm_replace: bool, read: bool, at: NaiveDateTime) -> StorageResult<ResumeOutcome> {
    let attach = resume::attach_bytes(storage, id, file_name, data, confirm_replace, &NoFallback)?;
    finish_attach(storage, ai, unavailable, id, attach, read, at)
}

pub fn use_from_with(storage: &Storage, ai: Option<AiCtx>, unavailable: Option<&str>, id: &str, from_id: &str, confirm_replace: bool, read: bool, at: NaiveDateTime) -> StorageResult<ResumeOutcome> {
    let attach = resume::use_resume_from(storage, id, from_id, confirm_replace, &NoFallback)?;
    finish_attach(storage, ai, unavailable, id, attach, read, at)
}

pub fn paste_with(storage: &Storage, ai: Option<AiCtx>, unavailable: Option<&str>, id: &str, text: &str, confirm_replace: bool, read: bool, at: NaiveDateTime) -> StorageResult<ResumeOutcome> {
    let attach = resume::paste_resume_text(storage, id, text, confirm_replace)?;
    finish_attach(storage, ai, unavailable, id, attach, read, at)
}

// ---------- the commands ----------

/// Every application in list order, with its extras (also part of `load_all`).
#[tauri::command]
pub async fn load_applications() -> Cmd<ApplicationsState> {
    blocking(|| open().and_then(|s| state_with(&s, now())).map_err(plain)).await
}

/// Adds an application. `posting` is saved as the pasted job posting; reading it is `analyse_jd`.
#[tauri::command]
pub async fn create_application(new: NewApplication, posting: Option<String>) -> Cmd<AppBundle> {
    blocking(move || {
        let n = now();
        open().and_then(|s| create_with(&s, new, posting.as_deref(), n.date(), n)).map_err(plain)
    })
    .await
}

/// Changes core fields (company, role, status, closed reason, date applied, source, contacts, notes, startup, target).
/// Each field that differs is saved and listed in `edited_by_user`. Closing needs a reason. With `targetId` the
/// application moves to that target; with `rebuildQuestions` as well, its prepared questions are made again for it.
#[tauri::command]
pub async fn update_application(application_id: String, patch: AppPatch) -> Cmd<AppBundle> {
    blocking(move || {
        let s = open().map_err(plain)?;
        let (out, _unavailable) = with_engine(&application_id, |ai| update_with(&s, ai, &application_id, patch, now()));
        out.map_err(plain)
    })
    .await
}

/// Deletes an application. Its reps stay as practice without an application unless `delete_reps` is true.
#[tauri::command]
pub async fn delete_application(application_id: String, delete_reps: bool) -> Cmd<DeleteResult> {
    blocking(move || open().and_then(|s| delete_with(&s, &paths::audio_dir(), &paths::audio_trash_dir(), &application_id, delete_reps)).map_err(plain)).await
}

/// The whole stage list as Edit details has it: rows in order, new rows without an id, rows left out are removed.
/// `needs_confirm` when a removed stage has sessions; call again with `confirm`.
#[tauri::command]
pub async fn save_process(application_id: String, stages: Vec<StageInput>, confirm: bool) -> Cmd<ProcessOutcome> {
    blocking(move || open().and_then(|s| save_process_with(&s, &application_id, stages, confirm, now())).map_err(plain)).await
}

#[tauri::command]
pub async fn add_stage(application_id: String, stage: String, label: Option<String>, at: Option<String>) -> Cmd<AppBundle> {
    blocking(move || {
        let s = open().map_err(plain)?;
        s.add_stage(&application_id, &stage, label.as_deref(), at.as_deref()).map_err(plain)?;
        bundle(&s, &application_id, now()).map_err(plain)
    })
    .await
}

/// Removes one stage; `needs_confirm` when it has sessions (they stay, under their old stage name).
#[tauri::command]
pub async fn remove_stage(application_id: String, stage_id: String, confirm: bool) -> Cmd<ProcessOutcome> {
    blocking(move || open().and_then(|s| remove_stage_with(&s, &application_id, &stage_id, confirm, now())).map_err(plain)).await
}

#[tauri::command]
pub async fn reorder_stages(application_id: String, order: Vec<String>) -> Cmd<AppBundle> {
    blocking(move || {
        let s = open().map_err(plain)?;
        s.reorder_stages(&application_id, &order).map_err(plain)?;
        bundle(&s, &application_id, now()).map_err(plain)
    })
    .await
}

#[tauri::command]
pub async fn rename_stage(application_id: String, stage_id: String, label: String) -> Cmd<AppBundle> {
    blocking(move || {
        let s = open().map_err(plain)?;
        s.rename_stage(&application_id, &stage_id, &label).map_err(plain)?;
        bundle(&s, &application_id, now()).map_err(plain)
    })
    .await
}

/// Sets or clears (`at` null) a stage's date: "2026-10-23T14:00", or "2026-10-23" when the time is not known. The
/// night-before suggestion moves with it.
#[tauri::command]
pub async fn set_stage_time(application_id: String, stage_id: String, at: Option<String>) -> Cmd<AppBundle> {
    blocking(move || {
        let s = open().map_err(plain)?;
        s.set_stage_time(&application_id, &stage_id, at.as_deref()).map_err(plain)?;
        bundle(&s, &application_id, now()).map_err(plain)
    })
    .await
}

#[tauri::command]
pub async fn set_stage_done(application_id: String, stage_id: String, done: bool) -> Cmd<AppBundle> {
    blocking(move || {
        let s = open().map_err(plain)?;
        s.set_stage_done(&application_id, &stage_id, done).map_err(plain)?;
        bundle(&s, &application_id, now()).map_err(plain)
    })
    .await
}

/// Saves the pasted posting. When it changed and there is already a reading, ask "Read it again?" (`analyse_jd`).
#[tauri::command]
pub async fn save_posting(application_id: String, text: String) -> Cmd<PostingOutcome> {
    blocking(move || {
        let s = open().map_err(plain)?;
        let saved = jd::save_posting(&s, &application_id, &text).map_err(plain)?;
        Ok(PostingOutcome { changed: saved.changed, has_analysis: saved.has_analysis, bundle: bundle(&s, &application_id, now()).map_err(plain)? })
    })
    .await
}

/// Reads the saved posting (saving `text` first when given): with the engine when one is set up, by keywords when not
/// (the result says so). Keeps what the user edited, says what changed. Also reads the resume again when it was read
/// before, so its "say these out loud" list matches.
#[tauri::command]
pub async fn analyse_jd(application_id: String, text: Option<String>) -> Cmd<JdOutcome> {
    blocking(move || {
        let s = open().map_err(plain)?;
        let (out, unavailable) = with_engine(&application_id, |ai| analyse_with(&s, ai, None, &application_id, text.as_deref(), now()));
        let mut out = out.map_err(plain)?;
        if let (Some(reason), Some(_)) = (unavailable, out.result.notice.as_ref()) {
            out.result.notice = Some(engine_problem(&reason, "The posting was read by keywords only, and the questions come from the general set."));
        }
        Ok(out)
    })
    .await
}

/// The user's edit of what was read from the posting (summary, priorities, beliefs, gaps, phrases).
#[tauri::command]
pub async fn save_analysis(application_id: String, analysis: DerivedAnalysis) -> Cmd<AppBundle> {
    blocking(move || {
        let s = open().map_err(plain)?;
        jd::save_analysis(&s, &application_id, analysis).map_err(plain)?;
        bundle(&s, &application_id, now()).map_err(plain)
    })
    .await
}

/// Adds a question (no `id`) or changes one. Either way it is the user's, and reading the posting again keeps it.
#[tauri::command]
pub async fn save_question(application_id: String, question: QuestionInput) -> Cmd<AppBundle> {
    blocking(move || {
        let s = open().map_err(plain)?;
        jd::save_question(&s, &application_id, question).map_err(plain)?;
        bundle(&s, &application_id, now()).map_err(plain)
    })
    .await
}

#[tauri::command]
pub async fn delete_question(application_id: String, question_id: String) -> Cmd<AppBundle> {
    blocking(move || {
        let s = open().map_err(plain)?;
        jd::delete_question(&s, &application_id, &question_id).map_err(plain)?;
        bundle(&s, &application_id, now()).map_err(plain)
    })
    .await
}

/// Fixes a line in the claims log (a resume line or something said). The file is never changed.
#[tauri::command]
pub async fn edit_claim(application_id: String, claim_id: String, edit: ClaimEdit) -> Cmd<AppBundle> {
    blocking(move || {
        let s = open().map_err(plain)?;
        claims::edit_claim(&s, &application_id, &claim_id, edit).map_err(plain)?;
        bundle(&s, &application_id, now()).map_err(plain)
    })
    .await
}

#[tauri::command]
pub async fn remove_claim(application_id: String, claim_id: String) -> Cmd<AppBundle> {
    blocking(move || {
        let s = open().map_err(plain)?;
        claims::remove_claim(&s, &application_id, &claim_id).map_err(plain)?;
        bundle(&s, &application_id, now()).map_err(plain)
    })
    .await
}

/// "+ Add a line": a claim the user writes (`stage` is `resume` or a stage id).
#[tauri::command]
pub async fn add_claim(application_id: String, claim: ClaimInput) -> Cmd<AppBundle> {
    blocking(move || {
        let s = open().map_err(plain)?;
        claims::add_claim(&s, &application_id, claim).map_err(plain)?;
        bundle(&s, &application_id, now()).map_err(plain)
    })
    .await
}

/// "It's X now": the claim is replaced by a new one with `new_value`, and every older version of the same thing stops
/// counting, so later answers are not flagged against it.
#[tauri::command]
pub async fn mark_claim_updated(application_id: String, claim_id: String, new_value: String) -> Cmd<AppBundle> {
    blocking(move || {
        let s = open().map_err(plain)?;
        claims::mark_claim_updated(&s, &application_id, &claim_id, &new_value).map_err(plain)?;
        bundle(&s, &application_id, now()).map_err(plain)
    })
    .await
}

/// "Mark as current": this claim is the answer now; the other versions of the same thing stop counting.
#[tauri::command]
pub async fn mark_claim_current(application_id: String, claim_id: String) -> Cmd<AppBundle> {
    blocking(move || {
        let s = open().map_err(plain)?;
        claims::mark_claim_current(&s, &application_id, &claim_id).map_err(plain)?;
        bundle(&s, &application_id, now()).map_err(plain)
    })
    .await
}

/// Attaches the resume file (PDF or Word, copied in unchanged, its text read on this computer). `attach.status` is
/// `attached`, `needs_confirm` (one is already attached: ask, then call again with `confirm_replace`), or `no_text`
/// (a scan: offer `paste_resume_text`). With `read` true and the file readable, the resume is read with the engine
/// right away: send that only after the user confirmed.
#[tauri::command]
pub async fn attach_resume(application_id: String, path: PathBuf, confirm_replace: bool, read: bool) -> Cmd<ResumeOutcome> {
    blocking(move || {
        let s = open().map_err(plain)?;
        let (out, unavailable) = with_engine(&application_id, |ai| attach_with(&s, ai, None, &application_id, &path, confirm_replace, read, now()));
        fix_resume_notice(out.map_err(plain)?, unavailable)
    })
    .await
}

fn fix_resume_notice(mut out: ResumeOutcome, unavailable: Option<String>) -> Cmd<ResumeOutcome> {
    if let (Some(reason), Some(r)) = (unavailable, out.read.as_mut()) {
        if r.notice.is_some() {
            r.notice = Some(engine_problem(&reason, "The resume was read by pattern only: the numbers and dates in it."));
        }
    }
    Ok(out)
}

/// The same as `attach_resume`, for a file the window has in memory (a drop or the file picker gives no path):
/// `data` is the file's bytes as an array of numbers, `file_name` its name with the extension.
#[tauri::command]
pub async fn attach_resume_bytes(application_id: String, file_name: String, data: Vec<u8>, confirm_replace: bool, read: bool) -> Cmd<ResumeOutcome> {
    blocking(move || {
        let s = open().map_err(plain)?;
        let (out, unavailable) = with_engine(&application_id, |ai| attach_bytes_with(&s, ai, None, &application_id, &file_name, &data, confirm_replace, read, now()));
        fix_resume_notice(out.map_err(plain)?, unavailable)
    })
    .await
}

/// "Use one from another application": copies that application's resume file.
#[tauri::command]
pub async fn use_resume_from(application_id: String, from_application_id: String, confirm_replace: bool, read: bool) -> Cmd<ResumeOutcome> {
    blocking(move || {
        let s = open().map_err(plain)?;
        let (out, unavailable) = with_engine(&application_id, |ai| use_from_with(&s, ai, None, &application_id, &from_application_id, confirm_replace, read, now()));
        fix_resume_notice(out.map_err(plain)?, unavailable)
    })
    .await
}

/// "I didn't send one". `attach.status` is `needs_confirm` when a resume is attached (its lines go too), else `none`.
#[tauri::command]
pub async fn set_no_resume(application_id: String, confirm: bool) -> Cmd<ResumeOutcome> {
    blocking(move || {
        let s = open().map_err(plain)?;
        let attach = resume::set_no_resume(&s, &application_id, confirm).map_err(plain)?;
        Ok(ResumeOutcome { attach: Some(attach), read: None, bundle: bundle(&s, &application_id, now()).map_err(plain)? })
    })
    .await
}

/// The resume's text pasted by the user (a scanned PDF, or no file at all).
#[tauri::command]
pub async fn paste_resume_text(application_id: String, text: String, confirm_replace: bool, read: bool) -> Cmd<ResumeOutcome> {
    blocking(move || {
        let s = open().map_err(plain)?;
        let (out, unavailable) = with_engine(&application_id, |ai| paste_with(&s, ai, None, &application_id, &text, confirm_replace, read, now()));
        fix_resume_notice(out.map_err(plain)?, unavailable)
    })
    .await
}

/// Reads the attached resume (prompt 11) after the user confirmed: claims into the log as stage `resume`, the "say
/// these out loud" list (needs the posting read by the engine; otherwise it waits), story suggestions. Without an
/// engine it finds numbers and dates by pattern and says so. Also the way to read again.
#[tauri::command]
pub async fn read_resume(application_id: String) -> Cmd<ResumeOutcome> {
    blocking(move || {
        let s = open().map_err(plain)?;
        let (read, unavailable) = with_engine(&application_id, |ai| resume::read_resume(&s, ai, &application_id));
        let mut read = read.map_err(plain)?;
        if let (Some(reason), Some(_)) = (unavailable, read.notice.as_ref()) {
            read.notice = Some(engine_problem(&reason, "The resume was read by pattern only: the numbers and dates in it."));
        }
        Ok(ResumeOutcome { attach: None, read: Some(read), bundle: bundle(&s, &application_id, now()).map_err(plain)? })
    })
    .await
}

/// "Open" on the Resume tab: shows the attached file in the computer's own viewer. The file is never changed.
#[tauri::command]
pub async fn open_resume(application_id: String) -> Cmd<()> {
    blocking(move || {
        let s = open().map_err(plain)?;
        let path = resume::resume_file(&s, &application_id).map_err(plain)?.ok_or("There is no resume file to open. It was pasted as text, or none is attached.")?;
        open_with_system(&path)
    })
    .await
}

fn open_with_system(path: &Path) -> Cmd<()> {
    #[cfg(target_os = "macos")]
    let spawned = std::process::Command::new("open").arg(path).spawn();
    #[cfg(target_os = "windows")]
    let spawned = std::process::Command::new("cmd").args(["/C", "start", ""]).arg(path).spawn();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let spawned = std::process::Command::new("xdg-open").arg(path).spawn();
    spawned.map(|_| ()).map_err(|_| "Ensayo couldn't open the resume in your viewer.".to_string())
}

/// The Mock debrief reports which "say these out loud" items (`ms-1`...) were said in a Mock.
#[tauri::command]
pub async fn record_must_say(application_id: String, said_ids: Vec<String>) -> Cmd<AppBundle> {
    blocking(move || {
        let s = open().map_err(plain)?;
        resume::record_must_say(&s, &application_id, &said_ids).map_err(plain)?;
        bundle(&s, &application_id, now()).map_err(plain)
    })
    .await
}

/// Takes a suggested story off the resume's list (after it became a story, or when it is not wanted).
#[tauri::command]
pub async fn drop_story_suggestion(application_id: String, bullet: String) -> Cmd<AppBundle> {
    blocking(move || {
        let s = open().map_err(plain)?;
        resume::drop_story_suggestion(&s, &application_id, &bullet).map_err(plain)?;
        bundle(&s, &application_id, now()).map_err(plain)
    })
    .await
}

/// Locks the night-before set for a stage: the opener (beats separated by new lines), one power story from the bank,
/// and up to two questions to ask. Replaces an earlier lock.
#[tauri::command]
pub async fn save_locked(application_id: String, stage_id: String, opener: String, power_story: String, questions: Vec<String>, opener_prompt: Option<String>) -> Cmd<AppBundle> {
    blocking(move || {
        let s = open().map_err(plain)?;
        cue::save_locked(&s, &application_id, &stage_id, LockInput { opener, opener_prompt, power_story, questions }).map_err(plain)?;
        bundle(&s, &application_id, now()).map_err(plain)
    })
    .await
}

#[tauri::command]
pub async fn clear_locked(application_id: String, stage_id: String) -> Cmd<AppBundle> {
    blocking(move || {
        let s = open().map_err(plain)?;
        cue::clear_locked(&s, &application_id, &stage_id).map_err(plain)?;
        bundle(&s, &application_id, now()).map_err(plain)
    })
    .await
}

/// The cue sheet for a stage's lock (null when nothing is locked). The PDF is the screen printed.
#[tauri::command]
pub async fn cue_sheet(application_id: String, stage_id: String) -> Cmd<Option<CueSheet>> {
    blocking(move || open().and_then(|s| cue::cue_sheet(&s, &application_id, &stage_id)).map_err(plain)).await
}

/// The same content as Markdown, as a string to save.
#[tauri::command]
pub async fn cue_sheet_markdown(application_id: String, stage_id: String) -> Cmd<String> {
    blocking(move || open().and_then(|s| cue::cue_sheet_markdown(&s, &application_id, &stage_id)).map_err(plain)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::providers::Provider;
    use crate::scoring::run::testing::Scripted;
    use crate::scoring::run::Budget;
    use crate::storage::model::{ProofPoint, Story, Usage};
    use crate::storage::reps::Session;
    use chrono::NaiveDate;
    use serde_json::json;

    const KESTREL: &str = include_str!("../tests/fixtures/jd/kestrel-pay.txt");
    const JD_REPLY: &str = include_str!("../tests/fixtures/jd/kestrel-pay.reply.json");
    const DANA: &str = include_str!("../../prompts/examples/resume/resume.txt");

    fn at() -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 10, 21).unwrap().and_hms_opt(20, 0, 0).unwrap()
    }

    fn setup() -> (tempfile::TempDir, Storage) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::init(dir.path().join("data")).unwrap();
        s.save_story(&Story {
            id: "st_onboarding".into(),
            title: "Onboarding drop-off".into(),
            employer: "Fernhill".into(),
            best_for: vec![],
            direct_answer: "".into(),
            context: "".into(),
            approach: "".into(),
            action: "".into(),
            ownership: "".into(),
            result: "".into(),
            proof_points: vec![ProofPoint { label: "activation_7d".into(), metric: "7-day activation".into(), before: "31".into(), after: "44".into(), unit: "%".into(), approximate: false, verified: true }],
            scale: "".into(),
            competencies: vec![],
            great_eight: vec![],
            branches: vec![],
            verified: true,
            headline: "".into(),
            usage: Usage::default(),
            year: None,
            angles: vec![],
        })
        .unwrap();
        (dir, s)
    }

    fn new_app(startup: bool) -> NewApplication {
        NewApplication { company: "Kestrel Pay".into(), role: "Senior Lifecycle Marketing Manager".into(), startup, ..Default::default() }
    }

    fn make(s: &Storage) -> String {
        create_with(s, new_app(false), Some(KESTREL), NaiveDate::from_ymd_opt(2026, 10, 15).unwrap(), at()).unwrap().application.id
    }

    fn run_ai<T>(llm: &Scripted, f: impl FnOnce(Option<AiCtx>) -> T) -> T {
        let mut budget = Budget::new(Provider::Claude, 0.0);
        f(Some(AiCtx { llm, budget: &mut budget }))
    }

    fn resume_reply() -> String {
        let c = |id: &str, kind: &str, subject: &str, value: &str, quote: &str| json!({"id": id, "type": kind, "subject": subject, "value": value, "quote": quote});
        json!({
            "unreadable": false,
            "claims": [c("r1", "role_title", "Title", "Senior Lifecycle Manager, Fernhill", "Senior Lifecycle Manager, Fernhill (neobank)"), c("r2", "proof_number", "7-day activation", "31% to 44%", "Lifted 7-day activation from 31% to 44% in one quarter")],
            "bank_check": [{"claim_id": "r2", "result": "matches", "story_id": "st_onboarding", "note": "Matches."}],
            "must_say": [{"qualification": "You ran lifecycle with no ops team", "resume_quote": "Sole lifecycle owner: strategy, journeys, testing and reporting with no marketing ops team", "why": "x", "story_id": null}],
            "story_suggestions": []
        })
        .to_string()
    }

    // ---------- targets ----------

    fn with_two_targets(s: &Storage) -> (crate::storage::targets::Target, crate::storage::targets::Target) {
        use crate::storage::targets::Target;
        s.save_profile(&crate::storage::model::Profile { name: "Dana".into(), full_name: "".into(), target_role: "Senior Lifecycle Marketing Manager".into(), seniority: "senior".into(), industry: "Fintech".into(), sells_to: "b2c".into(), identity_statement: "I fix activation.".into(), focus_habits: vec![] }).unwrap();
        let first = s.targets().unwrap().remove(0);
        let ops = s.save_target(&Target { role: "Marketing Operations Manager".into(), role_family: "marketing_ops".into(), sells_to: "b2b".into(), ..Default::default() }).unwrap();
        (first, ops)
    }

    #[test]
    fn an_application_is_created_under_the_target_asked_for_else_the_active_one_and_the_view_says_so() {
        let (_d, s) = setup();
        let (first, ops) = with_two_targets(&s);
        let day = NaiveDate::from_ymd_opt(2026, 10, 15).unwrap();
        let default = create_with(&s, new_app(false), None, day, at()).unwrap();
        assert_eq!(default.application.target_id.as_deref(), Some(first.id.as_str()));
        let asked: NewApplication = serde_json::from_value(json!({ "company": "Northpine", "targetId": ops.id })).unwrap();
        let named = create_with(&s, asked, None, day, at()).unwrap();
        assert_eq!(named.application.target_id.as_deref(), Some(ops.id.as_str()));
        let snake: NewApplication = serde_json::from_value(json!({ "company": "Northpine", "target_id": ops.id })).unwrap();
        assert_eq!(snake.target_id.as_deref(), Some(ops.id.as_str()));
        let json = serde_json::to_value(&named.application).unwrap();
        assert_eq!(json["targetId"], ops.id.as_str());
        assert!(json.get("targetFit").is_some_and(|v| v.is_null()), "no fit until a posting is read");
    }

    #[test]
    fn reading_the_posting_returns_the_fit_as_target_fit_and_the_view_carries_it() {
        let (_d, s) = setup();
        let (first, ops) = with_two_targets(&s);
        let id = make(&s);
        let out = analyse_with(&s, None, None, &id, None, at()).unwrap();
        let json = serde_json::to_value(&out).unwrap();
        assert_eq!(json["targetFit"]["bestTargetId"], first.id.as_str());
        assert_eq!(json["targetFit"]["perTarget"].as_array().unwrap().len(), 2);
        assert!(json["targetFit"]["perTarget"][0]["targetId"].is_string() && json["targetFit"]["mismatchNotes"].is_array());
        assert_eq!(json["bundle"]["application"]["targetFit"], json["targetFit"], "the application carries the same fit");
        let _ = ops;
    }

    fn patch(target: Option<&str>, rebuild: bool) -> AppPatch {
        serde_json::from_value(json!({ "targetId": target, "rebuildQuestions": rebuild })).unwrap()
    }

    #[test]
    fn moving_an_application_to_another_target_can_make_its_questions_again_and_keeps_the_ones_the_user_edited() {
        let (_d, s) = setup();
        let (first, ops) = with_two_targets(&s);
        let id = make(&s);
        analyse_with(&s, None, None, &id, None, at()).unwrap();
        jd::save_question(&s, &id, QuestionInput { id: None, stage_id: "stg_1".into(), kind: "behavioral".into(), text: "My own question?".into() }).unwrap();
        let before: Vec<String> = view::build_extras(&s, &s.application(&id).unwrap(), &view::Ctx { now: at(), stories: &[], sessions: &[], targets: &[] }).unwrap().questions.into_iter().map(|q| q.id).collect();
        // Only filing: the questions are not touched.
        let b = update_with(&s, None, &id, patch(Some(&ops.id), false), at()).unwrap();
        assert_eq!(b.application.target_id.as_deref(), Some(ops.id.as_str()));
        let same: Vec<String> = b.extras.questions.iter().map(|q| q.id.clone()).collect();
        assert_eq!(same, before, "no rebuild asked for");
        // Back to the first target, with a rebuild: new questions, the user's own stays.
        let b = update_with(&s, None, &id, patch(Some(&first.id), true), at()).unwrap();
        assert_eq!(b.application.target_id.as_deref(), Some(first.id.as_str()));
        assert!(b.extras.questions.iter().any(|q| q.text == "My own question?" && q.edited_by_user));
        assert_ne!(b.extras.questions.iter().map(|q| q.id.clone()).collect::<Vec<_>>(), before, "the set was made again (new question ids)");
    }

    #[test]
    fn keeping_the_target_is_remembered_and_forgotten_when_the_application_moves() {
        let (_d, s) = setup();
        let (a, b) = with_two_targets(&s);
        let id = make(&s);
        update_with(&s, None, &id, patch(Some(&a.id), false), at()).unwrap();
        let app = s.application(&id).unwrap();
        let kept = update_with(&s, None, &app.id, AppPatch { fit_dismissed_for: Some(a.id.clone()), ..Default::default() }, at()).unwrap();
        assert_eq!(kept.application.fit_dismissed_for.as_deref(), Some(a.id.as_str()));
        let moved = update_with(&s, None, &app.id, AppPatch { target_id: Some(b.id.clone()), ..Default::default() }, at()).unwrap();
        assert_eq!(moved.application.fit_dismissed_for, None, "a move starts the question afresh");
        update_with(&s, None, &app.id, AppPatch { fit_dismissed_for: Some(b.id.clone()), ..Default::default() }, at()).unwrap();
        let cleared = update_with(&s, None, &app.id, AppPatch { fit_dismissed_for: Some(String::new()), ..Default::default() }, at()).unwrap();
        assert_eq!(cleared.application.fit_dismissed_for, None);
    }

    #[test]
    fn moving_an_application_works_out_the_fit_again_for_its_new_target_without_a_new_reading() {
        let (_d, s) = setup();
        let (first, ops) = with_two_targets(&s);
        let id = make(&s);
        let read = analyse_with(&s, None, None, &id, None, at()).unwrap().target_fit.unwrap();
        assert!(read.mismatch_notes.is_empty(), "a lifecycle posting filed under the lifecycle target");
        let b = update_with(&s, None, &id, patch(Some(&ops.id), false), at()).unwrap();
        let fit = b.application.target_fit.unwrap();
        assert!(!fit.mismatch_notes.is_empty(), "now it is filed under marketing ops: {:?}", fit.mismatch_notes);
        assert_eq!(fit.best_target_id.as_deref(), Some(first.id.as_str()));
        assert_eq!((fit.sells_to, fit.role_family), (read.sells_to, read.role_family), "what the posting reads as is kept");
    }

    #[test]
    fn asking_for_a_rebuild_without_changing_the_target_does_nothing_to_the_questions() {
        let (_d, s) = setup();
        let (first, _ops) = with_two_targets(&s);
        let id = make(&s);
        analyse_with(&s, None, None, &id, None, at()).unwrap();
        let before = bundle(&s, &id, at()).unwrap().extras.questions.iter().map(|q| q.id.clone()).collect::<Vec<_>>();
        let b = update_with(&s, None, &id, patch(Some(&first.id), true), at()).unwrap();
        assert_eq!(b.extras.questions.iter().map(|q| q.id.clone()).collect::<Vec<_>>(), before);
        let b = update_with(&s, None, &id, patch(None, true), at()).unwrap();
        assert_eq!(b.extras.questions.iter().map(|q| q.id.clone()).collect::<Vec<_>>(), before);
    }

    #[test]
    fn an_unknown_or_archived_target_is_refused_and_the_application_stays_where_it_was() {
        let (_d, s) = setup();
        let (first, ops) = with_two_targets(&s);
        let id = make(&s);
        assert!(update_with(&s, None, &id, patch(Some("tg_nope"), false), at()).is_err());
        s.archive_target(&ops.id, None).unwrap();
        let err = update_with(&s, None, &id, patch(Some(&ops.id), false), at()).unwrap_err().to_string();
        assert!(err.contains("archived"), "{err}");
        assert_eq!(bundle(&s, &id, at()).unwrap().application.target_id.as_deref(), Some(first.id.as_str()));
    }

    #[test]
    fn rebuilding_with_the_engine_reads_the_posting_again() {
        let (_d, s) = setup();
        let (_first, ops) = with_two_targets(&s);
        let id = make(&s);
        let llm = Scripted::new(vec![Ok(JD_REPLY)]);
        let b = run_ai(&llm, |ai| update_with(&s, ai, &id, patch(Some(&ops.id), true), at())).unwrap();
        assert_eq!(b.extras.questions.len(), 12);
        assert!(llm.seen.lock().unwrap()[0].user.contains("Marketing Operations Manager"));
    }

    #[test]
    fn creating_an_application_with_a_posting_saves_it_and_returns_the_application_with_its_extras() {
        let (_d, s) = setup();
        let b = create_with(&s, new_app(true), Some(KESTREL), NaiveDate::from_ymd_opt(2026, 10, 15).unwrap(), at()).unwrap();
        assert_eq!((b.application.company.as_str(), b.application.startup, b.application.process.len()), ("Kestrel Pay", true, 4));
        assert!(b.extras.posting_text.contains("founder-led payments startup"));
        let none = create_with(&s, new_app(false), Some("   "), NaiveDate::from_ymd_opt(2026, 10, 15).unwrap(), at()).unwrap();
        assert_eq!(none.extras.posting_text, "", "a blank posting is not saved");
        assert!(create_with(&s, NewApplication { company: " ".into(), ..Default::default() }, None, NaiveDate::from_ymd_opt(2026, 10, 15).unwrap(), at()).is_err());
        let all = state_with(&s, at()).unwrap();
        assert_eq!(all.applications.len(), 2);
        assert_eq!(all.application_extras.len(), 2);
    }

    #[test]
    fn deleting_an_application_with_its_practice_moves_the_sessions_and_their_audio_to_the_trash_and_nothing_else() {
        let (d, s) = setup();
        let id = make(&s);
        let audio = d.path().join("audio");
        let mk = |ses: &str, app: Option<&str>| {
            s.save_session(&Session { id: ses.into(), mode: "drill".into(), stage: "recruiter".into(), application_id: app.map(String::from), stage_id: None, started: "2026-10-20T10:00:00Z".into(), target_id: None }).unwrap();
            std::fs::create_dir_all(s.root().join(format!("sessions/{ses}/reps/1"))).unwrap();
            std::fs::create_dir_all(audio.join(ses)).unwrap();
            std::fs::write(audio_path(&audio, ses, 1), b"RIFF").unwrap();
        };
        mk("ses_mine", Some(&id));
        mk("ses_free", None);
        let trash_audio = d.path().join("trash/audio");
        let kept = delete_with(&s, &audio, &trash_audio, &id, false).unwrap();
        assert_eq!((kept.kept_sessions, kept.deleted_reps), (1, 0));
        assert!(audio_path(&audio, "ses_mine", 1).exists(), "kept reps keep their audio");
        let id2 = make(&s);
        mk("ses_two", Some(&id2));
        let gone = delete_with(&s, &audio, &trash_audio, &id2, true).unwrap();
        assert_eq!((gone.kept_sessions, gone.deleted_reps), (0, 1));
        assert!(!audio_path(&audio, "ses_two", 1).exists());
        assert!(audio_path(&trash_audio, "ses_two", 1).exists(), "the audio waits in the audio trash");
        assert!(s.root().join("trash/sessions/ses_two/session.json").is_file());
        assert!(s.session("ses_two").unwrap().is_none());
        assert!(audio_path(&audio, "ses_free", 1).exists());
        assert!(audio_path(&audio, "ses_mine", 1).exists());
    }

    #[test]
    fn removing_a_stage_with_sessions_comes_back_as_a_question_and_then_as_a_saved_bundle() {
        let (_d, s) = setup();
        let id = make(&s);
        s.save_session(&Session { id: "ses_1".into(), mode: "drill".into(), stage: "panel".into(), application_id: Some(id.clone()), stage_id: Some("stg_3".into()), started: "2026-10-20T10:00:00Z".into(), target_id: None }).unwrap();
        let ask = remove_stage_with(&s, &id, "stg_3", false, at()).unwrap();
        assert_eq!((ask.status, ask.sessions, ask.bundle.is_none()), ("needs_confirm", 1, true));
        let done = remove_stage_with(&s, &id, "stg_3", true, at()).unwrap();
        assert_eq!(done.status, "saved");
        assert_eq!(done.bundle.unwrap().application.process.len(), 3);
        let json = serde_json::to_value(&ask).unwrap();
        assert_eq!(json["status"], "needs_confirm");
    }

    #[test]
    fn reading_the_posting_also_reads_the_resume_again_when_it_was_read_before_so_the_must_say_list_fills_in() {
        let (d, s) = setup();
        let id = make(&s);
        let pdf = d.path().join("dana.docx");
        // A Word file with the resume text.
        {
            use docx_rs::{Docx, Paragraph, Run};
            let mut doc = Docx::new();
            for l in DANA.lines() {
                doc = doc.add_paragraph(Paragraph::new().add_run(Run::new().add_text(l)));
            }
            let mut buf = std::io::Cursor::new(Vec::new());
            doc.build().pack(&mut buf).unwrap();
            std::fs::write(&pdf, buf.into_inner()).unwrap();
        }
        // Attached and read before the posting was read: the list waits.
        let llm = Scripted::new(vec![Ok(&resume_reply())]);
        let out = run_ai(&llm, |ai| attach_with(&s, ai, None, &id, &pdf, false, true, at())).unwrap();
        assert_eq!(out.attach.as_ref().unwrap().status, "attached");
        let read = out.read.unwrap();
        assert_eq!((read.status.as_str(), read.must_say_state.as_str()), ("read", "waiting_for_posting"));
        assert!(out.bundle.application.resume.as_ref().unwrap().must_say.is_empty());
        // The posting is read: the engine reads it, and the resume is read again with it.
        let llm = Scripted::new(vec![Ok(JD_REPLY), Ok(&resume_reply())]);
        let jd_out = run_ai(&llm, |ai| analyse_with(&s, ai, None, &id, None, at())).unwrap();
        assert_eq!(jd_out.result.source, "ai");
        let again = jd_out.resume.expect("the resume was read again");
        assert_eq!(again.must_say_state, "ready");
        assert_eq!(llm.calls(), 2);
        let must_say = &jd_out.bundle.application.resume.as_ref().unwrap().must_say;
        assert_eq!(must_say.len(), 1);
        assert_eq!(must_say[0].id, "ms-1");
        // A posting read by keywords, or a resume never read, does not trigger it.
        let (_d2, s2) = setup();
        let id2 = make(&s2);
        let llm = Scripted::new(vec![Ok(JD_REPLY)]);
        let out = run_ai(&llm, |ai| analyse_with(&s2, ai, None, &id2, None, at())).unwrap();
        assert!(out.resume.is_none());
        let none = analyse_with(&s2, None, None, &id2, None, at()).unwrap();
        assert!(none.resume.is_none() && none.result.source == "unchanged", "no engine: the earlier reading by the engine stays");
    }

    #[test]
    fn an_engine_that_is_chosen_but_cannot_be_used_is_named_in_the_notice() {
        let (_d, s) = setup();
        let id = make(&s);
        let out = analyse_with(&s, None, Some("The local AI model isn't downloaded yet."), &id, None, at()).unwrap();
        let notice = out.result.notice.unwrap();
        assert!(notice.starts_with("The local AI model isn't downloaded yet.") && notice.contains("keywords"), "{notice}");
        assert!(!notice.contains("No AI engine is set up"));
    }

    #[test]
    fn a_new_posting_text_is_saved_before_it_is_read() {
        let (_d, s) = setup();
        let id = make(&s);
        let out = analyse_with(&s, None, None, &id, Some("Lifecycle Manager at a bank. SQL and Braze. You will own onboarding emails and report monthly to the head of growth."), at()).unwrap();
        assert_eq!(out.result.source, "keywords");
        assert!(out.bundle.extras.posting_text.starts_with("Lifecycle Manager at a bank"));
        assert!(out.bundle.application.analysis.is_some());
        assert!(out.bundle.application.edited_by_user.contains(&"posting".to_string()), "changing the posting text is an edit");
    }

    #[test]
    fn attaching_does_not_read_unless_asked_and_a_scan_is_not_read_at_all() {
        let (d, s) = setup();
        let id = make(&s);
        let scan = d.path().join("scan.pdf");
        std::fs::write(&scan, b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n").unwrap();
        let llm = Scripted::new(vec![]);
        let out = run_ai(&llm, |ai| attach_with(&s, ai, None, &id, &scan, false, true, at())).unwrap();
        assert_eq!(out.attach.as_ref().unwrap().status, "no_text");
        assert!(out.read.is_none(), "nothing to read");
        assert_eq!(llm.calls(), 0);
        assert!(out.bundle.application.resume.as_ref().unwrap().needs_paste);
        let pasted = run_ai(&Scripted::new(vec![]), |ai| paste_with(&s, ai, None, &id, DANA, false, false, at())).unwrap();
        assert_eq!(pasted.attach.unwrap().status, "attached");
        assert!(pasted.read.is_none(), "reading waits for the user's yes");
        assert!(!pasted.bundle.application.resume.unwrap().needs_paste);
    }
}
