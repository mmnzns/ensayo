//! Applications in the data folder: `applications/<id>/application.json` (the core fields, the process and the list of
//! fields the user edited), next to `jd.txt`, `analysis.json`, `questions.json`, `claims.json`, `locked.json` and
//! `resume/`. One small file per record, atomic writes, ids checked with `is_safe_id` (Build Plan, Data model).
//! Interview dates live only on the process stages here.

use super::io::{atomic_write, is_safe_id, new_id, read_text};
use super::migrate;
use super::reps::Session;
use super::targets::TargetFit;
use super::versioned::{load_record, save_record};
use super::{Loaded, Result, Storage, StorageError};
use chrono::{Duration, NaiveDate, NaiveDateTime, NaiveTime, SecondsFormat, Utc};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

/// The stage types the prompts and the practice screens know.
pub const STAGE_TYPES: [&str; 5] = ["recruiter", "hiring_manager", "technical", "panel", "leadership"];
/// What a new application starts with (Build Plan, Applications and process).
pub const DEFAULT_PROCESS: [&str; 4] = ["recruiter", "hiring_manager", "panel", "leadership"];

/// "Recruiter", "Hiring manager": the standard name of a stage type.
pub fn stage_label(stage: &str) -> &'static str {
    match stage {
        "recruiter" => "Recruiter",
        "hiring_manager" => "Hiring manager",
        "technical" => "Technical",
        "panel" => "Panel",
        "leadership" => "Leadership",
        _ => "Stage",
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Applied,
    Screening,
    Interviewing,
    Offer,
    Closed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClosedReason {
    NoResponse,
    Rejected,
    Withdrew,
    Accepted,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Contact {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub email_or_phone: String,
    #[serde(default)]
    pub notes: String,
}

/// One stage of the process. The order of the list is the order of the process.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StageRec {
    /// `stg_1`, `stg_2`...: never reused inside an application, so sessions and claims keep pointing at the right one.
    pub id: String,
    /// One of `STAGE_TYPES`.
    pub stage: String,
    pub label: String,
    /// Local date-time "2026-10-23T14:00" or a date "2026-10-23" when the time is not known. The only place an
    /// interview date is kept.
    #[serde(default)]
    pub at: Option<String>,
    #[serde(default)]
    pub done: bool,
    /// Dates this stage had before it was moved, oldest first.
    #[serde(default)]
    pub previous_at: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AppRecord {
    pub id: String,
    pub company: String,
    #[serde(default)]
    pub role: String,
    pub status: Status,
    #[serde(default)]
    pub closed_reason: Option<ClosedReason>,
    /// "2026-10-06".
    #[serde(default)]
    pub applied_on: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub contacts: Vec<Contact>,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub startup: bool,
    pub process: Vec<StageRec>,
    /// Field paths the user changed (`role`, `process.stg_2.at`, `analysis.summary`): reading the posting or the
    /// resume again never overwrites one of these.
    #[serde(default)]
    pub edited_by_user: Vec<String>,
    /// What a field was before the user's first edit, for the "Edited by you" note.
    #[serde(default)]
    pub was_values: BTreeMap<String, String>,
    /// "I didn't send one".
    #[serde(default)]
    pub no_resume: bool,
    #[serde(default)]
    pub next_stage_n: u32,
    #[serde(default)]
    pub created: String,
    /// The target this application is filed under. Missing (an application from before targets) means the first
    /// target that is not archived, decided when it is read, so old files need no rewrite.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_id: Option<String>,
    /// How the posting read against the targets when it was last read.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_fit: Option<TargetFit>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct NewStage {
    pub stage: String,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub at: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct NewApplication {
    pub company: String,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub status: Option<Status>,
    #[serde(default)]
    pub closed_reason: Option<ClosedReason>,
    #[serde(default)]
    pub applied_on: Option<String>,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub contacts: Vec<Contact>,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub startup: bool,
    /// None starts with the default four stages.
    #[serde(default)]
    pub stages: Option<Vec<NewStage>>,
    /// None files it under the active target.
    #[serde(default, alias = "targetId")]
    pub target_id: Option<String>,
}

/// The fields of an application the user can change. A field that is sent and differs is saved and listed as edited.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct AppPatch {
    pub company: Option<String>,
    pub role: Option<String>,
    pub status: Option<Status>,
    pub closed_reason: Option<ClosedReason>,
    pub applied_on: Option<String>,
    pub source: Option<String>,
    pub contacts: Option<Vec<Contact>>,
    pub notes: Option<String>,
    pub startup: Option<bool>,
    /// Files the application under another target.
    #[serde(alias = "targetId")]
    pub target_id: Option<String>,
    /// With a new `target_id`: make the prepared questions again for the new target (the ones the user edited stay).
    /// Done by the command, which has the engine; the storage only files the application.
    #[serde(default, alias = "rebuildQuestions")]
    pub rebuild_questions: bool,
}

/// One row of the stage list as the Edit details screen saves it.
#[derive(Debug, Clone, Deserialize)]
pub struct StageInput {
    /// None, or an id the process does not have, makes a new stage.
    #[serde(default)]
    pub id: Option<String>,
    pub stage: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub at: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum RemoveStage {
    /// The stage has sessions: ask, then call again with `confirm`.
    NeedsConfirm { sessions: usize },
    Removed { application: AppRecord, sessions_kept: usize },
}

#[derive(Debug, Clone, PartialEq)]
pub enum SaveProcess {
    NeedsConfirm { sessions: usize, stage_ids: Vec<String> },
    Saved(AppRecord),
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DeleteOutcome {
    /// Sessions that stay as practice without an application.
    pub kept_sessions: usize,
    /// (session, rep number) of every rep deleted, so the caller can remove the machine-local audio.
    pub deleted_reps: Vec<(String, u32)>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct NightBefore {
    /// "2026-10-22": the day before the earliest upcoming interview.
    pub date: String,
    pub stage_id: String,
}

// ---------- dates ----------

/// "2026-10-23T14:00" (seconds allowed) or "2026-10-23".
pub fn parse_at(s: &str) -> Option<(NaiveDate, Option<NaiveTime>)> {
    for f in ["%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S"] {
        if let Ok(dt) = NaiveDateTime::parse_from_str(s, f) {
            return Some((dt.date(), Some(dt.time())));
        }
    }
    NaiveDate::parse_from_str(s, "%Y-%m-%d").ok().map(|d| (d, None))
}

/// Still ahead: a later day, or today at a later time (a date with no time is all day).
pub fn is_upcoming(at: &str, now: NaiveDateTime) -> bool {
    match parse_at(at) {
        Some((d, t)) => d > now.date() || (d == now.date() && t.is_none_or(|t| t >= now.time())),
        None => false,
    }
}

fn sort_key(at: &str) -> Option<NaiveDateTime> {
    parse_at(at).map(|(d, t)| d.and_time(t.unwrap_or_default()))
}

fn clean_at(at: Option<&str>) -> Result<Option<String>> {
    match at.map(str::trim) {
        None | Some("") => Ok(None),
        Some(s) if parse_at(s).is_some() => Ok(Some(s.to_string())),
        Some(s) => Err(StorageError::Invalid(format!("\"{s}\" is not a date. Use a day like 2026-10-23, with a time like 2026-10-23T14:00 if you know it."))),
    }
}

fn check_stage_type(stage: &str) -> Result<()> {
    if STAGE_TYPES.contains(&stage) {
        Ok(())
    } else {
        Err(StorageError::Invalid(format!("\"{stage}\" is not a kind of stage. Pick recruiter, hiring manager, technical, panel or leadership.")))
    }
}

fn status_word(s: Status) -> &'static str {
    match s {
        Status::Applied => "applied",
        Status::Screening => "screening",
        Status::Interviewing => "interviewing",
        Status::Offer => "offer",
        Status::Closed => "closed",
    }
}

fn reason_word(r: ClosedReason) -> &'static str {
    match r {
        ClosedReason::NoResponse => "no_response",
        ClosedReason::Rejected => "rejected",
        ClosedReason::Withdrew => "withdrew",
        ClosedReason::Accepted => "accepted",
    }
}

const NEEDS_REASON: &str = "Closed needs a reason: no response, they said no, you withdrew, or you accepted.";

impl AppRecord {
    pub fn stage_index(&self, stage_id: &str) -> Result<usize> {
        self.process.iter().position(|p| p.id == stage_id).ok_or_else(|| StorageError::NotFound(format!("stage {stage_id}")))
    }

    /// Records that the user changed a field. `was` is kept the first time only.
    pub fn mark_edited(&mut self, path: &str, was: Option<String>) {
        if !self.edited_by_user.iter().any(|p| p == path) {
            self.edited_by_user.push(path.to_string());
        }
        if let Some(w) = was {
            self.was_values.entry(path.to_string()).or_insert(w);
        }
    }

    pub fn is_edited(&self, path: &str) -> bool {
        self.edited_by_user.iter().any(|p| p == path)
    }

    fn new_stage_id(&mut self) -> String {
        let highest = self.process.iter().filter_map(|p| p.id.strip_prefix("stg_").and_then(|n| n.parse::<u32>().ok())).max().unwrap_or(0);
        self.next_stage_n = self.next_stage_n.max(highest) + 1;
        format!("stg_{}", self.next_stage_n)
    }

    /// The open stages with an interview still ahead, earliest first.
    pub fn upcoming(&self, now: NaiveDateTime) -> Vec<&StageRec> {
        let mut v: Vec<&StageRec> = self.process.iter().filter(|p| !p.done && p.at.as_deref().is_some_and(|a| is_upcoming(a, now))).collect();
        v.sort_by_key(|p| p.at.as_deref().and_then(sort_key));
        v
    }

    /// The earliest interview still ahead.
    pub fn next_interview(&self, now: NaiveDateTime) -> Option<NaiveDateTime> {
        self.upcoming(now).first().and_then(|p| p.at.as_deref().and_then(sort_key))
    }

    /// The day before the earliest upcoming interview. It moves when a stage date changes.
    pub fn night_before(&self, now: NaiveDateTime) -> Option<NightBefore> {
        let stage = *self.upcoming(now).first()?;
        let (date, _) = parse_at(stage.at.as_deref()?)?;
        Some(NightBefore { date: (date - Duration::days(1)).format("%Y-%m-%d").to_string(), stage_id: stage.id.clone() })
    }

    /// A status the tracker might move to. Ensayo only suggests it; the user sets the status.
    pub fn suggested_status(&self) -> Option<Status> {
        let dated = |p: &&StageRec| p.at.is_some();
        match self.status {
            Status::Applied => {
                let first = self.process.iter().filter(dated).min_by_key(|p| p.at.as_deref().and_then(sort_key)).or_else(|| self.process.iter().find(|p| p.done))?;
                Some(if first.stage == "recruiter" { Status::Screening } else { Status::Interviewing })
            }
            Status::Screening => {
                let recruiter_ahead = self.process.iter().any(|p| p.stage == "recruiter" && !p.done && p.at.is_some());
                let moved_on = self.process.iter().any(|p| p.done) || (!recruiter_ahead && self.process.iter().any(|p| p.stage != "recruiter" && p.at.is_some()));
                moved_on.then_some(Status::Interviewing)
            }
            _ => None,
        }
    }

    /// "6 days since you applied" while nothing is booked; none once an interview is dated or the application closed.
    pub fn waiting(&self, now: NaiveDateTime) -> Option<String> {
        if !matches!(self.status, Status::Applied | Status::Screening) || !self.upcoming(now).is_empty() {
            return None;
        }
        let days = (now.date() - NaiveDate::parse_from_str(&self.applied_on, "%Y-%m-%d").ok()?).num_days();
        match days {
            d if d < 0 => None,
            0 => Some("Applied today".into()),
            1 => Some("1 day since you applied".into()),
            d => Some(format!("{d} days since you applied")),
        }
    }

    /// Sessions of this application on one stage. A session saved before stage ids existed has none and counts for the
    /// first stage of its type.
    pub fn sessions_on_stage(&self, stage: &StageRec, sessions: &[Session]) -> usize {
        let first_of_type = self.process.iter().find(|p| p.stage == stage.stage).map(|p| p.id.as_str());
        sessions
            .iter()
            .filter(|s| s.application_id.as_deref() == Some(self.id.as_str()))
            .filter(|s| match s.stage_id.as_deref() {
                Some(id) => id == stage.id,
                None => s.stage == stage.stage && first_of_type == Some(stage.id.as_str()),
            })
            .count()
    }

    /// The stage a rep belongs to: the one it names, else the first stage of its type that is not done, else the
    /// first of its type.
    pub fn stage_for(&self, stage_id: Option<&str>, stage_type: &str) -> Option<&StageRec> {
        stage_id
            .and_then(|id| self.process.iter().find(|p| p.id == id))
            .or_else(|| self.process.iter().find(|p| p.stage == stage_type && !p.done))
            .or_else(|| self.process.iter().find(|p| p.stage == stage_type))
    }
}

fn checked_id(id: &str) -> Result<&str> {
    if is_safe_id(id) {
        Ok(id)
    } else {
        Err(StorageError::Invalid(format!("\"{id}\" is not a valid id")))
    }
}

/// A file name inside an application's folder: plain names only, one optional `resume/` folder.
fn checked_rel(rel: &str) -> Result<PathBuf> {
    let mut out = PathBuf::new();
    for part in rel.split('/') {
        let ok = !part.is_empty() && !part.starts_with('.') && part.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'));
        if !ok {
            return Err(StorageError::Invalid(format!("\"{rel}\" is not a valid file name")));
        }
        out.push(part);
    }
    Ok(out)
}

/// Now, as the text saved in the files.
pub fn stamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

impl Storage {
    pub fn applications_dir(&self) -> PathBuf {
        self.root().join("applications")
    }

    /// The folder of one application; the id is checked, the folder may not exist.
    pub fn application_dir(&self, id: &str) -> Result<PathBuf> {
        Ok(self.applications_dir().join(checked_id(id)?))
    }

    /// A file inside an application's folder (`jd.txt`, `resume/resume.pdf`).
    pub fn application_path(&self, id: &str, rel: &str) -> Result<PathBuf> {
        Ok(self.application_dir(id)?.join(checked_rel(rel)?))
    }

    fn record_path(&self, id: &str) -> Result<PathBuf> {
        self.application_path(id, "application.json")
    }

    pub fn application(&self, id: &str) -> Result<AppRecord> {
        load_record(&self.record_path(id)?, migrate::application)?.ok_or_else(|| StorageError::NotFound(format!("application {id}")))
    }

    pub fn save_application_record(&self, rec: &AppRecord) -> Result<()> {
        save_record(&self.record_path(&rec.id)?, rec)
    }

    pub fn create_application(&self, new: NewApplication, today: NaiveDate) -> Result<AppRecord> {
        let company = new.company.trim().to_string();
        if company.is_empty() {
            return Err(StorageError::Invalid("Add the company name first.".into()));
        }
        let status = new.status.unwrap_or(Status::Applied);
        if status == Status::Closed && new.closed_reason.is_none() {
            return Err(StorageError::Invalid(NEEDS_REASON.into()));
        }
        let mut rec = AppRecord {
            id: new_id("app"),
            company,
            role: new.role.trim().to_string(),
            status,
            closed_reason: if status == Status::Closed { new.closed_reason } else { None },
            applied_on: new.applied_on.as_deref().map(str::trim).filter(|d| !d.is_empty()).map(String::from).unwrap_or_else(|| today.format("%Y-%m-%d").to_string()),
            source: new.source.trim().to_string(),
            contacts: new.contacts,
            notes: new.notes,
            startup: new.startup,
            process: vec![],
            edited_by_user: vec![],
            was_values: BTreeMap::new(),
            no_resume: false,
            next_stage_n: 0,
            created: stamp(),
            target_id: match new.target_id.as_deref().map(str::trim).filter(|t| !t.is_empty()) {
                Some(id) => Some(self.checked_target(id)?),
                None => self.active_target()?.map(|t| t.id),
            },
            target_fit: None,
        };
        if NaiveDate::parse_from_str(&rec.applied_on, "%Y-%m-%d").is_err() {
            return Err(StorageError::Invalid(format!("\"{}\" is not a date. Use a day like 2026-10-06.", rec.applied_on)));
        }
        let stages = new.stages.unwrap_or_else(|| DEFAULT_PROCESS.iter().map(|s| NewStage { stage: s.to_string(), label: None, at: None }).collect());
        for s in stages {
            check_stage_type(&s.stage)?;
            let at = clean_at(s.at.as_deref())?;
            let id = rec.new_stage_id();
            let label = s.label.as_deref().map(str::trim).filter(|l| !l.is_empty()).unwrap_or_else(|| stage_label(&s.stage)).to_string();
            rec.process.push(StageRec { id, stage: s.stage, label, at, done: false, previous_at: vec![] });
        }
        self.save_application_record(&rec)?;
        Ok(rec)
    }

    /// Every application, active before closed, then by the next interview and the most recent application. Files that
    /// cannot be read are reported and the rest still load.
    pub fn load_applications(&self, now: NaiveDateTime) -> Result<Loaded<AppRecord>> {
        let mut out = Loaded::<AppRecord>::default();
        let Ok(rd) = fs::read_dir(self.applications_dir()) else { return Ok(out) };
        for entry in rd.flatten() {
            if !entry.path().is_dir() {
                continue;
            }
            let file = entry.path().join("application.json");
            match load_record::<AppRecord>(&file, migrate::application) {
                Ok(Some(a)) => out.items.push(a),
                Ok(None) => {}
                Err(e) => out.problems.push(format!("{}: {e}", entry.file_name().to_string_lossy())),
            }
        }
        sort_applications(&mut out.items, now);
        Ok(out)
    }

    /// Loads, changes, and saves one application. Nothing is saved when `f` fails.
    pub fn change<R>(&self, id: &str, f: impl FnOnce(&mut AppRecord) -> Result<R>) -> Result<(AppRecord, R)> {
        let mut rec = self.application(id)?;
        let out = f(&mut rec)?;
        self.save_application_record(&rec)?;
        Ok((rec, out))
    }

    pub fn update_application(&self, id: &str, patch: AppPatch) -> Result<AppRecord> {
        if patch.company.as_deref().is_some_and(|c| c.trim().is_empty()) {
            return Err(StorageError::Invalid("The company name can't be empty.".into()));
        }
        if let Some(d) = patch.applied_on.as_deref().map(str::trim).filter(|d| !d.is_empty()) {
            if NaiveDate::parse_from_str(d, "%Y-%m-%d").is_err() {
                return Err(StorageError::Invalid(format!("\"{d}\" is not a date. Use a day like 2026-10-06.")));
            }
        }
        let new_target = patch.target_id.as_deref().map(str::trim).filter(|t| !t.is_empty()).map(|id| self.checked_target(id)).transpose()?;
        let (rec, ()) = self.change(id, |a| {
            let status = patch.status.unwrap_or(a.status);
            let reason = if status == Status::Closed { patch.closed_reason.or(a.closed_reason) } else { None };
            if status == Status::Closed && reason.is_none() {
                return Err(StorageError::Invalid(NEEDS_REASON.into()));
            }
            fn set(a: &mut AppRecord, path: &str, new: &Option<String>, get: fn(&mut AppRecord) -> &mut String) {
                if let Some(v) = new {
                    let v = v.trim().to_string();
                    if v != *get(a) {
                        let old = std::mem::replace(get(a), v);
                        a.mark_edited(path, Some(old));
                    }
                }
            }
            set(a, "company", &patch.company, |a| &mut a.company);
            set(a, "role", &patch.role, |a| &mut a.role);
            set(a, "applied_on", &patch.applied_on, |a| &mut a.applied_on);
            set(a, "source", &patch.source, |a| &mut a.source);
            if let Some(n) = &patch.notes {
                if *n != a.notes {
                    let old = std::mem::replace(&mut a.notes, n.clone());
                    a.mark_edited("notes", Some(old));
                }
            }
            if status != a.status {
                let old = status_word(a.status).to_string();
                a.status = status;
                a.mark_edited("status", Some(old));
            }
            if reason != a.closed_reason {
                let old = a.closed_reason.map(|r| reason_word(r).to_string());
                a.closed_reason = reason;
                if reason.is_some() {
                    a.mark_edited("closed_reason", old);
                }
            }
            if let Some(c) = &patch.contacts {
                if *c != a.contacts {
                    a.contacts = c.clone();
                    a.mark_edited("contacts", None);
                }
            }
            if let Some(t) = &new_target {
                if a.target_id.as_deref() != Some(t.as_str()) {
                    a.target_id = Some(t.clone());
                }
            }
            if let Some(s) = patch.startup {
                if s != a.startup {
                    let old = a.startup.to_string();
                    a.startup = s;
                    a.mark_edited("startup", Some(old));
                }
            }
            Ok(())
        })?;
        Ok(rec)
    }

    // ---------- the process ----------

    pub fn add_stage(&self, id: &str, stage: &str, label: Option<&str>, at: Option<&str>) -> Result<AppRecord> {
        check_stage_type(stage)?;
        let at = clean_at(at)?;
        let (rec, ()) = self.change(id, |a| {
            let sid = a.new_stage_id();
            let label = label.map(str::trim).filter(|l| !l.is_empty()).unwrap_or_else(|| stage_label(stage)).to_string();
            a.process.push(StageRec { id: sid, stage: stage.to_string(), label, at, done: false, previous_at: vec![] });
            Ok(())
        })?;
        Ok(rec)
    }

    /// Removes a stage. A stage with sessions asks first (`confirm`); the sessions stay as they are, under the stage
    /// name they were practiced with. Its night-before lock and its prepared questions go with it.
    pub fn remove_stage(&self, id: &str, stage_id: &str, confirm: bool) -> Result<RemoveStage> {
        let rec = self.application(id)?;
        let stage = rec.process[rec.stage_index(stage_id)?].clone();
        let sessions = self.sessions_of_application(id)?;
        let count = rec.sessions_on_stage(&stage, &sessions);
        if count > 0 && !confirm {
            return Ok(RemoveStage::NeedsConfirm { sessions: count });
        }
        let (application, ()) = self.change(id, |a| {
            a.process.retain(|p| p.id != stage_id);
            forget_edits(a, stage_id);
            Ok(())
        })?;
        self.forget_stage_files(id, &[stage_id.to_string()])?;
        Ok(RemoveStage::Removed { application, sessions_kept: count })
    }

    pub fn reorder_stages(&self, id: &str, order: &[String]) -> Result<AppRecord> {
        let (rec, ()) = self.change(id, |a| {
            let mut sorted_new: Vec<&String> = order.iter().collect();
            sorted_new.sort();
            let mut sorted_old: Vec<&String> = a.process.iter().map(|p| &p.id).collect();
            sorted_old.sort();
            if sorted_new != sorted_old {
                return Err(StorageError::Invalid("The new order has to list every stage once.".into()));
            }
            let before: Vec<String> = a.process.iter().map(|p| p.id.clone()).collect();
            a.process = order.iter().filter_map(|i| a.process.iter().find(|p| &p.id == i).cloned()).collect();
            if before != *order {
                a.mark_edited("process.order", None);
            }
            Ok(())
        })?;
        Ok(rec)
    }

    pub fn rename_stage(&self, id: &str, stage_id: &str, label: &str) -> Result<AppRecord> {
        let (rec, ()) = self.change(id, |a| {
            let i = a.stage_index(stage_id)?;
            let label = Some(label.trim()).filter(|l| !l.is_empty()).unwrap_or_else(|| stage_label(&a.process[i].stage)).to_string();
            if label != a.process[i].label {
                let old = std::mem::replace(&mut a.process[i].label, label);
                a.mark_edited(&format!("process.{stage_id}.label"), Some(old));
            }
            Ok(())
        })?;
        Ok(rec)
    }

    /// Sets or clears a stage's date. The old date goes to `previous_at`; the field is listed as edited.
    pub fn set_stage_time(&self, id: &str, stage_id: &str, at: Option<&str>) -> Result<AppRecord> {
        let at = clean_at(at)?;
        let (rec, ()) = self.change(id, |a| {
            let i = a.stage_index(stage_id)?;
            apply_time(a, i, at);
            Ok(())
        })?;
        Ok(rec)
    }

    pub fn set_stage_done(&self, id: &str, stage_id: &str, done: bool) -> Result<AppRecord> {
        let (rec, ()) = self.change(id, |a| {
            let i = a.stage_index(stage_id)?;
            a.process[i].done = done;
            Ok(())
        })?;
        Ok(rec)
    }

    /// The whole stage list as the Edit details screen has it: rows in order, new rows without an id, rows left out
    /// removed. Asks first (`NeedsConfirm`) when a removed stage has sessions.
    pub fn save_process(&self, id: &str, inputs: Vec<StageInput>, confirm: bool) -> Result<SaveProcess> {
        for i in &inputs {
            check_stage_type(&i.stage)?;
            clean_at(i.at.as_deref())?;
        }
        let rec = self.application(id)?;
        let keep: Vec<String> = inputs.iter().filter_map(|i| i.id.clone()).filter(|i| rec.process.iter().any(|p| p.id == *i)).collect();
        let removed: Vec<StageRec> = rec.process.iter().filter(|p| !keep.contains(&p.id)).cloned().collect();
        let sessions = self.sessions_of_application(id)?;
        let with_sessions: Vec<(String, usize)> = removed.iter().map(|p| (p.id.clone(), rec.sessions_on_stage(p, &sessions))).filter(|(_, n)| *n > 0).collect();
        if !with_sessions.is_empty() && !confirm {
            return Ok(SaveProcess::NeedsConfirm { sessions: with_sessions.iter().map(|(_, n)| n).sum(), stage_ids: with_sessions.into_iter().map(|(i, _)| i).collect() });
        }
        let (saved, ()) = self.change(id, |a| {
            let old_order: Vec<String> = a.process.iter().filter(|p| keep.contains(&p.id)).map(|p| p.id.clone()).collect();
            let mut next: Vec<StageRec> = Vec::new();
            for input in &inputs {
                let existing = input.id.as_deref().and_then(|i| a.process.iter().position(|p| p.id == i));
                let label = Some(input.label.trim()).filter(|l| !l.is_empty()).unwrap_or_else(|| stage_label(&input.stage)).to_string();
                let at = clean_at(input.at.as_deref())?;
                match existing {
                    Some(i) => {
                        let sid = a.process[i].id.clone();
                        if label != a.process[i].label {
                            let old = std::mem::replace(&mut a.process[i].label, label);
                            a.mark_edited(&format!("process.{sid}.label"), Some(old));
                        }
                        a.process[i].stage = input.stage.clone();
                        apply_time(a, i, at);
                        next.push(a.process[i].clone());
                    }
                    None => {
                        let sid = a.new_stage_id();
                        next.push(StageRec { id: sid, stage: input.stage.clone(), label, at, done: false, previous_at: vec![] });
                    }
                }
            }
            let new_order: Vec<String> = next.iter().filter(|p| old_order.contains(&p.id)).map(|p| p.id.clone()).collect();
            if new_order != old_order {
                a.mark_edited("process.order", None);
            }
            for p in &removed {
                forget_edits(a, &p.id);
            }
            a.process = next;
            Ok(())
        })?;
        self.forget_stage_files(id, &removed.iter().map(|p| p.id.clone()).collect::<Vec<_>>())?;
        Ok(SaveProcess::Saved(saved))
    }

    /// Drops the night-before lock and the prepared questions of stages that no longer exist.
    fn forget_stage_files(&self, id: &str, stage_ids: &[String]) -> Result<()> {
        use super::application_files::{LockedFile, QuestionsFile};
        if stage_ids.is_empty() {
            return Ok(());
        }
        if let Some(mut locked) = self.load_application_part::<LockedFile>(id, "locked.json")? {
            let before = locked.by_stage.len();
            locked.by_stage.retain(|k, _| !stage_ids.contains(k));
            if locked.by_stage.len() != before {
                self.save_application_part(id, "locked.json", &locked)?;
            }
        }
        if let Some(mut q) = self.load_application_part::<QuestionsFile>(id, "questions.json")? {
            let before = q.questions.len();
            q.questions.retain(|x| !stage_ids.contains(&x.stage_id));
            if q.questions.len() != before {
                self.save_application_part(id, "questions.json", &q)?;
            }
        }
        Ok(())
    }

    // ---------- sessions ----------

    /// The sessions practiced for one application, newest first.
    pub fn sessions_of_application(&self, id: &str) -> Result<Vec<Session>> {
        Ok(self.sessions()?.items.into_iter().filter(|s| s.application_id.as_deref() == Some(id)).collect())
    }

    /// Deletes an application. Its sessions stay as "practice without an application" unless `delete_reps` is set,
    /// in which case they go too (the result lists the reps so the caller can remove their audio).
    pub fn delete_application(&self, id: &str, delete_reps: bool) -> Result<DeleteOutcome> {
        let dir = self.application_dir(id)?;
        if !dir.is_dir() {
            return Err(StorageError::NotFound(format!("application {id}")));
        }
        let sessions = self.sessions_of_application(id)?;
        let mut out = DeleteOutcome { kept_sessions: 0, deleted_reps: vec![] };
        for mut s in sessions {
            if delete_reps {
                out.deleted_reps.extend(self.rep_numbers(&s.id).into_iter().map(|n| (s.id.clone(), n)));
                self.delete_session(&s.id)?;
            } else {
                s.application_id = None;
                s.stage_id = None;
                self.save_session(&s)?;
                out.kept_sessions += 1;
            }
        }
        fs::remove_dir_all(&dir).map_err(|e| StorageError::Io(dir, e.to_string()))?;
        Ok(out)
    }

    // ---------- the files next to the record ----------

    /// A text file of an application (`jd.txt`, `resume/resume.txt`), or None when it is not there.
    pub fn application_text(&self, id: &str, rel: &str) -> Result<Option<String>> {
        read_text(&self.application_path(id, rel)?)
    }

    /// Writes a text file of an application. The application has to exist.
    pub fn save_application_text(&self, id: &str, rel: &str, text: &str) -> Result<()> {
        let path = self.application_path(id, rel)?;
        self.application(id)?;
        atomic_write(&path, text.as_bytes())
    }

    /// Writes a file of an application (the resume as it was attached). The application has to exist.
    pub fn save_application_bytes(&self, id: &str, rel: &str, bytes: &[u8]) -> Result<()> {
        let path = self.application_path(id, rel)?;
        self.application(id)?;
        atomic_write(&path, bytes)
    }

    pub fn load_application_part<T: DeserializeOwned>(&self, id: &str, rel: &str) -> Result<Option<T>> {
        load_record(&self.application_path(id, rel)?, migrate::application)
    }

    pub fn save_application_part<T: Serialize>(&self, id: &str, rel: &str, record: &T) -> Result<()> {
        let path = self.application_path(id, rel)?;
        self.application(id)?;
        save_record(&path, record)
    }

    pub fn remove_application_file(&self, id: &str, rel: &str) -> Result<()> {
        let path = self.application_path(id, rel)?;
        match fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(StorageError::Io(path, e.to_string())),
        }
    }
}

fn forget_edits(a: &mut AppRecord, stage_id: &str) {
    let prefix = format!("process.{stage_id}.");
    a.edited_by_user.retain(|e| !e.starts_with(&prefix));
    a.was_values.retain(|k, _| !k.starts_with(&prefix));
}

fn apply_time(a: &mut AppRecord, i: usize, at: Option<String>) {
    if at == a.process[i].at {
        return;
    }
    let sid = a.process[i].id.clone();
    let old = std::mem::replace(&mut a.process[i].at, at);
    if let Some(o) = &old {
        a.process[i].previous_at.push(o.clone());
    }
    a.mark_edited(&format!("process.{sid}.at"), old);
}

/// Active before closed; active by the next interview (a dated one first, the earliest first), then the most recent
/// application. Closed ones by the most recent application.
pub fn sort_applications(items: &mut [AppRecord], now: NaiveDateTime) {
    items.sort_by(|a, b| {
        let closed = |x: &AppRecord| x.status == Status::Closed;
        let next = |x: &AppRecord| if closed(x) { None } else { x.next_interview(now) };
        closed(a)
            .cmp(&closed(b))
            .then_with(|| match (next(a), next(b)) {
                (Some(x), Some(y)) => x.cmp(&y),
                (Some(_), None) => std::cmp::Ordering::Less,
                (None, Some(_)) => std::cmp::Ordering::Greater,
                (None, None) => std::cmp::Ordering::Equal,
            })
            .then_with(|| b.applied_on.cmp(&a.applied_on))
            .then_with(|| b.created.cmp(&a.created))
            .then_with(|| a.id.cmp(&b.id))
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::reps::Session;
    use chrono::NaiveDate;

    fn storage() -> (tempfile::TempDir, Storage) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::init(dir.path().join("data")).unwrap();
        (dir, s)
    }

    fn day(y: i32, m: u32, d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, d).unwrap()
    }

    /// Wednesday 21 October 2026, 8 pm.
    fn now() -> NaiveDateTime {
        day(2026, 10, 21).and_hms_opt(20, 0, 0).unwrap()
    }

    fn new_app(company: &str) -> NewApplication {
        NewApplication { company: company.into(), role: "Lifecycle Manager".into(), ..Default::default() }
    }

    fn make(s: &Storage, company: &str) -> AppRecord {
        s.create_application(new_app(company), day(2026, 10, 6)).unwrap()
    }

    fn session(id: &str, app: Option<&str>, stage: &str, stage_id: Option<&str>) -> Session {
        Session { id: id.into(), mode: "drill".into(), stage: stage.into(), application_id: app.map(String::from), stage_id: stage_id.map(String::from), started: "2026-10-20T10:00:00Z".into(), target_id: None }
    }

    // ---------- create ----------

    #[test]
    fn a_new_application_gets_the_four_default_stages_and_a_file_with_a_schema_version() {
        let (_d, s) = storage();
        let a = make(&s, "Kestrel Pay");
        let stages: Vec<(&str, &str)> = a.process.iter().map(|p| (p.id.as_str(), p.label.as_str())).collect();
        assert_eq!(stages, vec![("stg_1", "Recruiter"), ("stg_2", "Hiring manager"), ("stg_3", "Panel"), ("stg_4", "Leadership")]);
        assert_eq!(a.status, Status::Applied);
        assert_eq!(a.applied_on, "2026-10-06");
        assert!(a.edited_by_user.is_empty(), "what the user typed when adding it is not an edit");
        let text = std::fs::read_to_string(s.root().join("applications").join(&a.id).join("application.json")).unwrap();
        assert!(text.contains("\"schema_version\": 1"), "{text}");
        assert_eq!(s.application(&a.id).unwrap(), a);
    }

    #[test]
    fn stages_can_be_chosen_at_creation_with_dates_and_may_repeat() {
        let (_d, s) = storage();
        let new = NewApplication {
            stages: Some(vec![
                NewStage { stage: "recruiter".into(), label: None, at: Some("2026-10-14".into()) },
                NewStage { stage: "panel".into(), label: Some("Panel with design".into()), at: Some("2026-10-30T14:00".into()) },
                NewStage { stage: "panel".into(), label: None, at: None },
            ]),
            ..new_app("Northpine")
        };
        let a = s.create_application(new, day(2026, 10, 6)).unwrap();
        assert_eq!(a.process.len(), 3);
        assert_eq!(a.process[1].label, "Panel with design");
        assert_eq!(a.process[2].label, "Panel");
        assert_eq!(a.process[1].at.as_deref(), Some("2026-10-30T14:00"));
    }

    #[test]
    fn a_company_is_required_a_bad_date_is_refused_and_closed_needs_a_reason() {
        let (_d, s) = storage();
        let err = s.create_application(new_app("  "), day(2026, 10, 6)).unwrap_err().to_string();
        assert!(err.contains("company"), "{err}");
        let bad = NewApplication { stages: Some(vec![NewStage { stage: "recruiter".into(), label: None, at: Some("next Tuesday".into()) }]), ..new_app("X") };
        assert!(s.create_application(bad, day(2026, 10, 6)).is_err());
        let unknown = NewApplication { stages: Some(vec![NewStage { stage: "coffee_chat".into(), label: None, at: None }]), ..new_app("X") };
        assert!(s.create_application(unknown, day(2026, 10, 6)).is_err());
        let closed = NewApplication { status: Some(Status::Closed), ..new_app("X") };
        let err = s.create_application(closed, day(2026, 10, 6)).unwrap_err().to_string();
        assert!(err.contains("reason"), "{err}");
        let closed = NewApplication { status: Some(Status::Closed), closed_reason: Some(ClosedReason::Rejected), ..new_app("X") };
        assert_eq!(s.create_application(closed, day(2026, 10, 6)).unwrap().closed_reason, Some(ClosedReason::Rejected));
    }

    #[test]
    fn ids_that_could_leave_the_folder_are_refused() {
        let (_d, s) = storage();
        for bad in ["../x", "a/b", ""] {
            assert!(s.application(bad).is_err(), "{bad}");
            assert!(s.delete_application(bad, false).is_err(), "{bad}");
        }
        assert!(matches!(s.application("app_nope"), Err(StorageError::NotFound(_))));
    }

    // ---------- editing and the edited-by-user list ----------

    #[test]
    fn every_edited_field_is_listed_by_path_and_an_unchanged_one_is_not() {
        let (_d, s) = storage();
        let a = make(&s, "Kestrel Pay");
        let b = s.update_application(&a.id, AppPatch { role: Some("Senior Lifecycle Marketing Manager".into()), company: Some("Kestrel Pay".into()), notes: Some("Moved to Friday".into()), ..Default::default() }).unwrap();
        assert_eq!(b.role, "Senior Lifecycle Marketing Manager");
        assert_eq!(b.edited_by_user, vec!["role", "notes"], "company was sent but is the same, so it is not an edit");
        assert_eq!(b.was_values.get("role").map(String::as_str), Some("Lifecycle Manager"));
        let c = s.update_application(&a.id, AppPatch { role: Some("Lifecycle Lead".into()), ..Default::default() }).unwrap();
        assert_eq!(c.edited_by_user, vec!["role", "notes"], "listed once");
        assert_eq!(c.was_values.get("role").map(String::as_str), Some("Lifecycle Manager"), "the value before the first edit is kept");
        assert_eq!(s.application(&a.id).unwrap(), c);
    }

    #[test]
    fn closing_needs_a_reason_and_reopening_clears_it() {
        let (_d, s) = storage();
        let a = make(&s, "Kestrel Pay");
        let err = s.update_application(&a.id, AppPatch { status: Some(Status::Closed), ..Default::default() }).unwrap_err().to_string();
        assert!(err.contains("reason"), "{err}");
        assert_eq!(s.application(&a.id).unwrap().status, Status::Applied, "nothing was saved");
        let closed = s.update_application(&a.id, AppPatch { status: Some(Status::Closed), closed_reason: Some(ClosedReason::Withdrew), ..Default::default() }).unwrap();
        assert_eq!((closed.status, closed.closed_reason), (Status::Closed, Some(ClosedReason::Withdrew)));
        assert!(closed.edited_by_user.contains(&"status".to_string()) && closed.edited_by_user.contains(&"closed_reason".to_string()));
        let open = s.update_application(&a.id, AppPatch { status: Some(Status::Interviewing), ..Default::default() }).unwrap();
        assert_eq!(open.closed_reason, None);
    }

    #[test]
    fn the_company_cannot_be_blanked_and_the_startup_flag_is_recorded_when_changed() {
        let (_d, s) = storage();
        let a = make(&s, "Kestrel Pay");
        assert!(s.update_application(&a.id, AppPatch { company: Some(" ".into()), ..Default::default() }).is_err());
        let b = s.update_application(&a.id, AppPatch { startup: Some(true), ..Default::default() }).unwrap();
        assert!(b.startup && b.edited_by_user == vec!["startup"]);
    }

    // ---------- the process ----------

    #[test]
    fn a_stage_can_be_added_twice_renamed_reordered_and_dated() {
        let (_d, s) = storage();
        let a = make(&s, "Kestrel Pay");
        let a = s.add_stage(&a.id, "panel", Some("Second panel"), Some("2026-11-03T10:00")).unwrap();
        assert_eq!(a.process.len(), 5);
        let new_id = a.process[4].id.clone();
        assert_eq!(new_id, "stg_5");
        let a = s.rename_stage(&a.id, "stg_2", "Call with Marco").unwrap();
        assert_eq!(a.process[1].label, "Call with Marco");
        assert!(a.edited_by_user.contains(&"process.stg_2.label".to_string()));
        let a = s.rename_stage(&a.id, "stg_2", "").unwrap();
        assert_eq!(a.process[1].label, "Hiring manager", "an empty name goes back to the standard one");
        let order: Vec<String> = ["stg_1", "stg_5", "stg_2", "stg_3", "stg_4"].iter().map(|x| x.to_string()).collect();
        let a = s.reorder_stages(&a.id, &order).unwrap();
        assert_eq!(a.process.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(), vec!["stg_1", "stg_5", "stg_2", "stg_3", "stg_4"]);
        assert!(a.edited_by_user.contains(&"process.order".to_string()));
        assert!(s.reorder_stages(&a.id, &["stg_1".to_string()]).is_err(), "an order must list every stage once");
        assert!(s.add_stage(&a.id, "coffee_chat", None, None).is_err());
    }

    #[test]
    fn a_stage_date_is_recorded_as_edited_and_the_old_date_is_kept_as_history() {
        let (_d, s) = storage();
        let a = make(&s, "Kestrel Pay");
        let a = s.set_stage_time(&a.id, "stg_2", Some("2026-10-22T14:00")).unwrap();
        assert_eq!(a.process[1].at.as_deref(), Some("2026-10-22T14:00"));
        assert!(a.process[1].previous_at.is_empty(), "the first date has nothing before it");
        let a = s.set_stage_time(&a.id, "stg_2", Some("2026-10-23T14:00")).unwrap();
        assert_eq!(a.process[1].previous_at, vec!["2026-10-22T14:00"]);
        assert_eq!(a.edited_by_user.iter().filter(|p| *p == "process.stg_2.at").count(), 1);
        let same = s.set_stage_time(&a.id, "stg_2", Some("2026-10-23T14:00")).unwrap();
        assert_eq!(same.process[1].previous_at, vec!["2026-10-22T14:00"], "setting the same date again is not a move");
        let cleared = s.set_stage_time(&a.id, "stg_2", None).unwrap();
        assert_eq!(cleared.process[1].at, None);
        assert!(s.set_stage_time(&a.id, "stg_2", Some("tomorrow")).is_err());
        assert!(s.set_stage_time(&a.id, "stg_9", Some("2026-10-23")).is_err());
    }

    #[test]
    fn removed_stage_ids_are_never_reused() {
        let (_d, s) = storage();
        let a = make(&s, "Kestrel Pay");
        let RemoveStage::Removed { application, .. } = s.remove_stage(&a.id, "stg_4", false).unwrap() else { panic!("no sessions, so no question") };
        assert_eq!(application.process.len(), 3);
        let a = s.add_stage(&a.id, "leadership", None, None).unwrap();
        assert_eq!(a.process.last().unwrap().id, "stg_5");
    }

    #[test]
    fn removing_a_stage_that_has_sessions_asks_first_and_the_sessions_keep_the_old_stage_name() {
        let (_d, s) = storage();
        let a = make(&s, "Kestrel Pay");
        s.save_session(&session("ses_1", Some(&a.id), "panel", Some("stg_3"))).unwrap();
        s.save_session(&session("ses_2", Some(&a.id), "panel", Some("stg_3"))).unwrap();
        match s.remove_stage(&a.id, "stg_3", false).unwrap() {
            RemoveStage::NeedsConfirm { sessions } => assert_eq!(sessions, 2),
            other => panic!("{other:?}"),
        }
        assert_eq!(s.application(&a.id).unwrap().process.len(), 4, "nothing was removed without the yes");
        match s.remove_stage(&a.id, "stg_3", true).unwrap() {
            RemoveStage::Removed { application, sessions_kept } => {
                assert_eq!(sessions_kept, 2);
                assert!(application.process.iter().all(|p| p.id != "stg_3"));
            }
            other => panic!("{other:?}"),
        }
        let kept = s.session("ses_1").unwrap().unwrap();
        assert_eq!((kept.stage.as_str(), kept.application_id.as_deref()), ("panel", Some(a.id.as_str())));
    }

    #[test]
    fn a_session_with_no_stage_id_counts_for_the_first_stage_of_its_type() {
        let (_d, s) = storage();
        let a = s.create_application(NewApplication { stages: Some(vec![NewStage { stage: "panel".into(), label: None, at: None }, NewStage { stage: "panel".into(), label: None, at: None }]), ..new_app("X") }, day(2026, 10, 6)).unwrap();
        let sessions = vec![session("a", Some(&a.id), "panel", None), session("b", Some(&a.id), "panel", Some("stg_2")), session("c", Some("other"), "panel", Some("stg_1"))];
        let counts: Vec<usize> = a.process.iter().map(|p| a.sessions_on_stage(p, &sessions)).collect();
        assert_eq!(counts, vec![1, 1]);
    }

    #[test]
    fn the_whole_process_can_be_saved_in_one_go_and_stages_missing_from_it_are_removed_after_a_yes() {
        let (_d, s) = storage();
        let a = make(&s, "Kestrel Pay");
        s.save_session(&session("ses_1", Some(&a.id), "recruiter", Some("stg_1"))).unwrap();
        let inputs = vec![
            StageInput { id: Some("stg_2".into()), stage: "hiring_manager".into(), label: "Hiring manager".into(), at: Some("2026-10-23T14:00".into()) },
            StageInput { id: None, stage: "technical".into(), label: "Technical".into(), at: None },
            StageInput { id: Some("stg_4".into()), stage: "leadership".into(), label: "Founder call".into(), at: None },
        ];
        match s.save_process(&a.id, inputs.clone(), false).unwrap() {
            SaveProcess::NeedsConfirm { sessions, stage_ids } => assert_eq!((sessions, stage_ids), (1, vec!["stg_1".to_string()])),
            other => panic!("{other:?}"),
        }
        let SaveProcess::Saved(saved) = s.save_process(&a.id, inputs, true).unwrap() else { panic!("confirmed") };
        let got: Vec<(&str, &str, Option<&str>)> = saved.process.iter().map(|p| (p.id.as_str(), p.label.as_str(), p.at.as_deref())).collect();
        assert_eq!(got, vec![("stg_2", "Hiring manager", Some("2026-10-23T14:00")), ("stg_5", "Technical", None), ("stg_4", "Founder call", None)]);
        assert!(saved.edited_by_user.contains(&"process.stg_2.at".to_string()));
        assert!(saved.edited_by_user.contains(&"process.stg_4.label".to_string()));
        assert!(!saved.edited_by_user.iter().any(|p| p.starts_with("process.stg_1")), "a removed stage leaves no edits behind");
    }

    // ---------- the tracker's suggestions ----------

    #[test]
    fn a_first_interview_date_suggests_a_status_but_never_changes_it() {
        let (_d, s) = storage();
        let a = make(&s, "Kestrel Pay");
        assert_eq!(a.suggested_status(), None, "no date, nothing to suggest");
        let a = s.set_stage_time(&a.id, "stg_1", Some("2026-10-24T10:00")).unwrap();
        assert_eq!(a.status, Status::Applied, "the user sets the status");
        assert_eq!(a.suggested_status(), Some(Status::Screening), "the first interview is the recruiter call");
        let b = s.update_application(&a.id, AppPatch { status: Some(Status::Screening), ..Default::default() }).unwrap();
        assert_eq!(b.suggested_status(), None, "already there");
        let c = s.set_stage_time(&b.id, "stg_2", Some("2026-10-30T10:00")).unwrap();
        assert_eq!(c.suggested_status(), None, "a recruiter call still ahead keeps it at screening");
        let d = s.set_stage_done(&c.id, "stg_1", true).unwrap();
        assert_eq!(d.suggested_status(), Some(Status::Interviewing));
        let skipped = make(&s, "Northpine");
        let skipped = s.set_stage_time(&skipped.id, "stg_2", Some("2026-10-30T10:00")).unwrap();
        assert_eq!(skipped.suggested_status(), Some(Status::Interviewing), "the first date is the hiring manager");
        let offer = s.update_application(&skipped.id, AppPatch { status: Some(Status::Offer), ..Default::default() }).unwrap();
        assert_eq!(offer.suggested_status(), None);
    }

    #[test]
    fn the_night_before_is_the_day_before_the_earliest_upcoming_interview_and_moves_with_it() {
        let (_d, s) = storage();
        let a = make(&s, "Kestrel Pay");
        assert_eq!(a.night_before(now()), None);
        let a = s.set_stage_time(&a.id, "stg_2", Some("2026-10-23T14:00")).unwrap();
        let a = s.set_stage_time(&a.id, "stg_3", Some("2026-11-02T10:00")).unwrap();
        let nb = a.night_before(now()).unwrap();
        assert_eq!((nb.date.as_str(), nb.stage_id.as_str()), ("2026-10-22", "stg_2"));
        // The hiring manager call moves a week.
        let a = s.set_stage_time(&a.id, "stg_2", Some("2026-10-30T14:00")).unwrap();
        assert_eq!(a.night_before(now()).unwrap().date, "2026-10-29");
        // The panel moves up before it.
        let a = s.set_stage_time(&a.id, "stg_3", Some("2026-10-26T09:00")).unwrap();
        let nb = a.night_before(now()).unwrap();
        assert_eq!((nb.date.as_str(), nb.stage_id.as_str()), ("2026-10-25", "stg_3"));
        // A stage that is done, or already in the past, is not upcoming.
        let a = s.set_stage_done(&a.id, "stg_3", true).unwrap();
        assert_eq!(a.night_before(now()).unwrap().stage_id, "stg_2");
        let a = s.set_stage_time(&a.id, "stg_2", Some("2026-10-20T14:00")).unwrap();
        assert_eq!(a.night_before(now()), None);
        // An interview later today still counts (a date with no time is all day).
        let a = s.set_stage_time(&a.id, "stg_4", Some("2026-10-21")).unwrap();
        assert_eq!(a.night_before(now()).unwrap().date, "2026-10-20");
    }

    #[test]
    fn the_waiting_note_counts_days_since_applying_and_is_empty_once_an_interview_is_dated() {
        let (_d, s) = storage();
        let a = s.create_application(new_app("Tidewell"), day(2026, 10, 15)).unwrap();
        assert_eq!(a.waiting(now()).as_deref(), Some("6 days since you applied"));
        let today = s.create_application(new_app("Now"), day(2026, 10, 21)).unwrap();
        assert_eq!(today.waiting(now()).as_deref(), Some("Applied today"));
        let yesterday = s.create_application(new_app("Y"), day(2026, 10, 20)).unwrap();
        assert_eq!(yesterday.waiting(now()).as_deref(), Some("1 day since you applied"));
        let dated = s.set_stage_time(&a.id, "stg_1", Some("2026-10-26T10:00")).unwrap();
        assert_eq!(dated.waiting(now()), None);
        let closed = s.update_application(&a.id, AppPatch { status: Some(Status::Closed), closed_reason: Some(ClosedReason::NoResponse), ..Default::default() }).unwrap();
        assert_eq!(closed.waiting(now()), None);
    }

    // ---------- the list ----------

    #[test]
    fn the_list_puts_active_before_closed_then_the_next_interview_then_the_most_recent_application() {
        let (_d, s) = storage();
        let mk = |name: &str, applied: NaiveDate| s.create_application(new_app(name), applied).unwrap();
        let undated_old = mk("Undated old", day(2026, 9, 1));
        let undated_new = mk("Undated new", day(2026, 10, 15));
        let soon = mk("Soon", day(2026, 9, 10));
        let later = mk("Later", day(2026, 10, 18));
        let past_only = mk("Past only", day(2026, 9, 5));
        let closed_new = mk("Closed new", day(2026, 10, 1));
        let closed_old = mk("Closed old", day(2026, 8, 1));
        s.set_stage_time(&soon.id, "stg_1", Some("2026-10-22T10:00")).unwrap();
        s.set_stage_time(&later.id, "stg_1", Some("2026-10-28T10:00")).unwrap();
        s.set_stage_time(&past_only.id, "stg_1", Some("2026-10-10T10:00")).unwrap();
        for c in [&closed_new, &closed_old] {
            s.update_application(&c.id, AppPatch { status: Some(Status::Closed), closed_reason: Some(ClosedReason::Rejected), ..Default::default() }).unwrap();
        }
        let names: Vec<String> = s.load_applications(now()).unwrap().items.into_iter().map(|a| a.company).collect();
        assert_eq!(names, vec!["Soon", "Later", "Undated new", "Past only", "Undated old", "Closed new", "Closed old"]);
        let _ = undated_old;
        let _ = undated_new;
    }

    #[test]
    fn an_unreadable_or_newer_application_file_is_reported_and_never_hides_the_rest() {
        let (_d, s) = storage();
        let ok = make(&s, "Fine");
        let bad = s.root().join("applications/app_bad");
        std::fs::create_dir_all(&bad).unwrap();
        std::fs::write(bad.join("application.json"), "nope").unwrap();
        let future = s.root().join("applications/app_future");
        std::fs::create_dir_all(&future).unwrap();
        let text = r#"{"schema_version": 99, "id": "app_future", "company": "From the future"}"#;
        std::fs::write(future.join("application.json"), text).unwrap();
        std::fs::create_dir_all(s.root().join("applications/app_empty")).unwrap();
        let loaded = s.load_applications(now()).unwrap();
        assert_eq!(loaded.items.len(), 1);
        assert_eq!(loaded.items[0].id, ok.id);
        assert_eq!(loaded.problems.len(), 2, "{:?}", loaded.problems);
        assert_eq!(std::fs::read_to_string(future.join("application.json")).unwrap(), text, "a file from a newer Ensayo is left alone");
    }

    // ---------- delete ----------

    #[test]
    fn deleting_an_application_keeps_its_reps_as_practice_without_an_application() {
        let (_d, s) = storage();
        let a = make(&s, "Kestrel Pay");
        let other = make(&s, "Northpine");
        s.save_session(&session("ses_1", Some(&a.id), "panel", Some("stg_3"))).unwrap();
        s.save_session(&session("ses_2", Some(&other.id), "panel", Some("stg_3"))).unwrap();
        let out = s.delete_application(&a.id, false).unwrap();
        assert_eq!((out.kept_sessions, out.deleted_reps.len()), (1, 0));
        assert!(!s.root().join("applications").join(&a.id).exists());
        let kept = s.session("ses_1").unwrap().unwrap();
        assert_eq!((kept.application_id, kept.stage_id.as_deref(), kept.stage.as_str()), (None, None, "panel"));
        assert_eq!(s.session("ses_2").unwrap().unwrap().application_id.as_deref(), Some(other.id.as_str()), "other applications are untouched");
    }

    #[test]
    fn deleting_an_application_can_also_delete_its_reps_and_says_which_so_the_audio_can_go() {
        let (_d, s) = storage();
        let a = make(&s, "Kestrel Pay");
        s.save_session(&session("ses_1", Some(&a.id), "panel", None)).unwrap();
        s.save_session(&session("ses_free", None, "panel", None)).unwrap();
        let rep_dir = s.root().join("sessions/ses_1/reps/1");
        std::fs::create_dir_all(&rep_dir).unwrap();
        std::fs::write(rep_dir.join("rep.json"), "{}").unwrap();
        let out = s.delete_application(&a.id, true).unwrap();
        assert_eq!(out.deleted_reps, vec![("ses_1".to_string(), 1)]);
        assert!(s.session("ses_1").unwrap().is_none());
        assert!(s.session("ses_free").unwrap().is_some(), "practice without an application is not touched");
    }

    #[test]
    fn delete_all_removes_the_applications_folder() {
        let (_d, s) = storage();
        let a = make(&s, "Kestrel Pay");
        s.save_application_text(&a.id, "jd.txt", "A posting").unwrap();
        s.delete_all().unwrap();
        assert!(!s.root().join("applications").exists());
    }

    #[test]
    fn the_posting_and_the_other_files_live_next_to_the_application_and_are_written_whole() {
        let (_d, s) = storage();
        let a = make(&s, "Kestrel Pay");
        assert_eq!(s.application_text(&a.id, "jd.txt").unwrap(), None);
        s.save_application_text(&a.id, "jd.txt", "About the role").unwrap();
        assert_eq!(s.application_text(&a.id, "jd.txt").unwrap().as_deref(), Some("About the role"));
        assert!(s.save_application_text(&a.id, "../escape.txt", "x").is_err(), "only plain file names");
        assert!(s.save_application_text("app_nope", "jd.txt", "x").is_err(), "the application must exist");
    }
}
