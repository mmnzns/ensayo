//! The rep loop on the Rust side: turn a recording into a measured, saved rep. The measuring is `metrics` (pure);
//! the judging is `scoring` (a model, when one is set up); this module picks the numbers to measure against, saves,
//! and moves the audio to its machine-local home. Every command is async and does its file and model work on a
//! blocking thread.

use crate::ai::llm::Llm;
use crate::audio_retention::{self, audio_path};
use crate::data_commands::data_folder;
use crate::metrics::{self, fix, numbers, Inputs, Metrics, Outcome};
use crate::paths;
use crate::scoring::pipeline::{self, QuestionInfo, ScoreInput};
use crate::scoring::run::Budget;
use crate::speech::words::Word;
use crate::speech::{engine, models, transcribe};
use crate::storage::model::Story;
use crate::storage::reps::{AiMeta, FullRep, Rep, Session};
use crate::storage::{settings, Result as StorageResult, Storage, StorageError};
use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

type Cmd<T> = std::result::Result<T, String>;

fn plain(e: StorageError) -> String {
    e.to_string()
}

fn yes() -> bool {
    true
}

#[derive(Debug, Clone, Deserialize)]
pub struct FinishArgs {
    /// None starts a new session.
    pub session_id: Option<String>,
    pub mode: String,
    pub stage: String,
    pub application_id: Option<String>,
    pub question_id: String,
    pub question_text: String,
    /// Empty for a question nobody tagged (a typed one): the engine classifies it first.
    pub question_type: String,
    #[serde(default)]
    pub behavioral_situation: Option<String>,
    #[serde(default)]
    pub commitment_check: bool,
    #[serde(default)]
    pub builder_operator_check: bool,
    #[serde(default = "yes")]
    pub is_major_story: bool,
    #[serde(default)]
    pub founder_variant: bool,
    /// 1, 2 or 3.
    pub attempt: u32,
    pub story_ids: Vec<String>,
    pub audio_path: PathBuf,
}

#[derive(Debug, Serialize)]
pub struct RepOutcome {
    /// "scored", "didnt_catch", "clarifying" (a question back to the interviewer) or "not_an_answer".
    pub outcome: &'static str,
    pub session_id: String,
    pub rep: Option<FullRep>,
    /// What changed on the previous attempt's fix.
    pub delta: Option<fix::Delta>,
    /// A restart phrase was heard: offer "Start this rep again?".
    pub restart_offered: bool,
    pub audio_kept: bool,
    /// Plain words on why the AI did not judge this one (no key, over the cap, an unreadable reply).
    pub notice: Option<String>,
}

/// The numbers a story's proof points stand for: before and after, with their unit.
pub fn bank_numbers(stories: &[Story], ids: &[String]) -> Vec<numbers::Number> {
    let mut out = Vec::new();
    for story in stories.iter().filter(|s| ids.contains(&s.id)) {
        for p in &story.proof_points {
            for value in [p.before.trim(), p.after.trim()].into_iter().filter(|v| !v.is_empty()) {
                let text = match p.unit.trim() {
                    "" => value.to_string(),
                    "%" => format!("{value}%"),
                    u if u.len() == 1 && "kKmMbB".contains(u) => format!("{value}{u}"),
                    u => format!("{value} {u}"),
                };
                match numbers::extract(&text).into_iter().next() {
                    Some(n) => out.push(n),
                    None => {
                        if let Ok(v) = value.replace(',', "").parse::<f64>() {
                            out.push(numbers::Number { value: v, percent: false, raw: value.to_string(), token: 0 });
                        }
                    }
                }
            }
        }
    }
    out
}

fn stamp(now: DateTime<Utc>) -> String {
    now.to_rfc3339_opts(SecondsFormat::Secs, true)
}

fn measure(storage: &Storage, stage: &str, question_type: &str, story_ids: &[String], words: Vec<Word>, keep_restart: bool) -> StorageResult<Metrics> {
    let stories = storage.load_stories()?.items;
    Ok(metrics::compute(Inputs { words, stage, question_type, bank: bank_numbers(&stories, story_ids), keep_restart }))
}

/// A model to judge with, and what this session may spend.
pub struct AiCtx<'a> {
    pub llm: &'a dyn Llm,
    pub budget: &'a mut Budget,
}

/// The question as tagged when it was asked.
struct Asked {
    text: String,
    question_type: String,
    behavioral_situation: Option<String>,
    commitment_check: bool,
    builder_operator_check: bool,
    is_major_story: bool,
    founder_variant: bool,
}

