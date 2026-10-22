//! What the screens read: an application in exactly the shape of `Application` in `src/data/types.ts`, and the extras
//! the application screens keep next to it (`ApplicationExtras` in `src/data/screens/applications.ts`). Everything here
//! is derived from the files and from the reps; nothing is stored in this shape.

use super::cue::{night_before_view, NightBeforeView};
use super::jd::story_headline;
use super::resume::bank_status;
use crate::storage::application_files::{AnalysisFile, ClaimRec, ClaimsFile, DerivedAnalysis, QuestionsFile, ResumeRec};
use crate::storage::applications::{stage_label, AppRecord, ClosedReason, Contact, NightBefore, Status};
use crate::storage::model::Story;
use crate::storage::reps::Session;
use crate::storage::targets::{resolve_target, Target, TargetFit};
use crate::storage::{Result as StorageResult, Storage};
use chrono::NaiveDateTime;
use serde::Serialize;
use std::collections::{BTreeMap, HashMap, HashSet};

/// What building the views needs to know, read once for all applications.
pub struct Ctx<'a> {
    pub now: NaiveDateTime,
    pub stories: &'a [Story],
    pub sessions: &'a [Session],
    /// Every target (archived included), so an application with no target of its own, or one that names a target that
    /// is gone, shows under the first target that is not archived.
    pub targets: &'a [Target],
}

