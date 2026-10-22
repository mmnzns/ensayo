//! The rep loop on the Rust side: turn a recording into a measured, saved rep. The measuring is `metrics` (pure);
//! the judging is `scoring` (a model, when one is set up); this module picks the numbers to measure against, saves,
//! and moves the audio to its machine-local home. Every command is async and does its file and model work on a
//! blocking thread.

use crate::ai::llm::Llm;
use crate::applications::hook;
use crate::audio_retention::{self, audio_path};
use crate::data_commands::data_folder;
use crate::metrics::{self, fix, numbers, Inputs, Metrics, Outcome};
use crate::paths;
use crate::scoring::pipeline::{self, QuestionInfo, ScoreInput};
use crate::scoring::run::Budget;
use crate::speech::words::Word;
use crate::speech::{engine, models, transcribe};
use crate::storage::model::Story;
use crate::scoring::followup::{self, FollowScoreInput, FollowScored, GenInput};
use crate::scoring::inputs::{transcript_text, transcript_text_first};
use crate::storage::reps::{AiMeta, FollowUpMeta, FullRep, Rep, Session};
use crate::storage::{settings, Result as StorageResult, Storage, StorageError};
use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

pub(crate) type Cmd<T> = std::result::Result<T, String>;

pub(crate) fn plain(e: StorageError) -> String {
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
    /// The stage of the application's process (a stage may repeat). Optional: without it the first stage of this
    /// type that is not done is used.
    #[serde(default)]
    pub stage_id: Option<String>,
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
    /// Set when this recording answers a follow-up question.
    #[serde(default)]
    pub follow_up: Option<FollowUpArgs>,
    /// 1, 2 or 3.
    pub attempt: u32,
    pub story_ids: Vec<String>,
    pub audio_path: PathBuf,
    /// The target this practice is for. Default: the application's target, else the active target. Kept on the session
    /// when it starts.
    #[serde(default)]
    pub target_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FollowUpArgs {
    /// The rep this follow-up probes.
    pub parent_n: u32,
    pub kind: String,
    pub number: u32,
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
    /// What was said, for a clarifying question (the interviewer's reply is generated from it).
    pub transcript_text: Option<String>,
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
    /// What the application's posting is about (empty outside an application, or before it was read).
    jd_summary: String,
    /// The target the practice is for: its pitch, level and role are what the answer is judged against.
    target_id: Option<String>,
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
    let profile = storage.profile_for(asked.target_id.as_deref()).ok().flatten();
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
        target_id: asked.target_id.as_deref(),
        jd_summary: &asked.jd_summary,
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

/// Judges the answer to a follow-up: F1, F2, F3 and (for a skeptic push) F5 by the model, F4 by code, then the coach.
fn judge_follow_up(storage: &Storage, ai: &mut AiCtx, session_id: &str, args: &FinishArgs, f: &FollowUpArgs, metrics: &mut Metrics, target_id: Option<&str>) -> Judged {
    let Some(parent) = storage.rep(session_id, f.parent_n).ok().flatten() else { return Judged::Fallback("Ensayo couldn't find the answer this follow-up belongs to, so this one was checked for timing only.".into()) };
    let profile = storage.profile_for(target_id).ok().flatten();
    let stories_all = storage.load_stories().map(|l| l.items).unwrap_or_default();
    let stories: Vec<Story> = parent.rep.story_ids.iter().filter_map(|id| stories_all.iter().find(|s| &s.id == id).cloned()).collect();
    let method = parent
        .rep
        .behavioral_situation
        .as_deref()
        .and_then(|sit| storage.methods().ok().and_then(|ms| ms.into_iter().find(|m| m.situation == sit)))
        .map(|m| m.spoken)
        .unwrap_or_default();
    let first = transcript_text_first(&parent.metrics);
    let follow = transcript_text(metrics);
    let input = FollowScoreInput {
        original_question: &parent.rep.question_text,
        first_transcript: &first,
        follow_up_type: &f.kind,
        follow_up_question: &args.question_text,
        follow_up_transcript: &follow,
        stories: &stories,
        stage: &args.stage,
        founder_variant: args.founder_variant,
        question_type: &parent.rep.question_type,
        metrics,
        first_speaking_ms: parent.metrics.speaking_ms,
        method: &method,
        identity_statement: profile.as_ref().map(|p| p.identity_statement.as_str()).unwrap_or(""),
    };
    match followup::score_follow_up(ai.llm, &input, ai.budget) {
        Err(e) => Judged::Fallback(e.notice()),
        Ok(FollowScored::Clarifying) => Judged::Clarifying,
        Ok(FollowScored::NotAnAnswer) => Judged::NotAnAnswer,
        Ok(FollowScored::Scored { checks, fix, coach }) => {
            metrics.checks = checks;
            Judged::Scored {
                fix,
                note: coach.note,
                rewrite: coach.rewrite,
                meta: AiMeta { prompts: vec!["score-follow-up v1".into(), "coach-note v2".into()], rubric_version: crate::metrics::RUBRIC_VERSION, cost_usd: ai.budget.spend.usd },
                question_type: parent.rep.question_type.clone(),
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
    RepOutcome { outcome: name, session_id, rep: None, delta: None, restart_offered: false, audio_kept: false, notice: None, transcript_text: None }
}

/// Measures and saves one rep from its words. The audio file moves to `audio_root/<session>/<n>.wav` (or is deleted
/// when the user keeps no audio, or when nothing was caught). With a model, the answer is judged too; without one,
/// or when the model fails, the rep keeps its timing-only checks.
pub fn finish_with(storage: &Storage, audio_root: &Path, args: &FinishArgs, words: Vec<Word>, keep_audio: bool, now: DateTime<Utc>, mut ai: Option<AiCtx>) -> StorageResult<RepOutcome> {
    let session_id = args.session_id.clone().unwrap_or_else(|| crate::storage::io::new_id("ses"));
    // Inside an application: the stage of its process, and the founder variant at a startup's leadership round.
    let session_stage = storage.session(&session_id).ok().flatten().and_then(|s| s.stage_id);
    let app_ctx = hook::app_context(storage, args.application_id.as_deref(), session_stage.as_deref(), args.stage_id.as_deref(), &args.stage);
    let resolved = FinishArgs { founder_variant: hook::founder_variant(app_ctx.as_ref(), &args.stage, args.founder_variant), ..args.clone() };
    let args = &resolved;
    let existing = storage.session(&session_id).ok().flatten();
    let target_id = match &existing {
        Some(sess) => storage.session_target(sess)?,
        None => storage.resolve_session_target(args.target_id.as_deref(), app_ctx.as_ref().map(|c| &c.rec))?,
    };
    let mut pending: Option<hook::Pending> = None;
    let type_for_rules = if args.question_type.is_empty() { "behavioral" } else { args.question_type.as_str() };
    let mut metrics = measure(storage, &args.stage, type_for_rules, &args.story_ids, words.clone(), false)?;
    if metrics.outcome == Outcome::DidntCatch {
        let _ = std::fs::remove_file(&args.audio_path);
        return Ok(outcome_without_rep("didnt_catch", session_id));
    }
    // The candidate's own questions at the end of a Mock are judged together afterwards (prompt 10), never as an answer.
    let own_questions = args.question_type == "candidate_questions";
    if own_questions {
        metrics.checks.clear();
    }
    if args.follow_up.is_some() {
        // A follow-up answer is judged on F1 to F5, not on the number or the stop; timing alone keeps only the fillers.
        metrics.checks.retain(|c| c.id == "fillers");
    }
    let mut question_type = type_for_rules.to_string();
    let mut note = None;
    let mut rewrite = None;
    let mut meta = None;
    let mut notice = None;
    let rules_fix = fix::top_fix(&metrics.checks).map(String::from);
    let mut fix_id = rules_fix;
    if let Some(ctx) = ai.as_mut().filter(|_| !own_questions) {
        let asked = Asked {
            text: args.question_text.clone(),
            question_type: args.question_type.clone(),
            behavioral_situation: args.behavioral_situation.clone(),
            commitment_check: args.commitment_check,
            builder_operator_check: args.builder_operator_check,
            is_major_story: args.is_major_story,
            founder_variant: args.founder_variant,
            jd_summary: if app_ctx.is_some() { hook::jd_summary(storage, args.application_id.as_deref()) } else { String::new() },
            target_id: target_id.clone(),
        };
        let judged = match &args.follow_up {
            Some(f) => judge_follow_up(storage, ctx, &session_id, args, f, &mut metrics, target_id.as_deref()),
            None => judge(storage, ctx, &args.stage, &args.story_ids, &asked, &mut metrics),
        };
        match judged {
            Judged::Scored { fix, note: n, rewrite: r, meta: m, question_type: t } => {
                fix_id = fix;
                note = Some(n);
                rewrite = r;
                meta = Some(m);
                question_type = t;
                if let Some(app) = &app_ctx {
                    // Claims for the consistency check (prompt 07): the answer is compared with what was said before.
                    let identity = storage.profile_for(target_id.as_deref()).ok().flatten().map(|p| p.identity_statement).unwrap_or_default();
                    let heard = hook::Heard { question: &args.question_text, question_type: &question_type, story_ids: &args.story_ids, identity_statement: &identity, founder: args.founder_variant && args.stage == "leadership" };
                    let (p, claims_notice) = hook::after_scored(storage, ctx, app, &heard, &mut metrics, &mut fix_id, &mut note, &mut rewrite);
                    pending = p;
                    notice = claims_notice;
                    if let Some(m) = meta.as_mut() {
                        m.prompts.push(hook::prompt_tag());
                        m.cost_usd = ctx.budget.spend.usd;
                    }
                }
            }
            Judged::Clarifying => {
                let _ = std::fs::remove_file(&args.audio_path);
                let mut out = outcome_without_rep("clarifying", session_id);
                out.transcript_text = Some(metrics.sentences.iter().map(|s| s.text.as_str()).collect::<Vec<_>>().join(" "));
                return Ok(out);
            }
            Judged::NotAnAnswer => {
                let _ = std::fs::remove_file(&args.audio_path);
                return Ok(outcome_without_rep("not_an_answer", session_id));
            }
            Judged::Fallback(n) => notice = Some(n),
        }
    }
    if storage.session(&session_id)?.is_none() {
        storage.save_session(&Session { id: session_id.clone(), mode: args.mode.clone(), stage: args.stage.clone(), application_id: app_ctx.as_ref().map(|c| c.rec.id.clone()).or_else(|| args.application_id.clone()), stage_id: app_ctx.as_ref().map(|c| c.stage_id.clone()), started: stamp(now), target_id: target_id.clone() })?;
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
            follow_up: args.follow_up.as_ref().map(|f| FollowUpMeta { parent_n: f.parent_n, kind: f.kind.clone(), question: args.question_text.clone(), number: f.number }),
            feedback: None,
        },
        transcript: words,
        metrics,
    };
    storage.save_rep(&session_id, &full)?;
    if let Some(p) = &pending {
        if let Err(e) = hook::save_pending(storage, p, &session_id, n) {
            log::warn!("claims of {session_id}/{n} were not saved: {e}");
        }
    }
    let audio_kept = keep_audio && move_audio(&args.audio_path, &audio_path(audio_root, &session_id, n));
    if !audio_kept {
        let _ = std::fs::remove_file(&args.audio_path);
    }
    Ok(RepOutcome { outcome: "scored", session_id, rep: Some(full), delta, restart_offered, audio_kept, notice, transcript_text: None })
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
    let mut pending: Option<hook::Pending> = None;
    if let Some(ctx) = ai.as_mut() {
        let asked = Asked {
            text: full.rep.question_text.clone(),
            question_type: full.rep.question_type.clone(),
            behavioral_situation: full.rep.behavioral_situation.clone(),
            commitment_check: full.rep.commitment_check,
            builder_operator_check: full.rep.builder_operator_check,
            is_major_story: full.rep.is_major_story,
            founder_variant: full.rep.founder_variant,
            jd_summary: hook::jd_summary(storage, session.application_id.as_deref()),
            target_id: storage.session_target(&session)?,
        };
        match judge(storage, ctx, &session.stage, &full.rep.story_ids.clone(), &asked, &mut full.metrics) {
            Judged::Scored { fix, note, rewrite, meta, .. } => {
                full.rep.fix = fix;
                full.rep.note = Some(note);
                full.rep.rewrite = rewrite;
                full.rep.ai = Some(meta);
                // The words changed, so what was heard in them is heard again.
                if let Some(app_id) = session.application_id.as_deref() {
                    let _ = hook::forget_rep(storage, app_id, session_id, Some(n));
                    if let Some(app) = hook::app_context(storage, Some(app_id), session.stage_id.as_deref(), None, &session.stage) {
                        let identity = storage.profile_for(storage.session_target(&session).ok().flatten().as_deref()).ok().flatten().map(|p| p.identity_statement).unwrap_or_default();
                        let heard = hook::Heard { question: &full.rep.question_text, question_type: &full.rep.question_type, story_ids: &full.rep.story_ids, identity_statement: &identity, founder: full.rep.founder_variant && session.stage == "leadership" };
                        let (p, claims_notice) = hook::after_scored(storage, ctx, &app, &heard, &mut full.metrics, &mut full.rep.fix, &mut full.rep.note, &mut full.rep.rewrite);
                        pending = p;
                        notice = claims_notice;
                        if let Some(m) = full.rep.ai.as_mut() {
                            m.prompts.push(hook::prompt_tag());
                            m.cost_usd = ctx.budget.spend.usd;
                        }
                    }
                }
            }
            Judged::Fallback(n) => notice = Some(n),
            Judged::Clarifying | Judged::NotAnAnswer => {}
        }
    }
    storage.save_rep(session_id, &full)?;
    if let Some(p) = &pending {
        if let Err(e) = hook::save_pending(storage, p, session_id, n) {
            log::warn!("claims of {session_id}/{n} were not saved: {e}");
        }
    }
    let delta = delta_for(storage, session_id, &full.rep.question_id, full.rep.attempt, &full.metrics);
    let audio_kept = audio_path(audio_root, session_id, n).is_file();
    Ok(RepOutcome { outcome: "scored", session_id: session_id.to_string(), rep: Some(full), delta, restart_offered: false, audio_kept, notice, transcript_text: None })
}

/// Scores a saved rep again with the current scorer, for the eval harness: the same measuring and judging as a new
/// rep, on the saved words. Returns the checks. Nothing is saved.
pub fn rejudge(storage: &Storage, ai: &mut AiCtx, rep: &FullRep) -> Result<Vec<crate::metrics::Check>, String> {
    let stage = storage.session(&rep.session_id).ok().flatten().map(|s| s.stage).unwrap_or_else(|| "hiring_manager".to_string());
    let type_for_rules = if rep.rep.question_type.is_empty() { "behavioral" } else { rep.rep.question_type.as_str() };
    let mut metrics = measure(storage, &stage, type_for_rules, &rep.rep.story_ids, rep.transcript.clone(), false).map_err(plain)?;
    let target_id = storage.session(&rep.session_id).ok().flatten().and_then(|s| storage.session_target(&s).ok().flatten());
    let asked = Asked {
        text: rep.rep.question_text.clone(),
        question_type: rep.rep.question_type.clone(),
        behavioral_situation: rep.rep.behavioral_situation.clone(),
        commitment_check: rep.rep.commitment_check,
        builder_operator_check: rep.rep.builder_operator_check,
        is_major_story: rep.rep.is_major_story,
        founder_variant: rep.rep.founder_variant,
        jd_summary: String::new(),
        target_id,
    };
    match judge(storage, ai, &stage, &rep.rep.story_ids, &asked, &mut metrics) {
        Judged::Scored { .. } => Ok(metrics.checks),
        Judged::Fallback(n) => Err(n),
        Judged::Clarifying | Judged::NotAnAnswer => Ok(vec![]),
    }
}

pub(crate) fn open() -> StorageResult<Storage> {
    crate::data_commands::open_for(&data_folder(), &paths::default_data_dir())
}

pub(crate) async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Cmd<T> + Send + 'static) -> Cmd<T> {
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
pub(crate) fn with_ai<T>(session_id: &str, f: impl FnOnce(Option<AiCtx>) -> T) -> (T, Option<String>) {
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
        let _t = crate::logging::Timer::new("finish_rep");
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

#[derive(Debug, Serialize)]
pub struct FollowUpQuestion {
    pub kind: String,
    pub question: String,
    pub targets: String,
    /// Which follow-up of this question this is, and how many the stage allows.
    pub number: u32,
    pub of: u32,
}

/// The next follow-up for a saved rep: aimed at its weakest part, never a type already used for this question, and no
/// more than the stage allows (recruiter 1, the rest 2).
pub fn next_follow_up_with(storage: &Storage, ai: &mut AiCtx, session_id: &str, parent_n: u32) -> Result<FollowUpQuestion, String> {
    let parent = storage.rep(session_id, parent_n).map_err(plain)?.ok_or("Ensayo couldn't find that answer.")?;
    let session = storage.session(session_id).map_err(plain)?.ok_or("Ensayo couldn't find that session.")?;
    let of = followup::max_follow_ups(&session.stage);
    let earlier: Vec<FullRep> = storage.reps(session_id).map_err(plain)?.items.into_iter().filter(|r| r.rep.follow_up.is_some() && r.rep.question_id == parent.rep.question_id).collect();
    if earlier.len() as u32 >= of {
        return Err("That is all the follow-ups for this question.".into());
    }
    let used: Vec<String> = earlier.iter().filter_map(|r| r.rep.follow_up.as_ref().map(|f| f.kind.clone())).collect();
    let stories_all = storage.load_stories().map(|l| l.items).unwrap_or_default();
    let stories: Vec<Story> = parent.rep.story_ids.iter().filter_map(|id| stories_all.iter().find(|s| &s.id == id).cloned()).collect();
    let transcript = transcript_text(&parent.metrics);
    let branches = followup::branches_text(&stories);
    let jd = hook::jd_summary(storage, session.application_id.as_deref());
    let g = GenInput { question: &parent.rep.question_text, transcript: &transcript, checks: &parent.metrics.checks, stage: &session.stage, founder_variant: parent.rep.founder_variant, branches: &branches, used: &used, jd_summary: &jd };
    let f = followup::generate(ai.llm, &g, ai.budget).map_err(|e| e.notice())?;
    Ok(FollowUpQuestion { kind: f.kind, question: f.question, targets: f.targets, number: earlier.len() as u32 + 1, of })
}

const NO_ENGINE: &str = "A follow-up needs a feedback engine. Choose one in Settings › AI.";

/// The interviewer's next question for a rep the user just kept.
#[tauri::command]
pub async fn next_follow_up(session_id: String, parent_n: u32) -> Cmd<FollowUpQuestion> {
    blocking(move || {
        let _t = crate::logging::Timer::new("next_follow_up");
        let storage = open().map_err(plain)?;
        let (out, unavailable) = with_ai(&session_id, |ai| match ai {
            Some(mut ctx) => next_follow_up_with(&storage, &mut ctx, &session_id, parent_n),
            None => Err(NO_ENGINE.to_string()),
        });
        out.map_err(|e| unavailable.unwrap_or(e))
    })
    .await
}

/// The interviewer's reply to a clarifying question. Nothing is saved; the real answer is recorded next.
#[tauri::command]
pub async fn clarify_reply(session_id: String, question: String, clarification: String, stage: String) -> Cmd<String> {
    blocking(move || {
        let _t = crate::logging::Timer::new("clarify_reply");
        let (out, unavailable) = with_ai(&session_id, |ai| match ai {
            Some(ctx) => followup::clarification_reply(ctx.llm, &question, &clarification, &stage, "", ctx.budget).map_err(|e| e.notice()),
            None => Err(NO_ENGINE.to_string()),
        });
        out.map_err(|e| unavailable.unwrap_or(e))
    })
    .await
}

/// Whether a feedback engine is set up and usable right now (follow-ups need one).
#[tauri::command]
pub fn ai_ready() -> bool {
    matches!(crate::ai_commands::resolved_from_disk(), Ok(Some(_)))
}

/// "Keep it" after "Start this rep again?": measure from after the restart.
#[tauri::command]
pub async fn rescore_rep(session_id: String, n: u32, keep_restart: bool) -> Cmd<RepOutcome> {
    blocking(move || {
        let _t = crate::logging::Timer::new("rescore_rep");
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
        let storage = open().map_err(plain)?;
        let application = storage.session(&session_id).ok().flatten().and_then(|s| s.application_id);
        storage.delete_rep(&session_id, n).map_err(plain)?;
        if let Some(app_id) = application {
            let _ = hook::forget_rep(&storage, &app_id, &session_id, Some(n));
        }
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

/// "Label this rep": the user's own pass or fail per criterion, saved into the eval set. An empty set clears them.
#[tauri::command]
pub async fn label_criteria(session_id: String, n: u32, labels: std::collections::BTreeMap<String, String>) -> Cmd<()> {
    blocking(move || open().and_then(|s| s.save_labels(&session_id, n, labels, &stamp(Utc::now()))).map_err(plain)).await
}

/// The labels already saved for a rep, so the screen can show them again.
#[tauri::command]
pub async fn rep_labels(session_id: String, n: u32) -> Cmd<std::collections::BTreeMap<String, String>> {
    blocking(move || {
        let storage = open().map_err(plain)?;
        let found = storage.eval_reps().map_err(plain)?.items.into_iter().find(|r| r.full.session_id == session_id && r.full.rep.n == n);
        Ok(found.map(|r| r.labels).unwrap_or_default())
    })
    .await
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

/// A rep in brief (no words, no sentences) for the habit and history screens: what was asked, how it went, which
/// checks passed. Every scored rep in every session, oldest first.
#[derive(Debug, Serialize)]
pub struct RepSummary {
    pub session_id: String,
    pub mode: String,
    pub stage: String,
    pub application_id: Option<String>,
    /// The target the session was for (the first target for sessions from before targets).
    pub target_id: Option<String>,
    pub started: String,
    pub n: u32,
    pub question_id: String,
    pub question_text: String,
    pub question_type: String,
    pub attempt: u32,
    pub follow_up: bool,
    pub recorded_at: String,
    pub rubric_version: u32,
    pub fix: Option<String>,
    pub note: Option<String>,
    pub note_was_wrong: bool,
    pub checks: Vec<crate::metrics::Check>,
    pub speaking_ms: u64,
    pub fillers: usize,
    pub tail_ms: Option<u64>,
    pub ai_cost_usd: Option<f64>,
}

pub fn summaries_with(storage: &Storage) -> StorageResult<Vec<RepSummary>> {
    let mut out = Vec::new();
    let mut sessions = storage.sessions()?.items;
    sessions.sort_by(|a, b| a.started.cmp(&b.started));
    let targets = storage.targets()?;
    let first = targets.iter().find(|t| !t.archived).map(|t| t.id.clone());
    let apps: std::collections::HashMap<String, Option<String>> = storage.load_applications(chrono::Local::now().naive_local())?.items.into_iter().map(|a| (a.id, a.target_id)).collect();
    for s in sessions {
        let target_id = s
            .target_id
            .clone()
            .filter(|id| targets.iter().any(|t| &t.id == id))
            .or_else(|| s.application_id.as_ref().and_then(|a| apps.get(a)).and_then(|t| crate::storage::targets::resolve_target(t.as_deref(), &targets, first.as_deref())))
            .or_else(|| first.clone());
        for r in storage.reps(&s.id)?.items.into_iter().filter(|r| r.rep.question_type != "candidate_questions") {
            out.push(RepSummary {
                session_id: s.id.clone(),
                mode: s.mode.clone(),
                stage: s.stage.clone(),
                application_id: s.application_id.clone(),
                target_id: target_id.clone(),
                started: s.started.clone(),
                n: r.rep.n,
                question_id: r.rep.question_id.clone(),
                question_text: r.rep.question_text.clone(),
                question_type: r.rep.question_type.clone(),
                attempt: r.rep.attempt,
                follow_up: r.rep.follow_up.is_some(),
                recorded_at: r.rep.recorded_at.clone(),
                rubric_version: r.metrics.rubric_version,
                fix: r.rep.fix.clone(),
                note: r.rep.note.clone(),
                note_was_wrong: r.rep.feedback.as_ref().is_some_and(|f| f.note_was_wrong),
                checks: r.metrics.checks.clone(),
                speaking_ms: r.metrics.speaking_ms,
                fillers: r.metrics.fillers.count,
                tail_ms: r.metrics.proof.tail_ms,
                ai_cost_usd: r.rep.ai.as_ref().map(|a| a.cost_usd),
            });
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn rep_summaries() -> Cmd<Vec<RepSummary>> {
    blocking(|| open().and_then(|s| summaries_with(&s)).map_err(plain)).await
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
        let keep: HashSet<String> = open().and_then(|s| s.eval_reps()).map(|l| l.items.into_iter().map(|r| format!("{}/{}", r.full.session_id, r.full.rep.n)).collect()).unwrap_or_default();
        Ok(audio_retention::sweep(&paths::audio_dir(), days, &keep, std::time::SystemTime::now()))
    })
    .await
}

#[tauri::command]
pub fn audio_retention() -> String {
    settings::load(&paths::settings_file()).audio_retention.unwrap_or_else(|| "30".to_string())
}

/// Megabytes of answer audio on this computer, for Settings, Privacy.
#[tauri::command]
pub async fn audio_usage_mb() -> Cmd<u64> {
    blocking(|| Ok(audio_retention::audio_bytes(&paths::audio_dir()).div_ceil(1_000_000))).await
}

/// Delete every recording now. The transcripts and notes stay.
#[tauri::command]
pub async fn delete_all_audio() -> Cmd<usize> {
    blocking(|| audio_retention::remove_all(&paths::audio_dir())).await
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
            usage: Usage { practiced: 0, fits: 0, said_number: None, by_target: Default::default() },
            year: None,
            angles: vec![],
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
            stage_id: None,
            question_id: "gen-001".into(),
            question_text: "Tell me about a time you cut churn.".into(),
            question_type: "behavioral".into(),
            behavioral_situation: Some("problem_solving".into()),
            commitment_check: false,
            builder_operator_check: false,
            is_major_story: true,
            founder_variant: false,
            follow_up: None,
            attempt,
            story_ids: vec!["st_a".into()],
            audio_path: wav,
            target_id: None,
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

    #[test]
    fn summaries_list_every_scored_rep_oldest_session_first_without_the_words() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let audio = tmp.join("audio");
        let one = finish_with(&storage, &audio, &args(&tmp, 1, None), words(40), true, now(), None).unwrap();
        let later = now() + chrono::Duration::days(1);
        finish_with(&storage, &audio, &args(&tmp, 1, None), words(40), true, later, None).unwrap();
        finish_with(&storage, &audio, &args(&tmp, 2, Some(&one.session_id)), words(4), true, now(), None).unwrap();
        let s = summaries_with(&storage).unwrap();
        assert_eq!(s.len(), 3);
        assert_eq!(s[0].session_id, one.session_id);
        assert_eq!(s.iter().filter(|r| r.session_id == one.session_id).map(|r| r.attempt).collect::<Vec<_>>(), vec![1, 2]);
        assert!(s[0].checks.iter().any(|c| c.id == "clean_stop") && s[0].speaking_ms > 0);
        assert!(!s[0].follow_up);
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

    // ---------- which target a session is for ----------

    fn two_targets(storage: &Storage) -> (crate::storage::targets::Target, crate::storage::targets::Target) {
        use crate::storage::targets::Target;
        storage.save_profile(&crate::storage::model::Profile { name: "Dana".into(), full_name: "".into(), target_role: "Lifecycle Manager".into(), seniority: "senior".into(), industry: "".into(), sells_to: "b2c".into(), identity_statement: "I fix activation.".into(), focus_habits: vec![] }).unwrap();
        let first = storage.targets().unwrap().remove(0);
        let ops = storage.save_target(&Target { role: "Marketing Operations Manager".into(), role_family: "marketing_ops".into(), sells_to: "b2b".into(), pitch: "I run the stack.".into(), ..Default::default() }).unwrap();
        (first, ops)
    }

    #[test]
    fn a_session_is_for_the_target_asked_for_else_the_applications_else_the_active_one() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let (first, ops) = two_targets(&storage);
        let finish = |a: &FinishArgs| finish_with(&storage, &tmp.join("audio"), a, words(40), true, now(), None).unwrap().session_id;
        // Nothing said: the active target.
        let plain = finish(&args(&tmp, 1, None));
        assert_eq!(storage.session(&plain).unwrap().unwrap().target_id.as_deref(), Some(first.id.as_str()));
        // Asked for.
        let mut a = args(&tmp, 2, None);
        a.target_id = Some(ops.id.clone());
        let asked = finish(&a);
        assert_eq!(storage.session(&asked).unwrap().unwrap().target_id.as_deref(), Some(ops.id.as_str()));
        // Inside an application filed under the second target.
        let app = storage.create_application(crate::storage::applications::NewApplication { company: "Northpine".into(), target_id: Some(ops.id.clone()), ..Default::default() }, chrono::NaiveDate::from_ymd_opt(2026, 10, 6).unwrap()).unwrap();
        let mut a = args(&tmp, 3, None);
        in_app(&mut a, &app.id, "recruiter");
        let in_application = finish(&a);
        assert_eq!(storage.session(&in_application).unwrap().unwrap().target_id.as_deref(), Some(ops.id.as_str()));
        // A target that does not exist is not stored.
        let mut a = args(&tmp, 4, None);
        a.target_id = Some("tg_nope".into());
        assert_eq!(storage.session(&finish(&a)).unwrap().unwrap().target_id.as_deref(), Some(first.id.as_str()));
        // The next answer of the same session keeps the session's target, whatever is active now.
        storage.set_active_target(&first.id).unwrap();
        let mut again = args(&tmp, 5, Some(&asked));
        again.target_id = None;
        finish(&again);
        assert_eq!(storage.session(&asked).unwrap().unwrap().target_id.as_deref(), Some(ops.id.as_str()));
    }

    #[test]
    fn rep_summaries_carry_the_sessions_target_and_old_sessions_resolve_to_the_first_target() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let (first, ops) = two_targets(&storage);
        let mut a = args(&tmp, 1, None);
        a.target_id = Some(ops.id.clone());
        let new = finish_with(&storage, &tmp.join("audio"), &a, words(40), true, now(), None).unwrap().session_id;
        let old = finish_with(&storage, &tmp.join("audio"), &args(&tmp, 2, None), words(40), true, now(), None).unwrap().session_id;
        // The old one was saved before targets: no target on the file.
        let mut sess = storage.session(&old).unwrap().unwrap();
        sess.target_id = None;
        storage.save_session(&sess).unwrap();
        let summaries = summaries_with(&storage).unwrap();
        let of = |id: &str| summaries.iter().find(|r| r.session_id == id).unwrap().target_id.clone();
        assert_eq!(of(&new).as_deref(), Some(ops.id.as_str()));
        assert_eq!(of(&old).as_deref(), Some(first.id.as_str()));
        assert_eq!(serde_json::to_value(&summaries[0]).unwrap()["target_id"].is_string(), true);
    }

    #[test]
    fn the_answer_is_judged_against_the_sessions_target_not_the_active_one() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let (_first, ops) = two_targets(&storage);
        // The active target is the first one ("I fix activation."); the session is for the second.
        let mut a = args(&tmp, 1, None);
        a.target_id = Some(ops.id.clone());
        a.question_type = "tell_me_about_yourself".into();
        a.story_ids = vec![];
        let llm = Scripted::new(vec![Ok(&score_json(1, 1, &[("answer_first", "pass")], false)), Ok(COACH)]);
        ai_run(&llm, &a, &storage, &tmp.join("audio"), words(40));
        let seen = llm.seen.lock().unwrap();
        assert!(seen[0].user.contains("I run the stack.") && !seen[0].user.contains("I fix activation."), "{}", seen[0].user);
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
        assert_eq!(rep.rep.ai.as_ref().unwrap().prompts, vec!["score-answer v2", "coach-note v2"]);
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

    // ---------- follow-ups ----------

    fn follow_score_json(fail: &[&str]) -> String {
        let v = |id: &str| json!({"result": if fail.contains(&id) { "fail" } else { "pass" }, "sentences": [1], "quote": "I owned it", "reason": "t"});
        json!({"rubric_version": 1, "clarifying_question": false, "not_an_answer": false, "first_answer_sentence": 1,
               "criteria": {"f1_answer_push": v("f1_answer_push"), "f2_new_specific": v("f2_new_specific"), "f3_consistent": v("f3_consistent"), "f5_held_position": v("f5_held_position")}})
        .to_string()
    }

    fn gen_json(kind: &str, q: &str) -> String {
        json!({"type": kind, "question": q, "targets": "ownership", "why": "t"}).to_string()
    }

    /// A kept first answer in a hiring-manager session, judged by the model.
    fn first_answer(storage: &Storage, tmp: &Path, stage: &str) -> String {
        let mut a = args(tmp, 1, None);
        a.stage = stage.into();
        let llm = Scripted::new(vec![Ok(&score_json(1, 1, &[("answer_first", "pass"), ("proof", "pass"), ("ownership", "fail")], false)), Ok(COACH)]);
        ai_run(&llm, &a, storage, &tmp.join("audio"), words(40)).session_id
    }

    #[test]
    fn the_next_follow_up_aims_at_the_saved_answer_and_counts_up_to_the_stage_limit() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let session = first_answer(&storage, &tmp, "hiring_manager");
        let mut budget = Budget::new(Provider::Claude, 0.0);
        let llm = Scripted::new(vec![Ok(&gen_json("ownership_probe", "What was your part in that, specifically?"))]);
        let f = next_follow_up_with(&storage, &mut AiCtx { llm: &llm, budget: &mut budget }, &session, 1).unwrap();
        assert_eq!((f.kind.as_str(), f.number, f.of), ("ownership_probe", 1, 2));
        assert!(llm.seen.lock().unwrap()[0].user.contains("Score summary: failed: ") && llm.seen.lock().unwrap()[0].user.contains("ownership"), "aimed at the weak spots");
        // Answer it, then ask for another: number 2, and the used type is passed along.
        let mut a2 = args(&tmp, 1, Some(&session));
        a2.stage = "hiring_manager".into();
        a2.follow_up = Some(FollowUpArgs { parent_n: 1, kind: "ownership_probe".into(), number: 1 });
        a2.question_text = f.question.clone();
        let llm = Scripted::new(vec![Ok(&follow_score_json(&[])), Ok(r#"{"note":"Held up.","rewrite":null,"offer_follow_up":true}"#)]);
        ai_run(&llm, &a2, &storage, &tmp.join("audio"), words(8));
        let llm = Scripted::new(vec![Ok(&gen_json("metric_probe", "How did you measure that?"))]);
        let f2 = next_follow_up_with(&storage, &mut AiCtx { llm: &llm, budget: &mut budget }, &session, 1).unwrap();
        assert_eq!((f2.kind.as_str(), f2.number), ("metric_probe", 2));
        assert!(llm.seen.lock().unwrap()[0].user.contains("already asked for this question: ownership_probe"));
    }

    #[test]
    fn a_recruiter_gets_one_follow_up_and_then_no_more() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let session = first_answer(&storage, &tmp, "recruiter");
        let mut budget = Budget::new(Provider::Claude, 0.0);
        let mut a2 = args(&tmp, 1, Some(&session));
        a2.follow_up = Some(FollowUpArgs { parent_n: 1, kind: "metric_probe".into(), number: 1 });
        let llm = Scripted::new(vec![Ok(&follow_score_json(&[])), Ok(r#"{"note":"Fine.","rewrite":null,"offer_follow_up":true}"#)]);
        ai_run(&llm, &a2, &storage, &tmp.join("audio"), words(8));
        let none = Scripted::new(vec![]);
        let err = next_follow_up_with(&storage, &mut AiCtx { llm: &none, budget: &mut budget }, &session, 1).unwrap_err();
        assert!(err.contains("all the follow-ups"), "{err}");
        assert_eq!(none.calls(), 0, "no model call is wasted past the limit");
    }

    #[test]
    fn a_follow_up_answer_is_saved_with_what_was_asked_and_judged_on_f1_to_f5_not_the_number_or_the_stop() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let session = first_answer(&storage, &tmp, "hiring_manager");
        let mut a2 = args(&tmp, 1, Some(&session));
        a2.stage = "hiring_manager".into();
        a2.question_text = "Wouldn't that have happened anyway?".into();
        a2.follow_up = Some(FollowUpArgs { parent_n: 1, kind: "skeptic_push".into(), number: 1 });
        let llm = Scripted::new(vec![Ok(&follow_score_json(&["f5_held_position"])), Ok(r#"{"note":"You backed off. Hold the claim.","rewrite":null,"offer_follow_up":true}"#)]);
        let out = ai_run(&llm, &a2, &storage, &tmp.join("audio"), words(8));
        let rep = out.rep.unwrap();
        assert_eq!(rep.rep.n, 2);
        let meta = rep.rep.follow_up.unwrap();
        assert_eq!((meta.parent_n, meta.kind.as_str(), meta.number, meta.question.as_str()), (1, "skeptic_push", 1, "Wouldn't that have happened anyway?"));
        assert_eq!(rep.rep.fix.as_deref(), Some("f5_held_position"));
        let ids: Vec<&str> = rep.metrics.checks.iter().map(|c| c.id.as_str()).collect();
        assert!(ids.contains(&"f1_answer_push") && ids.contains(&"f4_short") && !ids.contains(&"proof") && !ids.contains(&"clean_stop"), "{ids:?}");
        assert_eq!(rep.rep.ai.unwrap().prompts[0], "score-follow-up v1");
    }

    #[test]
    fn a_follow_up_the_model_cannot_judge_keeps_only_the_timing_of_the_fillers() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let session = first_answer(&storage, &tmp, "hiring_manager");
        let mut a2 = args(&tmp, 1, Some(&session));
        a2.follow_up = Some(FollowUpArgs { parent_n: 1, kind: "metric_probe".into(), number: 1 });
        let llm = Scripted::new(vec![Err(AiError::Unavailable("offline".into()))]);
        let out = ai_run(&llm, &a2, &storage, &tmp.join("audio"), words(8));
        let rep = out.rep.unwrap();
        assert!(rep.metrics.checks.iter().all(|c| c.id == "fillers"));
        assert!(out.notice.is_some());
    }

    #[test]
    fn a_clarifying_question_comes_back_with_what_was_said_so_the_interviewer_can_reply() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let llm = Scripted::new(vec![Ok(&score_json(1, 1, &[], true))]);
        let out = ai_run(&llm, &args(&tmp, 1, None), &storage, &tmp.join("audio"), words(40));
        assert_eq!(out.outcome, "clarifying");
        assert!(out.transcript_text.unwrap().starts_with("We cut churn"));
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

    // ---------- inside an application ----------

    use crate::storage::application_files::{AnalysisFile, ClaimsFile, DerivedAnalysis};
    use crate::storage::applications::NewApplication;

    fn app(storage: &Storage, startup: bool) -> String {
        storage.create_application(NewApplication { company: "Kestrel Pay".into(), startup, ..Default::default() }, chrono::NaiveDate::from_ymd_opt(2026, 10, 6).unwrap()).unwrap().id
    }

    fn claims_reply(claims: Value, conflicts: Value) -> String {
        json!({"claims": claims, "conflicts": conflicts}).to_string()
    }

    fn notice_claim(value: &str) -> Value {
        json!([{"type": "availability", "subject": "notice period", "value": value, "quote": "We cut churn", "sentence": 1}])
    }

    fn in_app(a: &mut FinishArgs, app_id: &str, stage: &str) {
        a.application_id = Some(app_id.into());
        a.stage = stage.into();
    }

    fn good_score() -> String {
        score_json(1, 1, &[("answer_first", "pass"), ("proof", "pass")], false)
    }

    fn saved_claims(storage: &Storage, app_id: &str) -> Vec<crate::storage::application_files::ClaimRec> {
        storage.load_application_part::<ClaimsFile>(app_id, "claims.json").unwrap().map(|f| f.claims).unwrap_or_default()
    }

    #[test]
    fn a_scored_answer_inside_an_application_saves_its_claims_with_the_stage_and_the_rep_and_the_session_knows_its_stage() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let id = app(&storage, false);
        let mut a = args(&tmp, 1, None);
        in_app(&mut a, &id, "recruiter");
        let llm = Scripted::new(vec![Ok(&good_score()), Ok(COACH), Ok(&claims_reply(notice_claim("four weeks"), json!([])))]);
        let out = ai_run(&llm, &a, &storage, &tmp.join("audio"), words(40));
        let rep = out.rep.unwrap();
        assert_eq!(llm.calls(), 3);
        assert!(rep.metrics.checks.iter().all(|c| c.id != "c1_consistent"), "nothing earlier to compare with");
        assert_eq!(rep.rep.ai.as_ref().unwrap().prompts, vec!["score-answer v2", "coach-note v2", "extract-claims v1"]);
        let claims = saved_claims(&storage, &id);
        assert_eq!(claims.len(), 1);
        assert_eq!((claims[0].stage.as_str(), claims[0].stage_ref.as_str(), claims[0].value.as_str()), ("stg_1", "recruiter", "four weeks"));
        let r = claims[0].rep.clone().unwrap();
        assert_eq!((r.session_id.as_str(), r.n), (out.session_id.as_str(), 1));
        let session = storage.session(&out.session_id).unwrap().unwrap();
        assert_eq!((session.application_id.as_deref(), session.stage_id.as_deref()), (Some(id.as_str()), Some("stg_1")));
    }

    #[test]
    fn a_later_answer_that_conflicts_fails_the_consistency_check_and_the_note_is_about_it() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let id = app(&storage, false);
        let mut first = args(&tmp, 1, None);
        in_app(&mut first, &id, "recruiter");
        ai_run(&Scripted::new(vec![Ok(&good_score()), Ok(COACH), Ok(&claims_reply(notice_claim("four weeks"), json!([])))]), &first, &storage, &tmp.join("audio"), words(40));
        let mut second = args(&tmp, 2, None);
        in_app(&mut second, &id, "hiring_manager");
        let conflict = json!([{"type": "availability", "subject": "notice period", "earlier_claim_id": "cl_1", "earlier_stage": "recruiter", "earlier_value": "four weeks", "new_value": "two weeks", "sentence": 1}]);
        let c1_note = r#"{"note":"In the recruiter stage you said four weeks. Say it the same way.","rewrite":null,"offer_follow_up":true}"#;
        let llm = Scripted::new(vec![Ok(&good_score()), Ok(COACH), Ok(&claims_reply(notice_claim("two weeks"), conflict)), Ok(c1_note)]);
        let out = ai_run(&llm, &second, &storage, &tmp.join("audio"), words(40));
        let rep = out.rep.unwrap();
        let c1 = rep.metrics.checks.iter().find(|c| c.id == "c1_consistent").unwrap();
        assert_eq!(c1.passed, Some(false));
        assert_eq!(c1.evidence, "In the recruiter stage you said \"four weeks\". Here you said \"two weeks\".");
        assert_eq!(rep.rep.fix.as_deref(), Some("c1_consistent"), "it outranks the tail the first note was about");
        assert_eq!(rep.rep.note.as_deref(), Some("In the recruiter stage you said four weeks. Say it the same way."));
        let seen = llm.seen.lock().unwrap();
        assert!(seen[3].user.contains("c1_consistent"), "the coach is told the new fix");
        assert!(seen[2].user.contains("cl_1 | stage=recruiter | availability | \"four weeks\" | current"), "the claims log reached the model");
        let flagged = saved_claims(&storage, &id).into_iter().find(|c| c.value == "two weeks").unwrap();
        assert_eq!(flagged.conflict.unwrap().earlier_claim_id, "cl_1");
        assert_eq!(flagged.stage, "stg_2");
    }

    #[test]
    fn a_passing_consistency_check_leaves_the_fix_and_the_note_as_they_were() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let id = app(&storage, false);
        let mut first = args(&tmp, 1, None);
        in_app(&mut first, &id, "recruiter");
        ai_run(&Scripted::new(vec![Ok(&good_score()), Ok(COACH), Ok(&claims_reply(notice_claim("four weeks"), json!([])))]), &first, &storage, &tmp.join("audio"), words(40));
        let mut second = args(&tmp, 2, None);
        in_app(&mut second, &id, "hiring_manager");
        let llm = Scripted::new(vec![Ok(&good_score()), Ok(COACH), Ok(&claims_reply(notice_claim("a month"), json!([])))]);
        let rep = ai_run(&llm, &second, &storage, &tmp.join("audio"), words(40)).rep.unwrap();
        assert_eq!(llm.calls(), 3, "no second coach call when nothing conflicts");
        assert_eq!(rep.metrics.checks.iter().find(|c| c.id == "c1_consistent").unwrap().passed, Some(true));
        assert_eq!(rep.rep.fix.as_deref(), Some("clean_stop"));
        assert_eq!(rep.rep.note.as_deref(), Some("You kept going long after the number. Stop once it lands."));
    }

    #[test]
    fn a_follow_up_answer_inside_an_application_is_checked_for_consistency_too() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let id = app(&storage, false);
        let mut first = args(&tmp, 1, None);
        in_app(&mut first, &id, "hiring_manager");
        let session = ai_run(&Scripted::new(vec![Ok(&good_score()), Ok(COACH), Ok(&claims_reply(notice_claim("four weeks"), json!([])))]), &first, &storage, &tmp.join("audio"), words(40)).session_id;
        let mut f = args(&tmp, 1, Some(&session));
        in_app(&mut f, &id, "hiring_manager");
        f.question_text = "Wouldn't that have happened anyway?".into();
        f.follow_up = Some(FollowUpArgs { parent_n: 1, kind: "skeptic_push".into(), number: 1 });
        let conflict = json!([{"type": "availability", "subject": "notice period", "earlier_claim_id": "cl_1", "earlier_stage": "hiring_manager", "earlier_value": "four weeks", "new_value": "six weeks", "sentence": 1}]);
        let llm = Scripted::new(vec![Ok(&follow_score_json(&[])), Ok(COACH), Ok(&claims_reply(notice_claim("six weeks"), conflict)), Ok(r#"{"note":"You said four weeks before.","rewrite":null,"offer_follow_up":false}"#)]);
        let rep = ai_run(&llm, &f, &storage, &tmp.join("audio"), words(8)).rep.unwrap();
        assert_eq!(rep.rep.n, 2);
        assert_eq!(rep.rep.fix.as_deref(), Some("c1_consistent"));
        assert!(rep.metrics.checks.iter().any(|c| c.id == "f1_answer_push") && rep.metrics.checks.iter().any(|c| c.id == "c1_consistent"));
        assert_eq!(saved_claims(&storage, &id).len(), 2);
        assert_eq!(saved_claims(&storage, &id)[1].rep.as_ref().unwrap().n, 2);
    }

    #[test]
    fn if_the_claims_cannot_be_checked_the_rep_is_still_saved_with_a_plain_notice() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let id = app(&storage, false);
        let mut a = args(&tmp, 1, None);
        in_app(&mut a, &id, "recruiter");
        let llm = Scripted::new(vec![Ok(&good_score()), Ok(COACH), Err(AiError::Failed("The network dropped.".into()))]);
        let out = ai_run(&llm, &a, &storage, &tmp.join("audio"), words(40));
        let rep = out.rep.unwrap();
        assert_eq!(rep.rep.fix.as_deref(), Some("clean_stop"), "the first note stands");
        assert!(rep.rep.note.is_some());
        assert!(out.notice.unwrap().contains("compare this answer with what you said before"));
        assert!(saved_claims(&storage, &id).is_empty());
    }

    #[test]
    fn practice_without_an_application_and_an_application_that_is_gone_make_no_claims_call() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let llm = Scripted::new(vec![Ok(&good_score()), Ok(COACH)]);
        ai_run(&llm, &args(&tmp, 1, None), &storage, &tmp.join("audio"), words(40));
        assert_eq!(llm.calls(), 2);
        let mut gone = args(&tmp, 2, None);
        gone.application_id = Some("app_deleted".into());
        let llm = Scripted::new(vec![Ok(&good_score()), Ok(COACH)]);
        let out = ai_run(&llm, &gone, &storage, &tmp.join("audio"), words(40));
        assert_eq!(llm.calls(), 2);
        assert!(out.rep.is_some());
    }

    #[test]
    fn the_leadership_round_of_a_startup_is_the_founder_variant_even_if_the_screen_did_not_ask() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let startup = app(&storage, true);
        let mut a = args(&tmp, 1, None);
        in_app(&mut a, &startup, "leadership");
        a.founder_variant = false;
        let llm = Scripted::new(vec![Ok(&good_score()), Ok(COACH), Ok(&claims_reply(json!([]), json!([])))]);
        let rep = ai_run(&llm, &a, &storage, &tmp.join("audio"), words(40)).rep.unwrap();
        assert!(rep.rep.founder_variant);
        assert!(llm.seen.lock().unwrap()[0].user.contains("founder variant"), "the scorer is told");
        // Not the leadership round: no founder variant. Not a startup: none either.
        let mut hm = args(&tmp, 2, None);
        in_app(&mut hm, &startup, "hiring_manager");
        let rep = ai_run(&Scripted::new(vec![Ok(&good_score()), Ok(COACH), Ok(&claims_reply(json!([]), json!([])))]), &hm, &storage, &tmp.join("audio"), words(40)).rep.unwrap();
        assert!(!rep.rep.founder_variant);
        let plain = app(&storage, false);
        let mut lead = args(&tmp, 3, None);
        in_app(&mut lead, &plain, "leadership");
        let rep = ai_run(&Scripted::new(vec![Ok(&good_score()), Ok(COACH), Ok(&claims_reply(json!([]), json!([])))]), &lead, &storage, &tmp.join("audio"), words(40)).rep.unwrap();
        assert!(!rep.rep.founder_variant);
    }

    #[test]
    fn the_postings_summary_reaches_the_scorer_inside_an_application() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let id = app(&storage, false);
        let file = AnalysisFile { prompt: "analyse-jd v1".into(), engine: "ai".into(), read_on: "x".into(), raw: None, derived: DerivedAnalysis { summary: "A founder-led payments startup needs one lifecycle owner.".into(), ..Default::default() }, edited_by_user: vec![] };
        storage.save_application_part(&id, "analysis.json", &file).unwrap();
        let mut a = args(&tmp, 1, None);
        in_app(&mut a, &id, "recruiter");
        let llm = Scripted::new(vec![Ok(&good_score()), Ok(COACH), Ok(&claims_reply(json!([]), json!([])))]);
        ai_run(&llm, &a, &storage, &tmp.join("audio"), words(40));
        assert!(llm.seen.lock().unwrap()[0].user.contains("A founder-led payments startup needs one lifecycle owner."));
    }

    #[test]
    fn scoring_a_kept_restart_again_hears_the_claims_again_instead_of_stacking_them() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let audio = tmp.join("audio");
        let id = app(&storage, false);
        let mut a = args(&tmp, 1, None);
        in_app(&mut a, &id, "recruiter");
        let out = ai_run(&Scripted::new(vec![Ok(&good_score()), Ok(COACH), Ok(&claims_reply(notice_claim("four weeks"), json!([])))]), &a, &storage, &audio, words(40));
        let again = Scripted::new(vec![Ok(&good_score()), Ok(COACH), Ok(&claims_reply(notice_claim("five weeks"), json!([])))]);
        let mut budget = Budget::new(Provider::Claude, 0.0);
        rescore_with(&storage, &audio, &out.session_id, 1, true, Some(AiCtx { llm: &again, budget: &mut budget })).unwrap();
        let claims = saved_claims(&storage, &id);
        assert_eq!(claims.iter().map(|c| c.value.as_str()).collect::<Vec<_>>(), vec!["five weeks"]);
    }

    #[test]
    fn a_rep_inside_an_application_is_timed_by_its_stage_type_even_when_the_stage_is_renamed_or_repeated() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let id = app(&storage, false);
        storage.rename_stage(&id, "stg_4", "Founder call").unwrap();
        storage.add_stage(&id, "hiring_manager", Some("Second call with Marco"), None).unwrap();
        let mut lead = args(&tmp, 1, None);
        in_app(&mut lead, &id, "leadership");
        let out = finish_with(&storage, &tmp.join("audio"), &lead, words(40), true, now(), None).unwrap();
        assert_eq!(out.rep.unwrap().metrics.window, crate::metrics::timing::window("leadership", "behavioral"), "the existing windows by stage type, not a copy of them");
        let mut second = args(&tmp, 2, None);
        in_app(&mut second, &id, "hiring_manager");
        second.stage_id = Some("stg_5".into());
        let out = finish_with(&storage, &tmp.join("audio"), &second, words(40), true, now(), None).unwrap();
        assert_eq!(out.rep.unwrap().metrics.window, crate::metrics::timing::window("hiring_manager", "behavioral"));
        let session = storage.session(&out.session_id).unwrap().unwrap();
        assert_eq!(session.stage_id.as_deref(), Some("stg_5"), "the second hiring manager call, not the first");
        assert_eq!(storage.application(&id).unwrap().sessions_on_stage(&storage.application(&id).unwrap().process[4], &storage.sessions().unwrap().items), 1);
    }

    #[test]
    fn a_number_that_differs_from_the_resume_in_the_recruiter_stage_fails_the_consistency_check() {
        let (guard, storage) = setup();
        let tmp = guard.path().to_path_buf();
        let id = app(&storage, false);
        let mut file = ClaimsFile::default();
        file.claims.push(crate::storage::application_files::ClaimRec { id: "cl_1".into(), kind: "proof_number".into(), subject: "7-day activation".into(), value: "31% to 44%".into(), quote: "Lifted 7-day activation from 31% to 44%".into(), stage: "resume".into(), stage_ref: "resume".into(), rep: None, updated: "x".into(), superseded_by: None, edited_by_user: vec![], source: "resume".into(), conflict: None });
        file.next_n = 1;
        storage.save_application_part(&id, "claims.json", &file).unwrap();
        let mut a = args(&tmp, 1, None);
        in_app(&mut a, &id, "recruiter");
        let said = json!([{"type": "proof_number", "subject": "7-day activation", "value": "24% to 18%", "quote": "We cut churn from 24% to 18%", "sentence": 1}]);
        let conflict = json!([{"type": "proof_number", "subject": "7-day activation", "earlier_claim_id": "cl_1", "earlier_stage": "resume", "earlier_value": "31% to 44%", "new_value": "24% to 18%", "sentence": 1}]);
        let llm = Scripted::new(vec![Ok(&good_score()), Ok(COACH), Ok(&claims_reply(said, conflict)), Ok(r#"{"note":"Your resume says 31 to 44.","rewrite":null,"offer_follow_up":true}"#)]);
        let rep = ai_run(&llm, &a, &storage, &tmp.join("audio"), words(40)).rep.unwrap();
        let c1 = rep.metrics.checks.iter().find(|c| c.id == "c1_consistent").unwrap();
        assert_eq!(c1.passed, Some(false));
        assert!(c1.evidence.starts_with("Your resume says \"31% to 44%\""), "{}", c1.evidence);
        assert_eq!(rep.rep.fix.as_deref(), Some("c1_consistent"));
    }
}