enum Judged {
    Scored { fix: Option<String>, note: String, rewrite: Option<crate::scoring::coach::Rewrite>, meta: AiMeta, question_type: String },
    /// A clarifying question back to the interviewer.
    Clarifying,
    NotAnAnswer,
    /// The AI could not judge this one: rules-only, with this line on the screen.
    Fallback(String),
}

/// Judges one answer with the model and, when it works, replaces the rules-only checks in `metrics` with the merged
/// ones. Any failure falls back to the rules-only checks already there.
fn judge(storage: &Storage, ai: &mut AiCtx, stage: &str, story_ids: &[String], asked: &Asked, metrics: &mut Metrics) -> Judged {
    let profile = storage.profile().ok().flatten();
    let stories_all = storage.load_stories().map(|l| l.items).unwrap_or_default();
    let stories: Vec<Story> = story_ids.iter().filter_map(|id| stories_all.iter().find(|s| &s.id == id).cloned()).collect();
    let question = if asked.question_type.is_empty() {
        let target = profile.as_ref().map(|p| p.target_role.as_str()).unwrap_or("");
        let industry = profile.as_ref().map(|p| p.industry.as_str()).unwrap_or("");
        match pipeline::classify(ai.llm, &asked.text, target, industry, ai.budget) {
            Ok(c) => c.into_question(&asked.text),
            Err(e) => return Judged::Fallback(e.notice()),
        }
    } else {
        QuestionInfo {
            text: asked.text.clone(),
            question_type: asked.question_type.clone(),
            behavioral_situation: asked.behavioral_situation.clone(),
            commitment_check: asked.commitment_check,
            builder_operator_check: asked.builder_operator_check,
            is_major_story: asked.is_major_story,
        }
    };
    let method = question
        .behavioral_situation
        .as_deref()
        .and_then(|sit| storage.methods().ok().and_then(|ms| ms.into_iter().find(|m| m.situation == sit)))
        .map(|m| m.spoken)
        .unwrap_or_default();
    let bank = bank_numbers(&stories, story_ids);
    let input = ScoreInput {
        question: &question,
        stage,
        founder_variant: asked.founder_variant,
        seniority: profile.as_ref().map(|p| p.seniority.as_str()).unwrap_or("mid"),
        identity_statement: profile.as_ref().map(|p| p.identity_statement.as_str()).unwrap_or(""),
        jd_summary: "",
        stories: &stories,
        method: &method,
        metrics,
        bank: &bank,
    };
    match pipeline::score_answer(ai.llm, &input, ai.budget) {
        Err(e) => Judged::Fallback(e.notice()),
        Ok(score) if score.clarifying_question => Judged::Clarifying,
        Ok(score) if score.not_an_answer => Judged::NotAnAnswer,
        Ok(score) => {
            metrics.checks = score.checks.clone();
            Judged::Scored {
                fix: score.fix,
                note: score.note,
                rewrite: score.rewrite,
                meta: AiMeta { prompts: score.prompts, rubric_version: score.rubric_version, cost_usd: ai.budget.spend.usd },
                question_type: question.question_type,
            }
        }
    }
}

/// The change since the previous attempt at the same question, about the fix that attempt was told.
fn delta_for(storage: &Storage, session: &str, question_id: &str, attempt: u32, current: &Metrics) -> Option<fix::Delta> {
    if attempt < 2 {
        return None;
    }
    let reps = storage.reps(session).ok()?.items;
    let prev = reps.iter().rev().find(|r| r.rep.question_id == question_id && r.rep.attempt == attempt - 1)?;
    fix::delta(&prev.metrics, current, prev.rep.fix.as_deref()?)
}

fn outcome_without_rep(name: &'static str, session_id: String) -> RepOutcome {
    RepOutcome { outcome: name, session_id, rep: None, delta: None, restart_offered: false, audio_kept: false, notice: None }
}