/// One line on what this interviewer is deciding (the same words as `STAGE_DECIDES` in the frontend).
pub fn decides(stage: &str) -> &'static str {
    match stage {
        "recruiter" => "Fit and logistics: can they move you forward. Short answers.",
        "hiring_manager" => "Can you do this job, and how do you work. Follow-ups on ownership and numbers.",
        "technical" => "How deep you go when someone keeps asking why.",
        "panel" => "Can people across teams work with you. Follow-ups on disagreement.",
        "leadership" => "Founder call: judgment, commitment, will you run it yourself. Short, skeptical follow-ups.",
        _ => "",
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ProcessStageView {
    pub id: String,
    pub stage: String,
    pub label: String,
    pub order: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub at: Option<String>,
    pub done: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub previous_at: Vec<String>,
    pub decides: String,
    pub sessions: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClaimView {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub subject: String,
    pub value: String,
    pub quote: String,
    /// The process stage id, or `resume`.
    pub stage: String,
    pub stage_label: String,
    /// `matches`, `differs`, `not_in_bank`, `consistent`, `updated`, `said_once`.
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    // Beyond the TypeScript type: what the editing controls need.
    pub edited: bool,
    pub superseded: bool,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct MustSayView {
    pub id: String,
    pub text: String,
    pub resume: String,
    pub said: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SuggestionView {
    pub text: String,
    pub gap: String,
    pub bullet: String,
    pub employer: String,
    pub title: String,
    pub headline_result: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ResumeView {
    #[serde(rename = "fileName")]
    pub file_name: String,
    pub title: String,
    pub pages: u32,
    #[serde(rename = "sentOn")]
    pub sent_on: String,
    /// "" until it has been read.
    #[serde(rename = "readOn")]
    pub read_on: String,
    pub claims: Vec<ClaimView>,
    #[serde(rename = "mustSay")]
    pub must_say: Vec<MustSayView>,
    pub suggestions: Vec<SuggestionView>,
    // Beyond the TypeScript type.
    /// `attached` (waiting for the user to confirm the read), `no_text` (paste the text), `read`.
    pub status: String,
    pub needs_paste: bool,
    pub kind: String,
    pub text_source: String,
    pub engine: Option<String>,
    /// `ready`, `waiting_for_posting`, `none`, or empty before a read.
    pub must_say_state: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ApplicationView {
    pub id: String,
    pub company: String,
    pub role: String,
    pub status: Status,
    pub closed_reason: Option<ClosedReason>,
    pub applied_on: String,
    pub source: String,
    pub contacts: Vec<Contact>,
    pub notes: String,
    pub startup: bool,
    pub process: Vec<ProcessStageView>,
    pub current_stage_id: Option<String>,
    pub edited_by_user: Vec<String>,
    pub resume: Option<ResumeView>,
    pub analysis: Option<DerivedAnalysis>,
    /// What was said in practice (the resume's lines are in `resume.claims`).
    pub claims: Vec<ClaimView>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub waiting: Option<String>,
    #[serde(rename = "answersPracticed")]
    pub answers_practiced: u32,
    // Beyond the TypeScript type.
    /// A status the tracker might move to. Only a suggestion: the user sets the status.
    pub suggested_status: Option<Status>,
    /// The day before the earliest upcoming interview.
    pub night_before: Option<NightBefore>,
    /// "I didn't send one".
    pub no_resume: bool,
    /// The target this application is filed under (the first target that is not archived when it names none).
    #[serde(rename = "targetId")]
    pub target_id: Option<String>,
    /// How the posting read against the targets; null until a posting has been read.
    #[serde(rename = "targetFit")]
    pub target_fit: Option<TargetFit>,
    /// The target the person chose to keep on the fit banner (the banner stays quiet while it is the filed target).
    #[serde(rename = "fitDismissedFor")]
    pub fit_dismissed_for: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PrepQuestionView {
    pub id: String,
    #[serde(rename = "stageId")]
    pub stage_id: String,
    /// The screens' names: `behavioral`, `about_you`, `technical`, `factual`, `future`, `gap`, `motivation`.
    #[serde(rename = "type")]
    pub kind: String,
    pub text: String,
    #[serde(rename = "bestStoryId")]
    pub best_story_id: Option<String>,
    pub why: String,
    #[serde(rename = "editedByUser")]
    pub edited_by_user: bool,
    pub source: String,
    #[serde(rename = "behavioralSituation")]
    pub behavioral_situation: Option<String>,
    #[serde(rename = "commitmentCheck")]
    pub commitment_check: bool,
    #[serde(rename = "builderOperatorCheck")]
    pub builder_operator_check: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExtrasView {
    #[serde(rename = "postingText")]
    pub posting_text: String,
    /// "2026-10-09", or "" when there is no posting.
    #[serde(rename = "postingPastedOn")]
    pub posting_pasted_on: String,
    #[serde(rename = "wasValues")]
    pub was_values: BTreeMap<String, String>,
    /// Answers practiced per stage, by stage id.
    #[serde(rename = "practicedByStage")]
    pub practiced_by_stage: BTreeMap<String, u32>,
    /// The lock for the stage the night-before suggestion is about (else the current stage), when there is one.
    #[serde(rename = "nightBefore", skip_serializing_if = "Option::is_none")]
    pub night_before: Option<NightBeforeView>,
    /// Every stage that has a lock, by stage id.
    #[serde(rename = "lockedByStage")]
    pub locked_by_stage: BTreeMap<String, NightBeforeView>,
    pub questions: Vec<PrepQuestionView>,
}

fn ts_kind(kind: &str, resume: bool) -> &'static str {
    match kind {
        "role_title" | "tenure" => "title",
        "proof_number" => {
            if resume {
                "number"
            } else {
                "result"
            }
        }
        "availability" => "notice",
        "compensation" => "pay_range",
        "reason_for_leaving" => "reason_leaving",
        "why_this_company" => "why_company",
        _ => "result",
    }
}

fn single_valued(kind: &str) -> bool {
    matches!(kind, "reason_for_leaving" | "why_this_company" | "compensation")
}

/// The subject as the screen groups it: one wording for the things there is only one answer to, a capital letter
/// for the rest, so "notice period" and "Notice period" are one line.
fn subject_of(c: &ClaimRec, company: &str) -> String {
    match c.kind.as_str() {
        "reason_for_leaving" => "Why you're leaving".into(),
        "compensation" => "Pay range".into(),
        "why_this_company" => format!("Why {company}"),
        _ => {
            let s = c.subject.trim();
            let mut chars = s.chars();
            chars.next().map(|f| f.to_uppercase().collect::<String>() + chars.as_str()).unwrap_or_default()
        }
    }
}

fn stage_words(stage_ref: &str) -> String {
    stage_ref.replace('_', " ")
}

fn stage_label_of(app: &AppRecord, c: &ClaimRec) -> String {
    if c.stage == "resume" {
        return "Your resume".into();
    }
    app.process.iter().find(|p| p.id == c.stage).map(|p| p.label.clone()).filter(|l| !l.is_empty()).unwrap_or_else(|| stage_label(&c.stage_ref).to_string())
}

fn date_part(stamp: &str) -> String {
    stamp.chars().take(10).collect()
}

/// The claims in What you've said: each with where it was said and whether it agrees with the rest.
fn said_claims(app: &AppRecord, claims: &[ClaimRec]) -> Vec<ClaimView> {
    let live = |c: &ClaimRec| c.superseded_by.is_none();
    let find = |id: &str| claims.iter().find(|c| c.id == id);
    // Both sides of a conflict that still stands.
    let mut flagged: HashMap<String, String> = HashMap::new();
    for c in claims.iter().filter(|c| c.stage != "resume" && live(c)) {
        let Some(cf) = &c.conflict else { continue };
        let Some(earlier) = find(&cf.earlier_claim_id).filter(|e| live(e)) else { continue };
        let before = if cf.earlier_stage == "resume" { "Your resume says".to_string() } else { format!("In the {} stage you said", stage_words(&cf.earlier_stage)) };
        flagged.insert(c.id.clone(), format!("{before} \"{}\".", cf.earlier_value));
        let now_in = if c.stage_ref == "resume" { "your resume".to_string() } else { format!("the {} stage", stage_words(&c.stage_ref)) };
        flagged.entry(earlier.id.clone()).or_insert_with(|| format!("You said \"{}\" in {now_in}.", c.value));
    }
    let group_of = |c: &ClaimRec| (c.kind.clone(), if single_valued(&c.kind) { String::new() } else { super::inputs::norm(&c.subject) });
    let mut live_in_group: HashMap<(String, String), usize> = HashMap::new();
    for c in claims.iter().filter(|c| c.stage != "resume" && live(c)) {
        *live_in_group.entry(group_of(c)).or_default() += 1;
    }
    claims
        .iter()
        .filter(|c| c.stage != "resume")
        .map(|c| {
            let (status, note) = if !live(c) {
                ("consistent", Some("Replaced by the current answer.".to_string()))
            } else if c.source == "updated" {
                ("updated", Some("Marked as the current answer".to_string()))
            } else if let Some(n) = flagged.get(&c.id) {
                ("differs", Some(n.clone()))
            } else if live_in_group.get(&group_of(c)).copied().unwrap_or(0) >= 2 {
                ("consistent", None)
            } else {
                ("said_once", None)
            };
            ClaimView {
                id: c.id.clone(),
                kind: ts_kind(&c.kind, false).into(),
                subject: subject_of(c, &app.company),
                value: c.value.clone(),
                quote: c.quote.clone(),
                stage: c.stage.clone(),
                stage_label: stage_label_of(app, c),
                status: status.into(),
                note,
                edited: !c.edited_by_user.is_empty(),
                superseded: !live(c),
                source: c.source.clone(),
            }
        })
        .collect()
}

fn resume_view(app: &AppRecord, rec: &ResumeRec, claims: &[ClaimRec], stories: &[Story]) -> ResumeView {
    let lines: Vec<&ClaimRec> = claims.iter().filter(|c| c.stage == "resume" && c.superseded_by.is_none()).collect();
    let claim_views = lines
        .iter()
        .map(|c| {
            let (status, note) = if c.kind == "proof_number" {
                let (s, n) = bank_status(rec.bank_check.iter().find(|b| b.claim_id == c.id), stories);
                (s, n)
            } else {
                ("consistent".to_string(), None)
            };
            ClaimView {
                id: c.id.clone(),
                kind: ts_kind(&c.kind, true).into(),
                subject: subject_of(c, &app.company),
                value: c.value.clone(),
                quote: c.quote.clone(),
                stage: "resume".into(),
                stage_label: "Your resume".into(),
                status,
                note,
                edited: !c.edited_by_user.is_empty(),
                superseded: false,
                source: c.source.clone(),
            }
        })
        .collect();
    let title = {
        let role = lines.iter().find(|c| c.kind == "role_title").map(|c| c.value.clone());
        let when = lines.iter().find(|c| c.kind == "tenure").map(|c| c.value.clone());
        match (role, when) {
            (Some(r), Some(w)) => format!("{r} · {w}"),
            (Some(r), None) => r,
            (None, _) => String::new(),
        }
    };
    let must_say = rec
        .must_say
        .iter()
        .map(|m| MustSayView {
            id: m.id.clone(),
            text: m.qualification.clone(),
            resume: format!("Resume: \"{}\"", m.resume_quote),
            said: if m.said_in == 0 || rec.mocks_checked == 0 { "Not said yet".into() } else { format!("Said in {} of {}", m.said_in, rec.mocks_checked) },
        })
        .collect();
    let suggestions = rec
        .story_suggestions
        .iter()
        .map(|s| SuggestionView {
            text: if s.employer.is_empty() { format!("{}, {}", s.title, s.headline_result) } else { format!("{} at {}, {}", s.title, s.employer, s.headline_result) },
            gap: "Strategy missing".into(),
            bullet: s.bullet.clone(),
            employer: s.employer.clone(),
            title: s.title.clone(),
            headline_result: s.headline_result.clone(),
        })
        .collect();
    ResumeView {
        file_name: rec.file_name.clone(),
        title,
        pages: rec.pages,
        sent_on: app.applied_on.clone(),
        read_on: rec.read_on.as_deref().map(date_part).unwrap_or_default(),
        claims: claim_views,
        must_say,
        suggestions,
        status: rec.status.clone(),
        needs_paste: rec.status == "no_text",
        kind: rec.kind.clone(),
        text_source: rec.text_source.clone(),
        engine: rec.engine.clone(),
        must_say_state: rec.must_say_state.clone(),
    }
}

/// The reading of the posting with each belief's covering story as it is now.
fn analysis_view(file: AnalysisFile, stories: &[Story]) -> (DerivedAnalysis, Vec<String>) {
    let mut a = file.derived;
    for b in a.beliefs.iter_mut() {
        let Some(id) = b.story_id.clone() else { continue };
        match stories.iter().find(|s| s.id == id) {
            Some(s) => {
                let h = story_headline(s);
                b.story = if h.is_empty() { s.title.clone() } else { format!("{} · {h}", s.title) };
                b.covered = true;
            }
            None => {
                b.story_id = None;
                b.story = String::new();
                b.covered = false;
                b.why = Some("The story that covered this was deleted. Pick another, or add one.".into());
            }
        }
    }
    (a, file.edited_by_user.into_iter().map(|p| format!("analysis.{p}")).collect())
}

fn current_stage(app: &AppRecord, now: NaiveDateTime) -> Option<String> {
    if app.status == Status::Closed {
        return None;
    }
    app.upcoming(now).first().map(|p| p.id.clone())
}

pub fn build(storage: &Storage, app: &AppRecord, ctx: &Ctx) -> StorageResult<ApplicationView> {
    let claims = storage.load_application_part::<ClaimsFile>(&app.id, "claims.json")?.unwrap_or_default().claims;
    let resume = storage.load_application_part::<ResumeRec>(&app.id, "resume/resume.json")?.map(|r| resume_view(app, &r, &claims, ctx.stories));
    let mut edited = app.edited_by_user.clone();
    let analysis = storage.load_application_part::<AnalysisFile>(&app.id, "analysis.json")?.map(|f| {
        let (a, paths) = analysis_view(f, ctx.stories);
        edited.extend(paths);
        a
    });
    let process = app
        .process
        .iter()
        .enumerate()
        .map(|(i, p)| ProcessStageView {
            id: p.id.clone(),
            stage: p.stage.clone(),
            label: p.label.clone(),
            order: i as u32 + 1,
            at: p.at.clone(),
            done: p.done,
            previous_at: p.previous_at.clone(),
            decides: decides(&p.stage).to_string(),
            sessions: app.sessions_on_stage(p, ctx.sessions) as u32,
            note: None,
        })
        .collect();
    let answers = ctx.sessions.iter().filter(|s| s.application_id.as_deref() == Some(app.id.as_str())).map(|s| storage.rep_count(&s.id) as u32).sum();
    Ok(ApplicationView {
        id: app.id.clone(),
        company: app.company.clone(),
        role: app.role.clone(),
        status: app.status,
        closed_reason: app.closed_reason,
        applied_on: app.applied_on.clone(),
        source: app.source.clone(),
        contacts: app.contacts.clone(),
        notes: app.notes.clone(),
        startup: app.startup,
        process,
        current_stage_id: current_stage(app, ctx.now),
        edited_by_user: edited,
        resume,
        analysis,
        claims: said_claims(app, &claims),
        waiting: app.waiting(ctx.now),
        answers_practiced: answers,
        suggested_status: app.suggested_status(),
        night_before: app.night_before(ctx.now),
        no_resume: app.no_resume,
        target_id: resolve_target(app.target_id.as_deref(), ctx.targets, ctx.targets.iter().find(|t| !t.archived).map(|t| t.id.as_str())),
        target_fit: app.target_fit.clone(),
        fit_dismissed_for: app.fit_dismissed_for.clone(),
    })
}

fn ts_question_kind(kind: &str) -> String {
    match kind {
        "tell_me_about_yourself" => "about_you",
        "future_looking" => "future",
        other => other,
    }
    .to_string()
}

fn pasted_on(storage: &Storage, id: &str) -> String {
    let Ok(path) = storage.application_path(id, "jd.txt") else { return String::new() };
    std::fs::metadata(path).and_then(|m| m.modified()).map(|t| chrono::DateTime::<chrono::Local>::from(t).format("%Y-%m-%d").to_string()).unwrap_or_default()
}

pub fn build_extras(storage: &Storage, app: &AppRecord, ctx: &Ctx) -> StorageResult<ExtrasView> {
    let posting = storage.application_text(&app.id, "jd.txt")?.unwrap_or_default();
    let mut practiced: BTreeMap<String, u32> = BTreeMap::new();
    for s in ctx.sessions.iter().filter(|s| s.application_id.as_deref() == Some(app.id.as_str())) {
        let stage = match s.stage_id.as_deref() {
            Some(id) => app.process.iter().find(|p| p.id == id),
            None => app.process.iter().find(|p| p.stage == s.stage),
        };
        if let Some(p) = stage {
            *practiced.entry(p.id.clone()).or_default() += storage.rep_count(&s.id) as u32;
        }
    }
    let questions = storage
        .load_application_part::<QuestionsFile>(&app.id, "questions.json")?
        .map(|f| f.questions)
        .unwrap_or_default()
        .into_iter()
        .map(|q| PrepQuestionView {
            id: q.id,
            stage_id: q.stage_id,
            kind: ts_question_kind(&q.kind),
            text: q.text,
            best_story_id: q.best_story_id,
            why: q.why,
            edited_by_user: q.edited_by_user,
            source: q.source,
            behavioral_situation: q.behavioral_situation,
            commitment_check: q.commitment_check,
            builder_operator_check: q.builder_operator_check,
        })
        .collect();
    let lock_stage = app.night_before(ctx.now).map(|n| n.stage_id).or_else(|| current_stage(app, ctx.now));
    let night_before = match lock_stage {
        Some(id) => night_before_view(storage, &app.id, &id)?,
        None => None,
    };
    let mut locked_by_stage = BTreeMap::new();
    if let Some(file) = storage.load_application_part::<crate::storage::application_files::LockedFile>(&app.id, "locked.json")? {
        for stage_id in file.by_stage.keys().filter(|k| app.process.iter().any(|p| &p.id == *k)) {
            if let Some(v) = night_before_view(storage, &app.id, stage_id)? {
                locked_by_stage.insert(stage_id.clone(), v);
            }
        }
    }
    Ok(ExtrasView {
        posting_pasted_on: if posting.is_empty() { String::new() } else { pasted_on(storage, &app.id) },
        posting_text: posting,
        was_values: app.was_values.clone(),
        practiced_by_stage: practiced,
        night_before,
        locked_by_stage,
        questions,
    })
}

pub struct AllApplications {
    pub applications: Vec<ApplicationView>,
    pub extras: BTreeMap<String, ExtrasView>,
    /// A plain-words line for each application that could not be read.
    pub problems: Vec<String>,
}

/// Every application in list order, with its extras.
pub fn load_all(storage: &Storage, now: NaiveDateTime) -> StorageResult<AllApplications> {
    let loaded = storage.load_applications(now)?;
    let stories = storage.load_stories()?.items;
    let sessions = storage.sessions()?.items;
    let targets = storage.targets()?;
    let ctx = Ctx { now, stories: &stories, sessions: &sessions, targets: &targets };
    let mut out = AllApplications { applications: vec![], extras: BTreeMap::new(), problems: loaded.problems };
    let mut seen: HashSet<String> = HashSet::new();
    for rec in &loaded.items {
        if !seen.insert(rec.id.clone()) {
            continue;
        }
        match (build(storage, rec, &ctx), build_extras(storage, rec, &ctx)) {
            (Ok(v), Ok(e)) => {
                out.extras.insert(rec.id.clone(), e);
                out.applications.push(v);
            }
            (Err(e), _) | (_, Err(e)) => out.problems.push(format!("{} ({}): {e}", rec.company, rec.id)),
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::application_files::{AnalysisFile, BankCheck, ClaimRec, ClaimsFile, DerivedAnalysis, Belief, MustSay, QuestionRec, QuestionsFile, RepRef, ResumeRec, StorySuggestion};
    use crate::storage::applications::{AppPatch, NewApplication};
    use crate::storage::model::{ProofPoint, Usage};
    use chrono::NaiveDate;
    use serde_json::{json, Value};

    fn now() -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 10, 21).unwrap().and_hms_opt(20, 0, 0).unwrap()
    }

    fn story(id: &str, title: &str, verified: bool) -> Story {
        Story {
            id: id.into(),
            title: title.into(),
            employer: "Fernhill".into(),
            best_for: vec![],
            direct_answer: "".into(),
            context: "".into(),
            approach: "".into(),
            action: "".into(),
            ownership: "".into(),
            result: "".into(),
            proof_points: vec![ProofPoint { label: "activation_7d".into(), metric: "7-day activation".into(), before: "31".into(), after: "44".into(), unit: "%".into(), approximate: false, verified }],
            scale: "".into(),
            competencies: vec![],
            great_eight: vec![],
            branches: vec![],
            verified,
            headline: "7-day activation 31% → 44%".into(),
            usage: Usage::default(),
            year: None,
            angles: vec![],
        }
    }

    fn setup() -> (tempfile::TempDir, Storage, AppRecord) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::init(dir.path().join("data")).unwrap();
        s.save_story(&story("st_onboarding", "Onboarding drop-off", true)).unwrap();
        let app = s.create_application(NewApplication { company: "Kestrel Pay".into(), role: "Senior Lifecycle Marketing Manager".into(), source: "Company site".into(), startup: true, ..Default::default() }, NaiveDate::from_ymd_opt(2026, 10, 15).unwrap()).unwrap();
        (dir, s, app)
    }

    fn one(s: &Storage, id: &str) -> ApplicationView {
        let rec = s.application(id).unwrap();
        let stories = s.load_stories().unwrap().items;
        let sessions = s.sessions().unwrap().items;
        build(s, &rec, &Ctx { now: now(), stories: &stories, sessions: &sessions, targets: &[] }).unwrap()
    }

    fn extras(s: &Storage, id: &str) -> ExtrasView {
        let rec = s.application(id).unwrap();
        let stories = s.load_stories().unwrap().items;
        let sessions = s.sessions().unwrap().items;
        build_extras(s, &rec, &Ctx { now: now(), stories: &stories, sessions: &sessions, targets: &[] }).unwrap()
    }

    fn json_of<T: serde::Serialize>(v: &T) -> Value {
        serde_json::to_value(v).unwrap()
    }

    fn keys(v: &Value) -> Vec<String> {
        let mut k: Vec<String> = v.as_object().unwrap().keys().cloned().collect();
        k.sort();
        k
    }

    fn claim(id: &str, kind: &str, subject: &str, value: &str, stage: &str, stage_ref: &str) -> ClaimRec {
        ClaimRec { id: id.into(), kind: kind.into(), subject: subject.into(), value: value.into(), quote: value.into(), stage: stage.into(), stage_ref: stage_ref.into(), rep: if stage == "resume" { None } else { Some(RepRef { session_id: "ses_1".into(), n: 1 }) }, updated: "2026-10-20T10:00:00Z".into(), superseded_by: None, edited_by_user: vec![], source: if stage == "resume" { "resume".into() } else { "answer".into() }, conflict: None }
    }

    fn put_claims(s: &Storage, id: &str, claims: Vec<ClaimRec>) {
        let next_n = claims.len() as u32;
        s.save_application_part(id, "claims.json", &ClaimsFile { claims, next_n }).unwrap();
    }

    // ---------- the shape the screens read ----------

    #[test]
    fn a_new_application_has_exactly_the_fields_of_the_applications_type_in_the_frontend() {
        let (_d, s, app) = setup();
        let v = json_of(&one(&s, &app.id));
        let expected = ["analysis", "answersPracticed", "applied_on", "claims", "closed_reason", "company", "contacts", "current_stage_id", "edited_by_user", "id", "notes", "process", "resume", "role", "source", "startup", "status"];
        let got = keys(&v);
        for k in expected {
            assert!(got.iter().any(|g| g == k), "{k} is missing from {got:?}");
        }
        assert_eq!((v["status"].as_str(), v["closed_reason"].clone(), v["resume"].clone(), v["analysis"].clone()), (Some("applied"), Value::Null, Value::Null, Value::Null), "null, not missing: the type says `| null`");
        assert_eq!(v["answersPracticed"], 0);
        assert_eq!(v["applied_on"], "2026-10-15");
        assert_eq!(v["claims"], json!([]));
        let p = &v["process"][0];
        for k in ["id", "stage", "label", "order", "done", "decides", "sessions"] {
            assert!(p.get(k).is_some(), "process stage {k}: {p}");
        }
        assert!(p.get("at").is_none() && p.get("previous_at").is_none() && p.get("note").is_none(), "optional means left out, never null");
        assert_eq!((p["id"].as_str(), p["stage"].as_str(), p["label"].as_str(), p["order"].as_u64()), (Some("stg_1"), Some("recruiter"), Some("Recruiter"), Some(1)));
        assert!(p["decides"].as_str().unwrap().starts_with("Fit and logistics"));
        assert_eq!(v["process"][3]["order"], 4);
        let rest = keys(&v);
        for extra in ["suggested_status", "night_before", "no_resume"] {
            assert!(rest.iter().any(|k| k == extra), "{extra}");
        }
    }

    #[test]
    fn the_waiting_note_the_suggested_status_and_the_night_before_ride_along() {
        let (_d, s, app) = setup();
        let v = one(&s, &app.id);
        assert_eq!(v.waiting.as_deref(), Some("6 days since you applied"));
        assert_eq!((v.suggested_status, v.night_before.is_none()), (None, true));
        s.set_stage_time(&app.id, "stg_2", Some("2026-10-23T14:00")).unwrap();
        let v = one(&s, &app.id);
        assert!(v.waiting.is_none());
        assert_eq!(v.suggested_status, Some(Status::Interviewing));
        assert_eq!(v.current_stage_id.as_deref(), Some("stg_2"));
        let p = json_of(&v)["process"][1].clone();
        let nb = v.night_before.unwrap();
        assert_eq!((nb.date.as_str(), nb.stage_id.as_str()), ("2026-10-22", "stg_2"));
        assert_eq!(p["at"], "2026-10-23T14:00");
        s.set_stage_time(&app.id, "stg_2", Some("2026-10-24T14:00")).unwrap();
        let p = json_of(&one(&s, &app.id))["process"][1].clone();
        assert_eq!(p["previous_at"], json!(["2026-10-23T14:00"]));
    }

    #[test]
    fn a_closed_application_has_no_current_stage_and_keeps_its_reason() {
        let (_d, s, app) = setup();
        s.set_stage_time(&app.id, "stg_1", Some("2026-10-25T10:00")).unwrap();
        s.update_application(&app.id, AppPatch { status: Some(Status::Closed), closed_reason: Some(crate::storage::applications::ClosedReason::NoResponse), ..Default::default() }).unwrap();
        let v = one(&s, &app.id);
        assert_eq!(v.current_stage_id, None);
        assert_eq!(json_of(&v)["closed_reason"], "no_response");
        assert!(v.waiting.is_none());
    }

    #[test]
    fn answers_practiced_counts_reps_and_each_stage_counts_its_own_sessions() {
        let (_d, s, app) = setup();
        let mk = |id: &str, stage: &str, stage_id: Option<&str>, reps: u32, app_id: Option<&str>| {
            s.save_session(&Session { id: id.into(), mode: "drill".into(), stage: stage.into(), application_id: app_id.map(String::from), stage_id: stage_id.map(String::from), started: "2026-10-20T10:00:00Z".into(), target_id: None }).unwrap();
            for n in 1..=reps {
                std::fs::create_dir_all(s.root().join(format!("sessions/{id}/reps/{n}"))).unwrap();
            }
        };
        mk("ses_a", "recruiter", Some("stg_1"), 2, Some(&app.id));
        mk("ses_b", "hiring_manager", Some("stg_2"), 3, Some(&app.id));
        mk("ses_c", "hiring_manager", None, 1, Some(&app.id));
        mk("ses_gone", "panel", Some("stg_77"), 4, Some(&app.id));
        mk("ses_other", "recruiter", Some("stg_1"), 5, None);
        let v = one(&s, &app.id);
        assert_eq!(v.answers_practiced, 2 + 3 + 1 + 4, "every rep of this application, even on a stage that was removed");
        let per: Vec<u32> = v.process.iter().map(|p| p.sessions).collect();
        assert_eq!(per, vec![1, 2, 0, 0], "a session with no stage id counts for the first stage of its type");
        let e = extras(&s, &app.id);
        assert_eq!(e.practiced_by_stage.get("stg_2"), Some(&4), "answers practiced per stage");
        assert_eq!(e.practiced_by_stage.get("stg_1"), Some(&2));
    }

    // ---------- claims ----------

    #[test]
    fn claims_say_whether_they_were_said_once_agree_changed_or_conflict_and_where() {
        let (_d, s, app) = setup();
        let mut conflicted = claim("cl_4", "availability", "notice period", "two weeks", "stg_2", "hiring_manager");
        conflicted.conflict = Some(crate::storage::application_files::ClaimConflict { earlier_claim_id: "cl_3".into(), earlier_value: "four weeks".into(), earlier_stage: "recruiter".into() });
        let mut old = claim("cl_5", "compensation", "pay", "125k", "stg_1", "recruiter");
        old.superseded_by = Some("cl_6".into());
        let mut newer = claim("cl_6", "compensation", "pay", "130k", "stg_1", "recruiter");
        newer.source = "updated".into();
        put_claims(&s, &app.id, vec![
            claim("cl_1", "reason_for_leaving", "why leaving", "own lifecycle", "stg_1", "recruiter"),
            claim("cl_2", "reason_for_leaving", "Why leaving", "broader ownership", "stg_2", "hiring_manager"),
            claim("cl_3", "availability", "Notice period", "four weeks", "stg_1", "recruiter"),
            conflicted,
            old,
            newer,
            claim("cl_7", "why_this_company", "why us", "one owner", "stg_1", "recruiter"),
            claim("cl_8", "proof_number", "churn", "24% to 18%", "stg_9", "panel"),
            claim("cl_9", "role_title", "title", "Senior Lifecycle Manager", "resume", "resume"),
        ]);
        let v = json_of(&one(&s, &app.id));
        let said = v["claims"].as_array().unwrap();
        assert_eq!(said.len(), 8, "the resume's claims are on the resume, the rest are here");
        let by = |id: &str| said.iter().find(|c| c["id"] == id).unwrap().clone();
        assert_eq!(by("cl_1")["status"], "consistent", "the same reason said twice, no conflict");
        assert_eq!(by("cl_2")["subject"], by("cl_1")["subject"], "'why leaving' and 'Why leaving' are one thing");
        assert_eq!(by("cl_1")["subject"], "Why you're leaving");
        assert_eq!((by("cl_4")["status"].as_str(), by("cl_3")["status"].as_str()), (Some("differs"), Some("differs")), "both sides of a conflict are marked");
        assert!(by("cl_4")["note"].as_str().unwrap().contains("recruiter stage you said \"four weeks\""), "{}", by("cl_4"));
        assert_eq!(by("cl_6")["status"], "updated");
        assert_eq!(by("cl_6")["note"], "Marked as the current answer");
        assert_eq!(by("cl_5")["status"], "consistent", "a replaced line is shown, struck by the screen");
        assert_eq!(by("cl_7")["status"], "said_once");
        assert_eq!(by("cl_7")["subject"], "Why Kestrel Pay");
        assert_eq!((by("cl_1")["stage_label"].as_str(), by("cl_2")["stage_label"].as_str()), (Some("Recruiter"), Some("Hiring manager")));
        assert_eq!(by("cl_8")["stage_label"], "Panel", "a removed stage keeps its old name");
        assert_eq!(by("cl_1")["type"], "reason_leaving");
        assert_eq!(by("cl_3")["type"], "notice");
        assert_eq!(by("cl_5")["type"], "pay_range");
        assert_eq!(by("cl_7")["type"], "why_company");
        assert_eq!(by("cl_8")["type"], "result");
        for k in ["id", "type", "subject", "value", "quote", "stage", "stage_label", "status"] {
            assert!(by("cl_1").get(k).is_some(), "{k}");
        }
        assert_eq!(by("cl_1")["stage"], "stg_1");
    }

    // ---------- the resume ----------

    fn put_resume(s: &Storage, id: &str, checks: Vec<BankCheck>, must_say: Vec<MustSay>, mocks: u32) {
        let rec = ResumeRec {
            file_name: "Dana Ortiz, Resume, Kestrel.pdf".into(),
            kind: "pdf".into(),
            file: Some("resume.pdf".into()),
            file_hash: "abc".into(),
            pages: 2,
            attached_on: "2026-10-07T09:00:00Z".into(),
            status: "read".into(),
            text_source: "file".into(),
            read_on: Some("2026-10-08T09:30:00Z".into()),
            engine: Some("ai".into()),
            prompt: Some("read-resume v1".into()),
            must_say_state: "ready".into(),
            bank_check: checks,
            must_say,
            mocks_checked: mocks,
            story_suggestions: vec![StorySuggestion { bullet: "Win-back series brought back 18% of lapsed customers".into(), employer: "Brightwave".into(), title: "Win-back series".into(), headline_result: "18% of lapsed customers back".into() }],
        };
        s.save_application_part(id, "resume/resume.json", &rec).unwrap();
    }

    #[test]
    fn the_resume_has_its_file_title_dates_claims_with_bank_status_the_must_say_list_and_suggestions() {
        let (_d, s, app) = setup();
        put_claims(&s, &app.id, vec![
            claim("cl_1", "role_title", "Title at Fernhill", "Senior Lifecycle Manager, Fernhill", "resume", "resume"),
            claim("cl_2", "tenure", "Dates at Fernhill", "2022 to present", "resume", "resume"),
            claim("cl_3", "proof_number", "7-day activation", "31% to 44%", "resume", "resume"),
            claim("cl_4", "proof_number", "Bank-linking steps", "5 steps to 1", "resume", "resume"),
            claim("cl_5", "proof_number", "Subscribers", "1.2M", "resume", "resume"),
        ]);
        let checks = vec![
            BankCheck { claim_id: "cl_3".into(), result: "matches".into(), story_id: Some("st_onboarding".into()), note: "Matches.".into() },
            BankCheck { claim_id: "cl_4".into(), result: "differs".into(), story_id: Some("st_onboarding".into()), note: "Resume says 5 steps to 1; your story says 3 steps to 1.".into() },
        ];
        let ms = vec![
            MustSay { id: "ms-1".into(), qualification: "You ran lifecycle with no ops team".into(), resume_quote: "Sole lifecycle owner at Fernhill".into(), why: "x".into(), story_id: None, said_in: 2 },
            MustSay { id: "ms-2".into(), qualification: "Weekly reporting".into(), resume_quote: "Weekly retention readout".into(), why: "x".into(), story_id: None, said_in: 0 },
        ];
        put_resume(&s, &app.id, checks, ms, 3);
        let v = json_of(&one(&s, &app.id));
        let r = &v["resume"];
        for k in ["fileName", "title", "pages", "sentOn", "readOn", "claims", "mustSay", "suggestions"] {
            assert!(r.get(k).is_some(), "{k} in {r}");
        }
        assert_eq!((r["fileName"].as_str(), r["pages"].as_u64(), r["sentOn"].as_str(), r["readOn"].as_str()), (Some("Dana Ortiz, Resume, Kestrel.pdf"), Some(2), Some("2026-10-15"), Some("2026-10-08")));
        assert_eq!(r["title"], "Senior Lifecycle Manager, Fernhill · 2022 to present");
        let claims = r["claims"].as_array().unwrap();
        assert_eq!(claims.len(), 5);
        let st = |i: usize| (claims[i]["status"].as_str().unwrap(), claims[i]["stage"].as_str().unwrap(), claims[i]["stage_label"].as_str().unwrap());
        assert_eq!(st(0), ("consistent", "resume", "Your resume"), "nothing in the bank to compare a title with");
        assert_eq!(st(2).0, "matches");
        assert_eq!(st(3).0, "differs", "5 steps on the resume, 3 in a checked story");
        assert!(claims[3]["note"].as_str().unwrap().contains("3 steps to 1"));
        assert_eq!(st(4).0, "not_in_bank");
        assert_eq!(v["claims"], json!([]), "resume claims are not in what you've said");
        assert_eq!(r["mustSay"][0], json!({"id": "ms-1", "text": "You ran lifecycle with no ops team", "resume": "Resume: \"Sole lifecycle owner at Fernhill\"", "said": "Said in 2 of 3"}));
        assert_eq!(r["mustSay"][1]["said"], "Not said yet");
        assert_eq!(r["suggestions"][0]["text"], "Win-back series at Brightwave, 18% of lapsed customers back");
        assert_eq!(r["suggestions"][0]["gap"], "Strategy missing");
        assert_eq!(r["suggestions"][0]["bullet"], "Win-back series brought back 18% of lapsed customers");
        // Unticking the story's numbers takes the mismatch off straight away.
        s.save_story(&story("st_onboarding", "Onboarding drop-off", false)).unwrap();
        let v = json_of(&one(&s, &app.id));
        assert_eq!(v["resume"]["claims"][3]["status"], "not_in_bank");
    }

    #[test]
    fn a_resume_waiting_for_its_text_and_an_application_that_did_not_send_one_are_told_apart() {
        let (d, s, app) = setup();
        assert!(json_of(&one(&s, &app.id))["resume"].is_null());
        assert_eq!(json_of(&one(&s, &app.id))["no_resume"], false);
        let rec = ResumeRec { file_name: "scan.pdf".into(), kind: "pdf".into(), file: Some("resume.pdf".into()), file_hash: "x".into(), pages: 1, attached_on: "2026-10-07T09:00:00Z".into(), status: "no_text".into(), text_source: "file".into(), read_on: None, engine: None, prompt: None, must_say_state: String::new(), bank_check: vec![], must_say: vec![], mocks_checked: 0, story_suggestions: vec![] };
        s.save_application_part(&app.id, "resume/resume.json", &rec).unwrap();
        let v = json_of(&one(&s, &app.id));
        assert_eq!((v["resume"]["status"].as_str(), v["resume"]["needs_paste"].as_bool(), v["resume"]["readOn"].as_str()), (Some("no_text"), Some(true), Some("")));
        let _ = d;
    }

    // ---------- the reading of the posting ----------

    #[test]
    fn the_overview_shows_the_covering_story_as_it_is_now_not_as_it_was_when_the_posting_was_read() {
        let (_d, s, app) = setup();
        let derived = DerivedAnalysis {
            summary: "A startup needs one owner.".into(),
            priorities: vec![crate::storage::application_files::Priority { title: "Keep customers".into(), detail: "d".into() }],
            beliefs: vec![
                Belief { text: "You move activation.".into(), story_id: Some("st_onboarding".into()), story: "Old title · old headline".into(), covered: true, why: None },
                Belief { text: "You run it alone.".into(), story_id: Some("st_deleted".into()), story: "Gone · x".into(), covered: true, why: None },
                Belief { text: "You report weekly.".into(), story_id: None, story: String::new(), covered: false, why: Some("A story about reporting would fill this.".into()) },
            ],
            gaps: vec!["SQL".into()],
            echo: vec!["\"no ops team behind you\"".into()],
            ..Default::default()
        };
        s.save_application_part(&app.id, "analysis.json", &AnalysisFile { prompt: "analyse-jd v1".into(), engine: "ai".into(), read_on: "x".into(), raw: None, derived, edited_by_user: vec![] }).unwrap();
        let a = json_of(&one(&s, &app.id))["analysis"].clone();
        for k in ["summary", "priorities", "beliefs", "gaps", "echo"] {
            assert!(a.get(k).is_some(), "{k}");
        }
        assert_eq!(a["beliefs"][0], json!({"text": "You move activation.", "storyId": "st_onboarding", "story": "Onboarding drop-off · 7-day activation 31% → 44%", "covered": true}));
        assert_eq!((a["beliefs"][1]["covered"].clone(), a["beliefs"][1]["storyId"].clone()), (json!(false), Value::Null), "a deleted story no longer covers it");
        assert!(a["beliefs"][1]["why"].as_str().unwrap().contains("deleted"));
        assert_eq!(a["beliefs"][2]["why"], "A story about reporting would fill this.");
        assert_eq!(a["priorities"][0], json!({"title": "Keep customers", "detail": "d"}));
    }

    // ---------- the extras ----------

    #[test]
    fn the_extras_carry_the_posting_the_questions_the_edit_history_and_the_night_before() {
        let (_d, s, app) = setup();
        s.save_application_text(&app.id, "jd.txt", "About the role: own lifecycle.").unwrap();
        s.update_application(&app.id, AppPatch { role: Some("Sr Lifecycle Mgr".into()), ..Default::default() }).unwrap();
        s.set_stage_time(&app.id, "stg_2", Some("2026-10-23T14:00")).unwrap();
        let q = |id: &str, stage: &str, kind: &str, text: &str, edited: bool| QuestionRec { id: id.into(), stage_id: stage.into(), stage: "hiring_manager".into(), text: text.into(), kind: kind.into(), behavioral_situation: None, commitment_check: false, builder_operator_check: false, best_story_id: Some("st_onboarding".into()), why: "tests a belief".into(), requirement: None, source: "jd".into(), edited_by_user: edited };
        s.save_application_part(&app.id, "questions.json", &QuestionsFile { prompt: "analyse-jd v1".into(), engine: "ai".into(), questions: vec![q("q_1", "stg_1", "tell_me_about_yourself", "Give me the short version.", false), q("q_2", "stg_2", "future_looking", "First 60 days?", true), q("q_3", "stg_2", "behavioral", "Tell me about a time.", false)], next_n: 3, deleted: vec![] }).unwrap();
        crate::applications::cue::save_locked(&s, &app.id, "stg_2", crate::applications::cue::LockInput { opener: "Lifecycle marketer.".into(), opener_prompt: None, power_story: "st_onboarding".into(), questions: vec!["One?".into()] }).unwrap();
        let v = json_of(&extras(&s, &app.id));
        for k in ["postingText", "postingPastedOn", "wasValues", "practicedByStage", "nightBefore", "questions"] {
            assert!(v.get(k).is_some(), "{k} in {v}");
        }
        assert_eq!(v["postingText"], "About the role: own lifecycle.");
        assert_eq!(v["postingPastedOn"].as_str().unwrap().len(), 10, "a date");
        assert_eq!(v["wasValues"]["role"], "Senior Lifecycle Marketing Manager");
        assert_eq!(v["nightBefore"]["stageId"], "stg_2");
        assert_eq!(v["lockedByStage"]["stg_2"]["powerStoryId"], "st_onboarding");
        assert!(v["lockedByStage"].get("stg_3").is_none());
        assert_eq!(v["questions"][0], json!({"id": "q_1", "stageId": "stg_1", "type": "about_you", "text": "Give me the short version.", "bestStoryId": "st_onboarding", "why": "tests a belief", "editedByUser": false, "source": "jd", "behavioralSituation": null, "commitmentCheck": false, "builderOperatorCheck": false}));
        assert_eq!(v["questions"][1]["type"], "future");
        assert_eq!(v["questions"][1]["editedByUser"], true);
        assert_eq!(v["questions"][2]["type"], "behavioral");
    }

    #[test]
    fn without_a_posting_a_resume_or_a_lock_the_extras_are_empty_not_missing() {
        let (_d, s, app) = setup();
        let v = json_of(&extras(&s, &app.id));
        assert_eq!((v["postingText"].as_str(), v["postingPastedOn"].as_str(), v["questions"].clone()), (Some(""), Some(""), json!([])));
        assert!(v.get("nightBefore").is_none(), "no lock yet: the screen says nothing to lock");
        assert_eq!(v["lockedByStage"], json!({}));
    }

    // ---------- everything ----------

    #[test]
    fn everything_loads_in_list_order_and_a_damaged_application_is_reported() {
        let (_d, s, a) = setup();
        let b = s.create_application(NewApplication { company: "Northpine".into(), ..Default::default() }, NaiveDate::from_ymd_opt(2026, 10, 18).unwrap()).unwrap();
        s.set_stage_time(&b.id, "stg_1", Some("2026-10-22T10:00")).unwrap();
        std::fs::create_dir_all(s.root().join("applications/app_bad")).unwrap();
        std::fs::write(s.root().join("applications/app_bad/application.json"), "nope").unwrap();
        let all = load_all(&s, now()).unwrap();
        assert_eq!(all.applications.iter().map(|x| x.company.as_str()).collect::<Vec<_>>(), vec!["Northpine", "Kestrel Pay"]);
        assert_eq!(all.extras.len(), 2);
        assert!(all.extras.contains_key(&a.id) && all.extras.contains_key(&b.id));
        assert_eq!(all.problems.len(), 1);
    }
}