/// Measures and saves one rep from its words. The audio file moves to `audio_root/<session>/<n>.wav` (or is deleted
/// when the user keeps no audio, or when nothing was caught). With a model, the answer is judged too; without one,
/// or when the model fails, the rep keeps its timing-only checks.
pub fn finish_with(storage: &Storage, audio_root: &Path, args: &FinishArgs, words: Vec<Word>, keep_audio: bool, now: DateTime<Utc>, mut ai: Option<AiCtx>) -> StorageResult<RepOutcome> {
    let session_id = args.session_id.clone().unwrap_or_else(|| crate::storage::io::new_id("ses"));
    let type_for_rules = if args.question_type.is_empty() { "behavioral" } else { args.question_type.as_str() };
    let mut metrics = measure(storage, &args.stage, type_for_rules, &args.story_ids, words.clone(), false)?;
    if metrics.outcome == Outcome::DidntCatch {
        let _ = std::fs::remove_file(&args.audio_path);
        return Ok(outcome_without_rep("didnt_catch", session_id));
    }
    let mut question_type = type_for_rules.to_string();
    let mut note = None;
    let mut rewrite = None;
    let mut meta = None;
    let mut notice = None;
    let rules_fix = fix::top_fix(&metrics.checks).map(String::from);
    let mut fix_id = rules_fix;
    if let Some(ctx) = ai.as_mut() {
        let asked = Asked {
            text: args.question_text.clone(),
            question_type: args.question_type.clone(),
            behavioral_situation: args.behavioral_situation.clone(),
            commitment_check: args.commitment_check,
            builder_operator_check: args.builder_operator_check,
            is_major_story: args.is_major_story,
            founder_variant: args.founder_variant,
        };
        match judge(storage, ctx, &args.stage, &args.story_ids, &asked, &mut metrics) {
            Judged::Scored { fix, note: n, rewrite: r, meta: m, question_type: t } => {
                fix_id = fix;
                note = Some(n);
                rewrite = r;
                meta = Some(m);
                question_type = t;
            }
            Judged::Clarifying => {
                let _ = std::fs::remove_file(&args.audio_path);
                return Ok(outcome_without_rep("clarifying", session_id));
            }
            Judged::NotAnAnswer => {
                let _ = std::fs::remove_file(&args.audio_path);
                return Ok(outcome_without_rep("not_an_answer", session_id));
            }
            Judged::Fallback(n) => notice = Some(n),
        }
    }
    if storage.session(&session_id)?.is_none() {
        storage.save_session(&Session { id: session_id.clone(), mode: args.mode.clone(), stage: args.stage.clone(), application_id: args.application_id.clone(), started: stamp(now) })?;
    }
    let n = storage.next_rep_number(&session_id)?;
    let delta = delta_for(storage, &session_id, &args.question_id, args.attempt, &metrics);
    let restart_offered = metrics.restart_at.is_some();
    let full = FullRep {
        session_id: session_id.clone(),
        rep: Rep {
            n,
            question_id: args.question_id.clone(),
            question_text: args.question_text.clone(),
            question_type,
            behavioral_situation: args.behavioral_situation.clone(),
            commitment_check: args.commitment_check,
            builder_operator_check: args.builder_operator_check,
            is_major_story: args.is_major_story,
            founder_variant: args.founder_variant,
            attempt: args.attempt,
            recorded_at: stamp(now),
            story_ids: args.story_ids.clone(),
            fix: fix_id,
            note,
            rewrite,
            ai: meta,
            feedback: None,
        },
        transcript: words,
        metrics,
    };
    storage.save_rep(&session_id, &full)?;
    let audio_kept = keep_audio && move_audio(&args.audio_path, &audio_path(audio_root, &session_id, n));
    if !audio_kept {
        let _ = std::fs::remove_file(&args.audio_path);
    }
    Ok(RepOutcome { outcome: "scored", session_id, rep: Some(full), delta, restart_offered, audio_kept, notice })
}

fn move_audio(from: &Path, to: &Path) -> bool {
    if let Some(dir) = to.parent() {
        if std::fs::create_dir_all(dir).is_err() {
            return false;
        }
    }
    std::fs::rename(from, to).is_ok() || (std::fs::copy(from, to).is_ok() && std::fs::remove_file(from).is_ok())
}

/// Measures a saved rep again from its saved words, keeping or dropping what was said before a restart. No new
/// transcription: the words are already on disk. The model judges again, because its sentence numbers change with
/// the words.
pub fn rescore_with(storage: &Storage, audio_root: &Path, session_id: &str, n: u32, keep_restart: bool, mut ai: Option<AiCtx>) -> StorageResult<RepOutcome> {
    let mut full = storage.rep(session_id, n)?.ok_or_else(|| StorageError::NotFound(format!("rep {n} of {session_id}")))?;
    let session = storage.session(session_id)?.ok_or_else(|| StorageError::NotFound(format!("session {session_id}")))?;
    let type_for_rules = if full.rep.question_type.is_empty() { "behavioral".to_string() } else { full.rep.question_type.clone() };
    full.metrics = measure(storage, &session.stage, &type_for_rules, &full.rep.story_ids, full.transcript.clone(), keep_restart)?;
    full.rep.fix = fix::top_fix(&full.metrics.checks).map(String::from);
    full.rep.note = None;
    full.rep.rewrite = None;
    full.rep.ai = None;
    let mut notice = None;
    if let Some(ctx) = ai.as_mut() {
        let asked = Asked {
            text: full.rep.question_text.clone(),
            question_type: full.rep.question_type.clone(),
            behavioral_situation: full.rep.behavioral_situation.clone(),
            commitment_check: full.rep.commitment_check,
            builder_operator_check: full.rep.builder_operator_check,
            is_major_story: full.rep.is_major_story,
            founder_variant: full.rep.founder_variant,
        };
        match judge(storage, ctx, &session.stage, &full.rep.story_ids.clone(), &asked, &mut full.metrics) {
            Judged::Scored { fix, note, rewrite, meta, .. } => {
                full.rep.fix = fix;
                full.rep.note = Some(note);
                full.rep.rewrite = rewrite;
                full.rep.ai = Some(meta);
            }
            Judged::Fallback(n) => notice = Some(n),
            Judged::Clarifying | Judged::NotAnAnswer => {}
        }
    }
    storage.save_rep(session_id, &full)?;
    let delta = delta_for(storage, session_id, &full.rep.question_id, full.rep.attempt, &full.metrics);
    let audio_kept = audio_path(audio_root, session_id, n).is_file();
    Ok(RepOutcome { outcome: "scored", session_id: session_id.to_string(), rep: Some(full), delta, restart_offered: false, audio_kept, notice })
}

fn open() -> StorageResult<Storage> {
    crate::data_commands::open_for(&data_folder(), &paths::default_data_dir())
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Cmd<T> + Send + 'static) -> Cmd<T> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

fn transcribe_path(path: &Path, model_id: &str) -> Cmd<transcribe::Transcript> {
    let m = models::find(model_id).ok_or("Unknown model")?;
    let store = models::ModelStore::new(paths::models_dir(), true);
    let dir = store.locate(m).dir().ok_or("That speech model isn't downloaded yet")?.to_path_buf();
    let vad_dir = store.locate(&models::VAD).dir().ok_or("The voice detection model isn't downloaded yet")?.to_path_buf();
    let mut eng = engine::load(m, &dir, cfg!(target_os = "macos"))?;
    transcribe::transcribe_wav(path, eng.as_mut(), &vad_dir.join(models::VAD.files[0].name))
}

/// Runs `f` with a model client and the session's budget when an engine is set up and usable. When it is not (no key,
/// timing only), runs it without one and returns the reason in plain words.
fn with_ai<T>(session_id: &str, f: impl FnOnce(Option<AiCtx>) -> T) -> (T, Option<String>) {
    match crate::ai_commands::resolved_from_disk() {
        Ok(Some(engine)) => {
            let llm = engine.client();
            let (provider, cap_usd) = engine.budget_basis();
            let out = crate::ai_commands::with_budget(session_id, provider, cap_usd, |budget| f(Some(AiCtx { llm: llm.as_ref(), budget })));
            (out, None)
        }
        Ok(None) => (f(None), None),
        Err(reason) => (f(None), Some(format!("{reason} This answer was checked for timing only."))),
    }
}

/// Transcribes the recording, measures it, judges it (when an engine is set up) and saves the rep.
#[tauri::command]
pub async fn finish_rep(mut args: FinishArgs, model_id: String) -> Cmd<RepOutcome> {
    blocking(move || {
        let storage = open().map_err(plain)?;
        let settings = settings::load(&paths::settings_file());
        let keep_audio = settings::retention_days(&settings) != Some(0);
        let words = match transcribe_path(&args.audio_path, &model_id) {
            Ok(t) => t.words,
            Err(e) if e == transcribe::DIDNT_CATCH_THAT => Vec::new(),
            Err(e) => return Err(e),
        };
        let session_id = args.session_id.get_or_insert_with(|| crate::storage::io::new_id("ses")).clone();
        let (out, unavailable) = with_ai(&session_id, |ai| finish_with(&storage, &paths::audio_dir(), &args, words, keep_audio, Utc::now(), ai));
        let mut out = out.map_err(plain)?;
        if out.notice.is_none() {
            out.notice = unavailable;
        }
        Ok(out)
    })
    .await
}

/// "Keep it" after "Start this rep again?": measure from after the restart.
#[tauri::command]
pub async fn rescore_rep(session_id: String, n: u32, keep_restart: bool) -> Cmd<RepOutcome> {
    blocking(move || {
        let storage = open().map_err(plain)?;
        let (out, unavailable) = with_ai(&session_id, |ai| rescore_with(&storage, &paths::audio_dir(), &session_id, n, keep_restart, ai));
        let mut out = out.map_err(plain)?;
        if out.notice.is_none() {
            out.notice = unavailable;
        }
        Ok(out)
    })
    .await
}

/// "Start again" after the restart offer, or any rep the user throws away: the words, the numbers and the audio.
#[tauri::command]
pub async fn delete_rep(session_id: String, n: u32) -> Cmd<()> {
    blocking(move || {
        open().and_then(|s| s.delete_rep(&session_id, n)).map_err(plain)?;
        let _ = std::fs::remove_file(audio_path(&paths::audio_dir(), &session_id, n));
        Ok(())
    })
    .await
}

/// "That note was wrong" (and taking it back).
#[tauri::command]
pub async fn label_rep(session_id: String, n: u32, wrong: bool) -> Cmd<()> {
    blocking(move || open().and_then(|s| s.label_rep(&session_id, n, wrong, &stamp(Utc::now()))).map_err(plain)).await
}

/// A recording the user abandoned before it became a rep.
#[tauri::command]
pub async fn discard_recording(path: PathBuf) -> Cmd<()> {
    blocking(move || {
        if path.starts_with(paths::audio_dir()) {
            let _ = std::fs::remove_file(path);
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn rep_audio_available(session_id: String, n: u32) -> bool {
    blocking(move || Ok(audio_path(&paths::audio_dir(), &session_id, n).is_file())).await.unwrap_or(false)
}

/// The audio for Listen. Disabled in the screen when the file is gone (retention, or recorded on another computer).
#[tauri::command]
pub async fn read_rep_audio(session_id: String, n: u32) -> Cmd<tauri::ipc::Response> {
    blocking(move || {
        if !crate::storage::io::is_safe_id(&session_id) {
            return Err("Not a valid session".to_string());
        }
        std::fs::read(audio_path(&paths::audio_dir(), &session_id, n)).map_err(|_| "Audio is no longer on this computer".to_string())
    })
    .await
    .map(tauri::ipc::Response::new)
}

#[derive(Debug, Serialize)]
pub struct SessionDetail {
    pub session: Session,
    pub reps: Vec<FullRep>,
    pub problems: Vec<String>,
}

#[tauri::command]
pub async fn load_session(session_id: String) -> Cmd<Option<SessionDetail>> {
    blocking(move || {
        let storage = open().map_err(plain)?;
        let Some(session) = storage.session(&session_id).map_err(plain)? else { return Ok(None) };
        let reps = storage.reps(&session_id).map_err(plain)?;
        Ok(Some(SessionDetail { session, reps: reps.items, problems: reps.problems }))
    })
    .await
}

#[tauri::command]
pub async fn list_sessions() -> Cmd<Vec<Session>> {
    blocking(|| Ok(open().and_then(|s| s.sessions()).map_err(plain)?.items)).await
}

/// Removes audio older than the retention setting, apart from reps labelled for the eval set. Run on start.
#[tauri::command]
pub async fn sweep_audio() -> Cmd<usize> {
    blocking(|| {
        let Some(days) = settings::retention_days(&settings::load(&paths::settings_file())) else { return Ok(0) };
        let keep: HashSet<String> = open().and_then(|s| s.eval_reps()).map(|l| l.items.into_iter().map(|r| format!("{}/{}", r.session_id, r.rep.n)).collect()).unwrap_or_default();
        Ok(audio_retention::sweep(&paths::audio_dir(), days, &keep, std::time::SystemTime::now()))
    })
    .await
}

#[tauri::command]
pub fn audio_retention() -> String {
    settings::load(&paths::settings_file()).audio_retention.unwrap_or_else(|| "30".to_string())
}

#[tauri::command]
pub async fn set_audio_retention(choice: String) -> Cmd<()> {
    blocking(move || {
        if !["7", "30", "90", "forever", "none"].contains(&choice.as_str()) {
            return Err("Not a retention choice".to_string());
        }
        let path = paths::settings_file();
        let mut s = settings::load(&path);
        s.audio_retention = Some(choice);
        settings::save(&path, &s).map_err(plain)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::model::{ProofPoint, Usage};
    use chrono::TimeZone;
    use std::fs;

    fn now() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 10, 21, 20, 0, 0).unwrap()
    }

    fn story(id: &str) -> Story {
        Story {
            id: id.into(),
            title: "Churn".into(),
            employer: "Fernhill".into(),
            best_for: vec![],
            direct_answer: "".into(),
            context: "".into(),
            approach: "".into(),
            action: "".into(),
            ownership: "".into(),
            result: "".into(),
            proof_points: vec![
                ProofPoint { label: "churn".into(), metric: "Churn".into(), before: "24".into(), after: "18".into(), unit: "%".into(), approximate: false, verified: true },
                ProofPoint { label: "users".into(), metric: "Users".into(), before: "".into(), after: "40".into(), unit: "k".into(), approximate: false, verified: true },
            ],
            scale: "".into(),
            competencies: vec![],
            great_eight: vec![],
            branches: vec![],
            verified: true,
            headline: "".into(),
            usage: Usage { practiced: 0, fits: 0, said_number: None },
            year: None,
        }
    }

    fn setup() -> (tempfile::TempDir, Storage) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::init(dir.path().join("data")).unwrap();
        s.save_story(&story("st_a")).unwrap();
        (dir, s)
    }

    fn args(dir: &Path, attempt: u32, session: Option<&str>) -> FinishArgs {
        let wav = dir.join(format!("rec-{attempt}.wav"));
        fs::write(&wav, b"RIFF").unwrap();
        FinishArgs {
            session_id: session.map(String::from),
            mode: "drill".into(),
            stage: "recruiter".into(),
            application_id: None,
            question_id: "gen-001".into(),
            question_text: "Tell me about a time you cut churn.".into(),
            question_type: "behavioral".into(),
            behavioral_situation: Some("problem_solving".into()),
            commitment_check: false,
            builder_operator_check: false,
            is_major_story: true,
            founder_variant: false,
            attempt,
            story_ids: vec!["st_a".into()],
            audio_path: wav,
        }
    }

    /// 20 words, a story number in sentence 1, then a long tail.
    fn words(tail_words: usize) -> Vec<Word> {
        let mut v = Vec::new();
        let mut t = 0u64;
        for w in "We cut churn from 24% to 18%.".split(' ') {
            v.push(Word { text: w.into(), start_ms: t, end_ms: t + 400 });
            t += 500;
        }
        for i in 0..tail_words {
            v.push(Word { text: if i + 1 == tail_words { "done." } else { "and" }.into(), start_ms: t, end_ms: t + 500 });
            t += 600;
        }
        v
    }

    #[test]
    fn story_numbers_become_bank_numbers_with_their_units() {
        let n = bank_numbers(&[story("st_a")], &["st_a".into()]);
        let values: Vec<(f64, bool)> = n.iter().map(|x| (x.value, x.percent)).collect();
        assert_eq!(values, vec![(24.0, true), (18.0, true), (40_000.0, false)]);
        assert!(bank_numbers(&[story("st_a")], &["other".into()]).is_empty());
    }

    #[test]
    fn a_scored_rep_is_saved_with_its_fix_and_the_audio_moves_to_the_machine_local_folder() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let audio = tmp.join("audio");
        let a = args(&tmp, 1, None);
        let out = finish_with(&storage, &audio, &a, words(40), true, now(), None).unwrap();
        assert_eq!(out.outcome, "scored");
        let rep = out.rep.unwrap();
        assert_eq!(rep.rep.fix.as_deref(), Some("clean_stop"));
        assert!(out.audio_kept && audio_path(&audio, &out.session_id, 1).is_file());
        assert!(!a.audio_path.exists());
        assert_eq!(storage.session(&out.session_id).unwrap().unwrap().stage, "recruiter");
        assert_eq!(storage.rep(&out.session_id, 1).unwrap().unwrap().rep.question_id, "gen-001");
    }

    #[test]
    fn keeping_no_audio_deletes_it_but_keeps_the_transcript() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let a = args(&tmp, 1, None);
        let out = finish_with(&storage, &tmp.join("audio"), &a, words(40), false, now(), None).unwrap();
        assert!(!out.audio_kept && !a.audio_path.exists());
        assert!(storage.rep(&out.session_id, 1).unwrap().is_some());
    }

    #[test]
    fn a_rep_with_almost_no_speech_is_not_saved_and_its_audio_is_deleted() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let a = args(&tmp, 1, None);
        let out = finish_with(&storage, &tmp.join("audio"), &a, vec![Word { text: "hi".into(), start_ms: 0, end_ms: 300 }], true, now(), None).unwrap();
        assert_eq!(out.outcome, "didnt_catch");
        assert!(out.rep.is_none() && !a.audio_path.exists());
        assert!(storage.session(&out.session_id).unwrap().is_none(), "nothing saved");
    }

    #[test]
    fn the_second_attempt_carries_the_change_on_the_first_attempts_fix() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let audio = tmp.join("audio");
        let one = finish_with(&storage, &audio, &args(&tmp, 1, None), words(40), true, now(), None).unwrap();
        assert!(one.delta.is_none());
        let two = finish_with(&storage, &audio, &args(&tmp, 2, Some(&one.session_id)), words(4), true, now(), None).unwrap();
        let d = two.delta.expect("a delta on the clean stop");
        assert_eq!(d.check, "clean_stop");
        assert!(d.improved);
        assert!(d.to_seconds.unwrap() < d.from_seconds.unwrap());
        assert_eq!(two.rep.unwrap().rep.n, 2);
    }

    #[test]
    fn a_restart_is_offered_and_rescoring_from_after_it_changes_the_measurements() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let audio = tmp.join("audio");
        let mut w: Vec<Word> = Vec::new();
        let mut t = 0u64;
        for x in "So the thing was... sorry, let me start again.".split(' ') {
            w.push(Word { text: x.into(), start_ms: t, end_ms: t + 400 });
            t += 500;
        }
        w.extend(words(10).into_iter().map(|mut x| {
            x.start_ms += t;
            x.end_ms += t;
            x
        }));
        let out = finish_with(&storage, &audio, &args(&tmp, 1, None), w, true, now(), None).unwrap();
        assert!(out.restart_offered);
        let before = out.rep.unwrap().metrics.word_count;
        let again = rescore_with(&storage, &audio, &out.session_id, 1, true, None).unwrap();
        assert!(again.rep.unwrap().metrics.word_count < before);
        assert!(again.audio_kept);
    }

    #[test]
    fn a_session_id_is_reused_so_reps_of_one_session_stay_together() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let audio = tmp.join("audio");
        let one = finish_with(&storage, &audio, &args(&tmp, 1, None), words(40), true, now(), None).unwrap();
        let two = finish_with(&storage, &audio, &args(&tmp, 2, Some(&one.session_id)), words(40), true, now(), None).unwrap();
        assert_eq!(one.session_id, two.session_id);
        assert_eq!(storage.reps(&one.session_id).unwrap().items.len(), 2);
    }

    // ---------- with a model ----------

    use crate::ai::providers::{AiError, Provider};
    use crate::scoring::run::testing::Scripted;
    use serde_json::{json, Value};

    fn score_json(first: usize, landed: usize, results: &[(&str, &str)], clarifying: bool) -> String {
        let mut c = serde_json::Map::new();
        for id in ["answer_first", "proof", "story_fit", "context_short", "clean_stop", "ownership", "conviction", "no_complaining", "method_first", "approach_before_action", "jd_fit", "stage_fit", "commitment", "builder_operator", "type_fit"] {
            c.insert(id.into(), json!({"result": "na", "sentences": [], "quote": "", "reason": "t"}));
        }
        for (id, r) in results {
            c.insert((*id).into(), json!({"result": r, "sentences": [1], "quote": "We cut churn", "reason": "t"}));
        }
        json!({"rubric_version": 1, "clarifying_question": clarifying, "not_an_answer": false, "restart_at_sentence": null, "story_id": "st_a",
               "first_answer_sentence": first, "proof_landed_sentence": landed, "tail_exempt_sentences": [], "approach_sentence": null, "action_sentence": null,
               "numbers_said": [{"text": "24 to 18 percent", "sentence": 1, "metric": "churn", "matches_bank": "st_a.churn", "conflicts_with_bank": null, "not_in_bank": false}],
               "criteria": c})
        .to_string()
    }

    const COACH: &str = r#"{"note":"You kept going long after the number. Stop once it lands.","rewrite":null,"offer_follow_up":true}"#;

    fn ai_run(llm: &Scripted, args: &FinishArgs, storage: &Storage, audio: &Path, words: Vec<Word>) -> RepOutcome {
        let mut budget = Budget::new(Provider::Claude, 0.0);
        finish_with(storage, audio, args, words, true, now(), Some(AiCtx { llm, budget: &mut budget })).unwrap()
    }

    #[test]
    fn with_a_model_the_rep_gets_the_ai_note_the_merged_checks_and_the_ai_fix() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let llm = Scripted::new(vec![Ok(&score_json(1, 1, &[("answer_first", "pass"), ("proof", "pass"), ("ownership", "fail")], false)), Ok(COACH)]);
        let out = ai_run(&llm, &args(&tmp, 1, None), &storage, &tmp.join("audio"), words(40));
        let rep = out.rep.unwrap();
        assert_eq!(rep.rep.fix.as_deref(), Some("clean_stop"), "the tail after the number outranks ownership in the fix order");
        assert_eq!(rep.rep.note.as_deref(), Some("You kept going long after the number. Stop once it lands."));
        assert!(rep.metrics.checks.iter().any(|c| c.id == "ownership" && c.passed == Some(false)), "the AI's checks are in the saved metrics");
        assert!(rep.metrics.checks.iter().any(|c| c.id == "time_to_point"));
        assert_eq!(rep.rep.ai.as_ref().unwrap().prompts, vec!["score-answer v1", "coach-note v1"]);
        assert!(out.notice.is_none());
        let saved = storage.rep(&out.session_id, 1).unwrap().unwrap();
        assert_eq!(saved.rep.note, rep.rep.note);
    }

    #[test]
    fn when_the_model_cannot_be_used_the_rep_is_still_saved_with_timing_checks_and_a_plain_notice() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let llm = Scripted::new(vec![Err(AiError::Unavailable("Claude didn't accept the API key. Check it in Settings › AI.".into()))]);
        let out = ai_run(&llm, &args(&tmp, 1, None), &storage, &tmp.join("audio"), words(40));
        let rep = out.rep.unwrap();
        assert_eq!(rep.rep.fix.as_deref(), Some("clean_stop"));
        assert!(rep.rep.note.is_none() && rep.rep.ai.is_none());
        assert!(out.notice.unwrap().contains("checked for timing only"));
    }

    #[test]
    fn a_clarifying_question_is_not_saved_and_its_audio_goes() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let a = args(&tmp, 1, None);
        let llm = Scripted::new(vec![Ok(&score_json(1, 1, &[], true))]);
        let out = ai_run(&llm, &a, &storage, &tmp.join("audio"), words(40));
        assert_eq!(out.outcome, "clarifying");
        assert!(out.rep.is_none() && !a.audio_path.exists());
        assert!(storage.session(&out.session_id).unwrap().is_none());
    }

    #[test]
    fn a_typed_question_is_classified_first_and_the_saved_type_is_the_classified_one() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let mut a = args(&tmp, 1, None);
        a.question_type = String::new();
        let classify = r#"{"type":"technical","behavioral_situation":null,"commitment_check":false,"builder_operator_check":false,"is_major_story":true,"competencies":["technical depth"]}"#;
        let llm = Scripted::new(vec![Ok(classify), Ok(&score_json(1, 1, &[("answer_first", "pass"), ("proof", "pass")], false)), Ok(COACH)]);
        let out = ai_run(&llm, &a, &storage, &tmp.join("audio"), words(40));
        assert_eq!(llm.calls(), 3);
        assert_eq!(out.rep.unwrap().rep.question_type, "technical");
    }

    #[test]
    fn rescoring_a_kept_restart_judges_again_on_the_new_words() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let audio = tmp.join("audio");
        let mut w: Vec<Word> = Vec::new();
        let mut t = 0u64;
        for x in "So the thing was... sorry, let me start again.".split(' ') {
            w.push(Word { text: x.into(), start_ms: t, end_ms: t + 400 });
            t += 500;
        }
        w.extend(words(10).into_iter().map(|mut x| {
            x.start_ms += t;
            x.end_ms += t;
            x
        }));
        let first = Scripted::new(vec![Ok(&score_json(2, 2, &[("answer_first", "fail")], false)), Ok(COACH)]);
        let out = ai_run(&first, &args(&tmp, 1, None), &storage, &audio, w);
        assert!(out.restart_offered);
        let again = Scripted::new(vec![Ok(&score_json(1, 1, &[("answer_first", "pass"), ("proof", "pass")], false)), Ok(r#"{"note":"Clean.","rewrite":null,"offer_follow_up":true}"#)]);
        let mut budget = Budget::new(Provider::Claude, 0.0);
        let r = rescore_with(&storage, &audio, &out.session_id, 1, true, Some(AiCtx { llm: &again, budget: &mut budget })).unwrap();
        assert_eq!(again.calls(), 2);
        assert_eq!(r.rep.unwrap().rep.note.as_deref(), Some("Clean."));
    }

    /// Real speech model, real recording: `ENSAYO_SMOKE_WAV=answer.wav ENSAYO_SMOKE_MODEL=whisper-turbo cargo test real_rep -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn real_rep_from_a_recording() {
        let wav = PathBuf::from(std::env::var("ENSAYO_SMOKE_WAV").expect("set ENSAYO_SMOKE_WAV"));
        let model = std::env::var("ENSAYO_SMOKE_MODEL").unwrap_or_else(|_| "whisper-tiny".into());
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let copy = tmp.join("rec.wav");
        fs::copy(&wav, &copy).unwrap();
        let t = transcribe_path(&copy, &model).unwrap();
        eprintln!("{} words from {}", t.words.len(), t.engine);
        let mut a = args(&tmp, 1, None);
        a.audio_path = copy;
        let out = finish_with(&storage, &tmp.join("audio"), &a, t.words, true, now(), None).unwrap();
        let rep = out.rep.expect("scored");
        let m = &rep.metrics;
        eprintln!("speaking {}s, {} wpm, fillers {:?}, pauses {}, fix {:?}", m.speaking_ms / 1000, m.wpm, m.fillers.items.iter().map(|f| &f.text).collect::<Vec<_>>(), m.pauses.len(), rep.rep.fix);
        for c in &m.checks {
            eprintln!("  {} {:?}: {}", c.id, c.passed, c.evidence);
        }
        for s in &m.sentences {
            eprintln!("  [{}] {:.1}s-{:.1}s {}", s.index, s.start_ms as f64 / 1000.0, s.end_ms as f64 / 1000.0, s.text);
        }
    }
}
