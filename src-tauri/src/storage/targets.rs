//! You and your targets (v0.1). `you.json` holds what stays the same across every kind of job (name, habits, which
//! target is active); `targets/<id>.json` holds one kind of job each. The v0 `profile.json` is moved to
//! `profile.v0.json` the first time it is read (see `migrate_profile`); `profile()` still returns the merged v0 view
//! (you plus the active target) so the screens and prompts written before targets keep working.

use super::applications::{stamp, STAGE_TYPES};
use super::io::{is_safe_id, list_json, new_id};
use super::migrate;
use super::model::{Profile, Story};
use super::versioned::{load_record, save_record};
use super::{Loaded, Result, Storage, StorageError};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

pub const TARGET_COLORS: [&str; 5] = ["coral", "slate", "green", "gold", "plum"];
const ROLE_FAMILIES: [&str; 5] = ["lifecycle", "marketing_ops", "growth", "product_marketing", "other"];
const SELLS_TO: [&str; 3] = ["b2b", "b2c", "both"];
const SENIORITIES: [&str; 5] = ["early", "mid", "senior", "lead", "director"];
const COMPANY_STAGES: [&str; 4] = ["startup", "growth", "enterprise", "any"];
/// What a new target starts with, and what the migrated one gets.
pub const DEFAULT_TARGET_PROCESS: [&str; 4] = ["recruiter", "hiring_manager", "technical", "panel"];
/// The id of the target the v0 profile becomes. Fixed, so a migration that was cut short is simply done again.
pub const MIGRATED_TARGET_ID: &str = "tg_1";
const MAX_LEAD_WITH: usize = 3;

/// Colours go out in order and repeat after five.
pub fn color_for(index: usize) -> &'static str {
    TARGET_COLORS[index % TARGET_COLORS.len()]
}

/// The role words decide the family: "Senior Lifecycle Marketing Manager" is lifecycle, "Marketing Operations Manager"
/// is marketing ops.
pub fn role_family_of(role: &str) -> &'static str {
    let r = role.to_lowercase();
    let has = |words: &[&str]| words.iter().any(|w| r.contains(w));
    if has(&["lifecycle", "crm", "retention", "email marketing"]) {
        "lifecycle"
    } else if has(&["marketing ops", "marketing operations", "operations", "revops", "martech"]) {
        "marketing_ops"
    } else if has(&["growth", "acquisition", "demand gen"]) {
        "growth"
    } else if has(&["product marketing", "pmm"]) {
        "product_marketing"
    } else {
        "other"
    }
}

/// "B2C lifecycle", "B2B marketing ops", "Both growth". With no known family the role itself is the name.
pub fn target_name(role: &str, sells_to: &str, family: &str) -> String {
    let who = match sells_to {
        "b2b" => "B2B",
        "b2c" => "B2C",
        _ => "Both",
    };
    let what = match family {
        "lifecycle" => "lifecycle",
        "marketing_ops" => "marketing ops",
        "growth" => "growth",
        "product_marketing" => "product marketing",
        _ => "",
    };
    if what.is_empty() {
        let r = role.trim();
        if r.is_empty() { "My target".to_string() } else { r.to_string() }
    } else {
        format!("{who} {what}")
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct You {
    pub name: String,
    #[serde(default)]
    pub full_name: String,
    #[serde(default)]
    pub focus_habits: Vec<String>,
    #[serde(default)]
    pub active_target_id: Option<String>,
    /// Set by the migration, cleared by `ack_targets_note`. The screens never send it: saving `you` keeps what is stored.
    #[serde(default)]
    pub targets_note_pending: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BaseResume {
    pub path: String,
    pub file_name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PayRange {
    pub low: f64,
    pub high: f64,
    #[serde(default)]
    pub currency: String,
}

/// One kind of job. Everything job-specific lives here; stories, habits and history are shared.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Target {
    pub id: String,
    pub name: String,
    pub color: String,
    pub role: String,
    pub role_family: String,
    pub seniority: String,
    pub industry: String,
    pub sells_to: String,
    pub company_stage: String,
    /// The one sentence "Tell me about yourself" is checked against. Ensayo never writes it.
    pub pitch: String,
    pub lead_with: Vec<String>,
    pub pinned_story_ids: Vec<String>,
    pub hidden_story_ids: Vec<String>,
    pub default_process: Vec<String>,
    pub base_resume: Option<BaseResume>,
    /// Never sent to an AI.
    pub pay_range: Option<PayRange>,
    pub archived: bool,
    pub created_at: String,
}

impl Default for Target {
    fn default() -> Self {
        Target {
            id: String::new(),
            name: String::new(),
            color: TARGET_COLORS[0].into(),
            role: String::new(),
            role_family: "other".into(),
            seniority: "senior".into(),
            industry: String::new(),
            sells_to: "both".into(),
            company_stage: "any".into(),
            pitch: String::new(),
            lead_with: vec![],
            pinned_story_ids: vec![],
            hidden_story_ids: vec![],
            default_process: DEFAULT_TARGET_PROCESS.iter().map(|s| s.to_string()).collect(),
            base_resume: None,
            pay_range: None,
            archived: false,
            created_at: String::new(),
        }
    }
}

/// How a posting reads against the targets (prompt 09, or keywords when no engine is set up). Saved on the application
/// as `target_fit`; the same shape as `TargetFit` in `src/data/types.ts`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetFit {
    pub sells_to: String,
    pub role_family: String,
    pub seniority: String,
    pub best_target_id: Option<String>,
    #[serde(default)]
    pub mismatch_notes: Vec<String>,
    #[serde(default)]
    pub per_target: Vec<FitRow>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FitRow {
    pub target_id: String,
    /// "strong", "ok" or "weak".
    pub fit: String,
    pub why: String,
}

fn checked_id(id: &str) -> Result<&str> {
    if is_safe_id(id) {
        Ok(id)
    } else {
        Err(StorageError::Invalid(format!("\"{id}\" is not a valid id")))
    }
}

fn pick<'a>(value: &str, allowed: &'a [&'a str], fallback: &'a str) -> String {
    allowed.iter().find(|a| **a == value.trim()).copied().unwrap_or(fallback).to_string()
}

fn check_in(value: &str, allowed: &[&str], what: &str) -> Result<()> {
    if allowed.contains(&value) {
        Ok(())
    } else {
        Err(StorageError::Invalid(format!("\"{value}\" is not a {what}.")))
    }
}

fn gone() -> StorageError {
    StorageError::Invalid("That target isn't here any more.".into())
}

pub const LAST_TARGET: &str = "Keep at least one target. This is the only one you have left.";
pub const HAS_APPLICATIONS: &str = "This target has applications. Move them to another target first.";

/// A v0 profile as `you` and the first target. Pure: `now` is the stamp for `createdAt`.
pub fn migrate_profile(p: &Profile, now: &str) -> (You, Target) {
    let family = role_family_of(&p.target_role);
    let sells_to = pick(&p.sells_to, &SELLS_TO, "both");
    let target = Target {
        id: MIGRATED_TARGET_ID.into(),
        name: target_name(&p.target_role, &sells_to, family),
        color: color_for(0).into(),
        role: p.target_role.clone(),
        role_family: family.into(),
        seniority: pick(&p.seniority, &SENIORITIES, "senior"),
        industry: p.industry.clone(),
        sells_to,
        company_stage: "any".into(),
        pitch: p.identity_statement.clone(),
        created_at: now.into(),
        ..Target::default()
    };
    let you = You { name: p.name.clone(), full_name: p.full_name.clone(), focus_habits: p.focus_habits.clone(), active_target_id: Some(target.id.clone()), targets_note_pending: true };
    (you, target)
}

/// The v0 view of a person: the name and habits from `you`, the job fields from `target`.
pub fn merged_profile(you: &You, target: Option<&Target>) -> Profile {
    Profile {
        name: you.name.clone(),
        full_name: you.full_name.clone(),
        target_role: target.map(|t| t.role.clone()).unwrap_or_default(),
        seniority: target.map(|t| t.seniority.clone()).unwrap_or_else(|| "senior".into()),
        industry: target.map(|t| t.industry.clone()).unwrap_or_default(),
        sells_to: target.map(|t| t.sells_to.clone()).unwrap_or_else(|| "both".into()),
        identity_statement: target.map(|t| t.pitch.clone()).unwrap_or_default(),
        focus_habits: you.focus_habits.clone(),
    }
}

/// Moving the profile over must not run twice at once (two commands can read at the same moment).
static MIGRATING: Mutex<()> = Mutex::new(());

impl Storage {
    fn you_path(&self) -> PathBuf {
        self.root().join("you.json")
    }
    fn targets_dir(&self) -> PathBuf {
        self.root().join("targets")
    }
    fn target_path(&self, id: &str) -> PathBuf {
        self.targets_dir().join(format!("{id}.json"))
    }

    /// First read of a folder saved by v0: `profile.json` and no `you.json`. Writes `you.json` and target 1, then moves
    /// the old file to `profile.v0.json` (a backup the app never deletes). A folder that already has `you.json` is never
    /// touched, and a `profile.json` from a newer Ensayo is refused and left where it is.
    fn ensure_migrated(&self) -> Result<()> {
        if self.you_path().exists() || !self.profile_path().exists() {
            return Ok(());
        }
        let _guard = MIGRATING.lock().unwrap_or_else(|e| e.into_inner());
        if self.you_path().exists() {
            return Ok(());
        }
        let Some(old) = load_record::<Profile>(&self.profile_path(), migrate::unchanged)? else { return Ok(()) };
        let (you, target) = migrate_profile(&old, &stamp());
        save_record(&self.target_path(&target.id), &target)?;
        save_record(&self.you_path(), &you)?;
        let backup = self.root().join("profile.v0.json");
        if !backup.exists() {
            fs::rename(self.profile_path(), &backup).map_err(|e| StorageError::Io(self.profile_path(), e.to_string()))?;
        }
        Ok(())
    }

    // ---------- you ----------

    pub fn you(&self) -> Result<Option<You>> {
        self.ensure_migrated()?;
        load_record(&self.you_path(), migrate::unchanged)
    }

    /// Saves your name, full name and habits. The active target is only taken when it is a target you can use, and the
    /// one-time note flag stays as stored (the screens do not know it).
    pub fn save_you(&self, you: &You) -> Result<You> {
        let stored = self.you()?;
        let targets = self.targets()?;
        let usable = |id: &String| targets.iter().any(|t| &t.id == id && !t.archived);
        let active = you.active_target_id.clone().filter(usable).or_else(|| stored.as_ref().and_then(|s| s.active_target_id.clone()).filter(usable)).or_else(|| targets.iter().find(|t| !t.archived).map(|t| t.id.clone()));
        let saved = You {
            name: you.name.trim().to_string(),
            full_name: you.full_name.trim().to_string(),
            focus_habits: you.focus_habits.clone(),
            active_target_id: active,
            targets_note_pending: stored.map(|s| s.targets_note_pending).unwrap_or(false),
        };
        save_record(&self.you_path(), &saved)?;
        Ok(saved)
    }

    pub fn ack_targets_note(&self) -> Result<()> {
        if let Some(mut you) = self.you()? {
            if you.targets_note_pending {
                you.targets_note_pending = false;
                save_record(&self.you_path(), &you)?;
            }
        }
        Ok(())
    }

    // ---------- targets ----------

    /// Every target in the order they were made (archived included). A file that cannot be read is reported and the rest
    /// still load.
    pub fn load_targets(&self) -> Result<Loaded<Target>> {
        self.ensure_migrated()?;
        let mut out = Loaded::<Target>::default();
        for path in list_json(&self.targets_dir())? {
            match load_record::<Target>(&path, migrate::unchanged) {
                Ok(Some(t)) => out.items.push(t),
                Ok(None) => {}
                Err(e) => out.problems.push(format!("{}: {e}", path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default())),
            }
        }
        out.items.sort_by(|a, b| a.created_at.cmp(&b.created_at).then_with(|| a.id.cmp(&b.id)));
        Ok(out)
    }

    pub fn targets(&self) -> Result<Vec<Target>> {
        Ok(self.load_targets()?.items)
    }

    pub fn target(&self, id: &str) -> Result<Target> {
        self.ensure_migrated()?;
        load_record(&self.target_path(checked_id(id)?), migrate::unchanged)?.ok_or_else(gone)
    }

    /// `id` when it is a target that can be used (it exists and is not archived), else a plain error.
    pub(crate) fn checked_target(&self, id: &str) -> Result<String> {
        let t = self.target(id)?;
        if t.archived {
            return Err(StorageError::Invalid("That target is archived. Restore it first.".into()));
        }
        Ok(t.id)
    }

    /// The target an application is filed under: the one it names while that is still a target, else the first that is not
    /// archived (applications from before targets).
    pub fn application_target(&self, app: &super::applications::AppRecord) -> Result<Option<String>> {
        let targets = self.targets()?;
        let first = targets.iter().find(|t| !t.archived).map(|t| t.id.clone());
        Ok(resolve_target(app.target_id.as_deref(), &targets, first.as_deref()))
    }

    /// The target a session belongs to: its own, else its application's, else the first that is not archived.
    pub fn session_target(&self, s: &super::reps::Session) -> Result<Option<String>> {
        let targets = self.targets()?;
        let first = targets.iter().find(|t| !t.archived).map(|t| t.id.clone());
        if let Some(id) = s.target_id.as_deref().filter(|id| targets.iter().any(|t| t.id == *id)) {
            return Ok(Some(id.to_string()));
        }
        if let Some(app) = s.application_id.as_deref().and_then(|id| self.application(id).ok()) {
            return Ok(resolve_target(app.target_id.as_deref(), &targets, first.as_deref()));
        }
        Ok(first)
    }

    /// What a new session is saved with: the target asked for when it exists, else the application's, else the active one.
    pub fn resolve_session_target(&self, requested: Option<&str>, app: Option<&super::applications::AppRecord>) -> Result<Option<String>> {
        let targets = self.targets()?;
        if let Some(id) = requested.filter(|id| targets.iter().any(|t| t.id == *id)) {
            return Ok(Some(id.to_string()));
        }
        if let Some(app) = app {
            return self.application_target(app);
        }
        Ok(self.active_target()?.map(|t| t.id))
    }

    /// The first target that is not archived: where an application or a session with no target belongs.
    pub fn default_target(&self) -> Result<Option<Target>> {
        Ok(self.targets()?.into_iter().find(|t| !t.archived))
    }

    /// The target practice outside an application is for: the one `you` names when it can still be used, else the first
    /// that is not archived.
    pub fn active_target(&self) -> Result<Option<Target>> {
        let targets = self.targets()?;
        let wanted = self.you()?.and_then(|y| y.active_target_id);
        Ok(wanted.and_then(|id| targets.iter().find(|t| t.id == id && !t.archived).cloned()).or_else(|| targets.into_iter().find(|t| !t.archived)))
    }

    /// Creates (empty `id`) or changes a target and returns what was saved. A new target gets the next colour in order
    /// and, with no name typed, a name from its role and who it sells to. Lead-with points are trimmed and kept to three,
    /// a story is never both pinned and hidden. Whether it is archived is changed only by `archive_target` and
    /// `restore_target`.
    pub fn save_target(&self, input: &Target) -> Result<Target> {
        let existing = self.targets()?;
        let current = if input.id.is_empty() { None } else { Some(existing.iter().find(|t| t.id == checked_id(&input.id).map(String::from).unwrap_or_default()).cloned().ok_or_else(gone)?) };
        check_in(&input.color, &TARGET_COLORS, "colour Ensayo uses")?;
        check_in(&input.role_family, &ROLE_FAMILIES, "kind of role")?;
        check_in(&input.sells_to, &SELLS_TO, "kind of customer")?;
        check_in(&input.seniority, &SENIORITIES, "level")?;
        check_in(&input.company_stage, &COMPANY_STAGES, "company stage")?;
        let mut t = input.clone();
        t.role = t.role.trim().to_string();
        t.industry = t.industry.trim().to_string();
        t.pitch = t.pitch.trim().to_string();
        if t.name.trim().is_empty() {
            let family = if t.role_family == "other" { role_family_of(&t.role) } else { t.role_family.as_str() };
            t.name = target_name(&t.role, &t.sells_to, family);
        }
        t.name = t.name.trim().to_string();
        t.lead_with = t.lead_with.iter().map(|p| p.trim().to_string()).filter(|p| !p.is_empty()).take(MAX_LEAD_WITH).collect();
        dedupe(&mut t.pinned_story_ids);
        dedupe(&mut t.hidden_story_ids);
        t.hidden_story_ids.retain(|h| !t.pinned_story_ids.contains(h));
        for stage in &t.default_process {
            if !STAGE_TYPES.contains(&stage.as_str()) {
                return Err(StorageError::Invalid(format!("\"{stage}\" is not a kind of stage. Pick recruiter, hiring manager, technical, panel or leadership.")));
            }
        }
        if t.default_process.is_empty() {
            t.default_process = DEFAULT_TARGET_PROCESS.iter().map(|s| s.to_string()).collect();
        }
        if let Some(p) = &mut t.pay_range {
            p.currency = p.currency.trim().to_string();
            if p.low > p.high {
                return Err(StorageError::Invalid("The low end of the pay range is above the high end.".into()));
            }
        }
        match current {
            Some(old) => {
                t.archived = old.archived;
                t.created_at = old.created_at;
            }
            None => {
                t.id = new_id("tg");
                t.color = color_for(existing.len()).into();
                t.archived = false;
                t.created_at = stamp();
            }
        }
        save_record(&self.target_path(&t.id), &t)?;
        if existing.iter().all(|e| e.archived) {
            self.adopt_active(&t.id)?;
        }
        Ok(t)
    }

    /// Makes `id` the active target when `you` exists and names none that can be used.
    fn adopt_active(&self, id: &str) -> Result<()> {
        if let Some(mut you) = self.you()? {
            let targets = self.targets()?;
            let usable = you.active_target_id.as_ref().is_some_and(|a| targets.iter().any(|t| &t.id == a && !t.archived));
            if !usable {
                you.active_target_id = Some(id.to_string());
                save_record(&self.you_path(), &you)?;
            }
        }
        Ok(())
    }

    /// A copy of a target under a new name (default "<name> copy"), colour and id: not archived, with the same pins, lead-with
    /// points and process, and with each story's angle for the original also set for the copy.
    pub fn duplicate_target(&self, id: &str, name: Option<&str>) -> Result<Target> {
        let from = self.target(id)?;
        let mut copy = from.clone();
        copy.id = String::new();
        copy.name = name.map(str::trim).filter(|n| !n.is_empty()).map(String::from).unwrap_or_else(|| format!("{} copy", from.name));
        copy.archived = false;
        let saved = self.save_target(&copy)?;
        for mut story in self.load_stories()?.items {
            let Some(angle) = story.angles.iter().find(|a| a.target_id == from.id).cloned() else { continue };
            story.angles.push(super::model::StoryAngle { target_id: saved.id.clone(), ..angle });
            self.write_story(&story)?;
        }
        Ok(saved)
    }

    pub fn set_active_target(&self, id: &str) -> Result<You> {
        let target = self.target(id)?;
        if target.archived {
            return Err(StorageError::Invalid("That target is archived. Restore it first.".into()));
        }
        let mut you = self.you()?.ok_or_else(|| StorageError::Invalid("Set up your profile first.".into()))?;
        you.active_target_id = Some(target.id);
        save_record(&self.you_path(), &you)?;
        Ok(you)
    }

    pub fn restore_target(&self, id: &str) -> Result<Target> {
        let mut t = self.target(id)?;
        if t.archived {
            t.archived = false;
            save_record(&self.target_path(&t.id), &t)?;
        }
        self.adopt_active(&t.id)?;
        Ok(t)
    }

    /// Puts a target away. Not the last one that is in use. A target with applications asks for `move_applications_to`
    /// first (then they move there, and nothing is archived if that fails); the active target hands over to the first one
    /// left.
    pub fn archive_target(&self, id: &str, move_applications_to: Option<&str>) -> Result<()> {
        let target = self.target(id)?;
        if target.archived {
            return Ok(());
        }
        let targets = self.targets()?;
        if !targets.iter().any(|t| t.id != target.id && !t.archived) {
            return Err(StorageError::Invalid(LAST_TARGET.into()));
        }
        let first = targets.iter().find(|t| !t.archived).map(|t| t.id.clone());
        let mine: Vec<_> = self.load_applications(chrono::Local::now().naive_local())?.items.into_iter().filter(|a| resolve_target(a.target_id.as_deref(), &targets, first.as_deref()).as_deref() == Some(id)).collect();
        if !mine.is_empty() {
            let Some(dest) = move_applications_to else { return Err(StorageError::Invalid(HAS_APPLICATIONS.into())) };
            let dest = self.target(dest)?;
            if dest.archived || dest.id == target.id {
                return Err(StorageError::Invalid("Pick another target that is in use to move the applications to.".into()));
            }
            for mut app in mine {
                app.target_id = Some(dest.id.clone());
                self.save_application_record(&app)?;
            }
        }
        let mut t = target;
        t.archived = true;
        save_record(&self.target_path(&t.id), &t)?;
        if let Some(mut you) = self.you()? {
            if you.active_target_id.as_deref() == Some(id) || you.active_target_id.is_none() {
                you.active_target_id = self.targets()?.into_iter().find(|x| !x.archived).map(|x| x.id);
                save_record(&self.you_path(), &you)?;
            }
        }
        Ok(())
    }

    /// Pins a story for a target (shown first), hides it (never used), or clears both. A story is in at most one list.
    pub fn set_story_priority(&self, target_id: &str, story_id: &str, priority: &str) -> Result<Target> {
        if !matches!(priority, "pin" | "hide" | "none") {
            return Err(StorageError::Invalid(format!("\"{priority}\" is not pin, hide or none.")));
        }
        let mut t = self.target(target_id)?;
        t.pinned_story_ids.retain(|s| s != story_id);
        t.hidden_story_ids.retain(|s| s != story_id);
        match priority {
            "pin" => t.pinned_story_ids.push(story_id.to_string()),
            "hide" => t.hidden_story_ids.push(story_id.to_string()),
            _ => {}
        }
        save_record(&self.target_path(&t.id), &t)?;
        Ok(t)
    }

    // ---------- the v0 view ----------

    /// The merged profile of you and the active target; `None` before setup.
    pub fn profile(&self) -> Result<Option<Profile>> {
        self.profile_for(None)
    }

    /// The merged profile for one target (an application's or a session's), the active one when `target_id` is none or
    /// no longer there.
    pub fn profile_for(&self, target_id: Option<&str>) -> Result<Option<Profile>> {
        let Some(you) = self.you()? else { return Ok(None) };
        let target = match target_id {
            Some(id) => self.targets()?.into_iter().find(|t| t.id == id),
            None => None,
        };
        let target = match target {
            Some(t) => Some(t),
            None => self.active_target()?,
        };
        Ok(Some(merged_profile(&you, target.as_ref())))
    }

    /// The v0 "save the profile": writes you, and the job fields of the active target (creating the first target when
    /// there is none that is in use).
    pub fn save_profile(&self, p: &Profile) -> Result<()> {
        let stored = self.you()?;
        let mut you = stored.clone().unwrap_or(You { name: String::new(), full_name: String::new(), focus_habits: vec![], active_target_id: None, targets_note_pending: false });
        you.name = p.name.trim().to_string();
        you.full_name = p.full_name.trim().to_string();
        you.focus_habits = p.focus_habits.clone();
        save_record(&self.you_path(), &you)?;
        let sells_to = pick(&p.sells_to, &SELLS_TO, "both");
        let seniority = pick(&p.seniority, &SENIORITIES, "senior");
        match self.active_target()? {
            Some(mut t) => {
                t.role = p.target_role.trim().to_string();
                t.seniority = seniority;
                t.industry = p.industry.trim().to_string();
                t.sells_to = sells_to;
                t.pitch = p.identity_statement.trim().to_string();
                save_record(&self.target_path(&t.id), &t)?;
            }
            None => {
                let family = role_family_of(&p.target_role);
                let created = self.save_target(&Target {
                    role: p.target_role.clone(),
                    role_family: family.into(),
                    seniority,
                    industry: p.industry.clone(),
                    name: target_name(&p.target_role, &sells_to, family),
                    sells_to,
                    pitch: p.identity_statement.clone(),
                    ..Target::default()
                })?;
                you.active_target_id = Some(created.id);
                save_record(&self.you_path(), &you)?;
            }
        }
        Ok(())
    }
}

fn dedupe(list: &mut Vec<String>) {
    let mut seen = std::collections::HashSet::new();
    list.retain(|s| seen.insert(s.clone()));
}

/// The target an application or session with `target_id` belongs to: the one it names when that is still a target, else
/// `first` (the first target that is not archived).
pub fn resolve_target(target_id: Option<&str>, targets: &[Target], first: Option<&str>) -> Option<String> {
    target_id.filter(|id| targets.iter().any(|t| t.id == *id)).map(String::from).or_else(|| first.map(String::from))
}

/// Saves a story without the checks of `save_story` (a copy of a story already saved, an angle copied to a new target).
impl Storage {
    pub(crate) fn write_story(&self, story: &Story) -> Result<()> {
        super::versioned::save_record(&self.root().join("bank/stories").join(format!("{}.json", checked_id(&story.id)?)), story)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::applications::NewApplication;
    use crate::storage::model::{Method, ProofPoint, StoryAngle, Usage};
    use chrono::NaiveDate;

    fn fresh() -> (tempfile::TempDir, Storage) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::init(dir.path().join("data")).unwrap();
        (dir, s)
    }

    fn profile() -> Profile {
        Profile { name: "Dana".into(), full_name: "Dana Ortiz".into(), target_role: "Senior Lifecycle Marketing Manager".into(), seniority: "senior".into(), industry: "Fintech".into(), sells_to: "b2c".into(), identity_statement: "I find where activation breaks and build the fix.".into(), focus_habits: vec!["to_the_point".into(), "numbers".into()] }
    }

    fn story(id: &str) -> Story {
        Story {
            id: id.into(),
            title: id.into(),
            employer: "".into(),
            best_for: vec![],
            direct_answer: "".into(),
            context: "".into(),
            approach: "".into(),
            action: "".into(),
            ownership: "".into(),
            result: "".into(),
            proof_points: vec![ProofPoint { label: "activation".into(), metric: "7-day activation".into(), before: "31".into(), after: "44".into(), unit: "%".into(), approximate: false, verified: true }],
            scale: "".into(),
            competencies: vec![],
            great_eight: vec![],
            branches: vec![],
            verified: false,
            headline: "".into(),
            usage: Usage::default(),
            year: None,
            angles: vec![],
        }
    }

    fn day() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 10, 6).unwrap()
    }

    /// A folder as v0 left it: a profile and nothing else about targets.
    fn v0() -> (tempfile::TempDir, Storage) {
        let (d, s) = fresh();
        save_record(&s.profile_path(), &profile()).unwrap();
        (d, s)
    }

    /// A set-up folder with the migrated target and a second one.
    fn two_targets() -> (tempfile::TempDir, Storage, Target, Target) {
        let (d, s) = v0();
        let first = s.targets().unwrap().remove(0);
        let second = s.save_target(&Target { role: "Marketing Operations Manager".into(), role_family: "marketing_ops".into(), sells_to: "b2b".into(), pitch: "I run the stack.".into(), ..Target::default() }).unwrap();
        (d, s, first, second)
    }

    // ---------- the files ----------

    #[test]
    fn before_setup_there_is_no_you_no_targets_and_no_profile() {
        let (_d, s) = fresh();
        assert_eq!(s.you().unwrap(), None);
        assert!(s.targets().unwrap().is_empty());
        assert_eq!(s.profile().unwrap(), None);
        assert!(s.active_target().unwrap().is_none());
    }

    #[test]
    fn a_target_is_saved_as_camel_case_json_with_a_schema_version_and_reads_back_unchanged() {
        let (_d, s) = fresh();
        let saved = s.save_target(&Target { role: "Head of Growth".into(), ..Target::default() }).unwrap();
        let text = fs::read_to_string(s.root().join(format!("targets/{}.json", saved.id))).unwrap();
        assert!(text.contains("\"schema_version\": 1") && text.contains("\"roleFamily\"") && text.contains("\"pinnedStoryIds\"") && text.contains("\"createdAt\""), "{text}");
        assert_eq!(s.target(&saved.id).unwrap(), saved);
        assert_eq!(s.targets().unwrap(), vec![saved]);
    }

    #[test]
    fn you_is_saved_as_camel_case_json_and_the_screens_cannot_clear_the_one_time_note() {
        let (_d, s) = v0();
        assert!(s.you().unwrap().unwrap().targets_note_pending);
        let text = fs::read_to_string(s.root().join("you.json")).unwrap();
        assert!(text.contains("\"fullName\"") && text.contains("\"focusHabits\"") && text.contains("\"activeTargetId\"") && text.contains("\"targetsNotePending\": true") && text.contains("\"schema_version\": 1"), "{text}");
        // The screens send you without the flag.
        let sent: You = serde_json::from_str(r#"{"name":"Dana D","fullName":"Dana Ortiz","focusHabits":["clean_stop"],"activeTargetId":"tg_1"}"#).unwrap();
        let saved = s.save_you(&sent).unwrap();
        assert_eq!((saved.name.as_str(), saved.focus_habits.clone()), ("Dana D", vec!["clean_stop".to_string()]));
        assert!(saved.targets_note_pending, "saving you keeps the note until it is acknowledged");
        s.ack_targets_note().unwrap();
        assert!(!s.you().unwrap().unwrap().targets_note_pending);
        s.ack_targets_note().unwrap(); // twice is fine
    }

    #[test]
    fn saving_you_only_takes_an_active_target_that_can_be_used() {
        let (_d, s, first, second) = two_targets();
        let mut you = s.you().unwrap().unwrap();
        you.active_target_id = Some(second.id.clone());
        assert_eq!(s.save_you(&you).unwrap().active_target_id, Some(second.id.clone()));
        you.active_target_id = Some("tg_nope".into());
        assert_eq!(s.save_you(&you).unwrap().active_target_id, Some(second.id.clone()), "a stale id keeps what was stored");
        s.archive_target(&second.id, None).unwrap();
        you.active_target_id = Some(second.id.clone());
        assert_eq!(s.save_you(&you).unwrap().active_target_id, Some(first.id), "an archived target is not taken");
    }

    // ---------- save_target ----------

    #[test]
    fn a_new_target_gets_an_id_the_next_colour_a_name_from_its_role_and_a_creation_time() {
        let (_d, s) = fresh();
        let mut ids = std::collections::HashSet::new();
        let mut colours = vec![];
        for i in 0..6 {
            let t = s.save_target(&Target { role: "Lifecycle Manager".into(), sells_to: "b2c".into(), color: "plum".into(), ..Target::default() }).unwrap();
            assert!(t.id.starts_with("tg_") && is_safe_id(&t.id) && ids.insert(t.id.clone()), "{}", t.id);
            assert_eq!(t.name, "B2C lifecycle", "the family is read from the role when it is left as other");
            assert!(!t.created_at.is_empty() && !t.archived, "{i}");
            colours.push(t.color);
        }
        assert_eq!(colours, ["coral", "slate", "green", "gold", "plum", "coral"], "colours go out in order whatever the caller sent");
    }

    #[test]
    fn a_name_that_was_typed_is_kept_and_an_empty_role_is_my_target() {
        let (_d, s) = fresh();
        assert_eq!(s.save_target(&Target { name: "  Fintech push ".into(), ..Target::default() }).unwrap().name, "Fintech push");
        assert_eq!(s.save_target(&Target::default()).unwrap().name, "My target");
    }

    #[test]
    fn lead_with_points_are_trimmed_and_at_most_three() {
        let (_d, s) = fresh();
        let t = s.save_target(&Target { lead_with: vec!["  First  ".into(), "".into(), "Second".into(), "   ".into(), "Third".into(), "Fourth".into()], ..Target::default() }).unwrap();
        assert_eq!(t.lead_with, vec!["First", "Second", "Third"]);
    }

    #[test]
    fn a_story_is_never_both_pinned_and_hidden_and_never_twice_in_one_list() {
        let (_d, s) = fresh();
        let t = s.save_target(&Target { pinned_story_ids: vec!["st_a".into(), "st_b".into(), "st_a".into()], hidden_story_ids: vec!["st_b".into(), "st_c".into(), "st_c".into()], ..Target::default() }).unwrap();
        assert_eq!(t.pinned_story_ids, vec!["st_a", "st_b"]);
        assert_eq!(t.hidden_story_ids, vec!["st_c"]);
    }

    #[test]
    fn unknown_kinds_and_a_backwards_pay_range_are_refused_in_plain_words() {
        let (_d, s) = fresh();
        for bad in [Target { color: "pink".into(), ..Target::default() }, Target { role_family: "wizard".into(), ..Target::default() }, Target { sells_to: "b2g".into(), ..Target::default() }, Target { seniority: "god".into(), ..Target::default() }, Target { company_stage: "huge".into(), ..Target::default() }, Target { default_process: vec!["coffee".into()], ..Target::default() }] {
            assert!(matches!(s.save_target(&bad), Err(StorageError::Invalid(_))), "{bad:?}");
        }
        let err = s.save_target(&Target { pay_range: Some(PayRange { low: 90_000.0, high: 80_000.0, currency: "CAD".into() }), ..Target::default() }).unwrap_err();
        assert_eq!(err.to_string(), "The low end of the pay range is above the high end.");
        assert!(s.targets().unwrap().is_empty(), "nothing was saved");
        let ok = s.save_target(&Target { pay_range: Some(PayRange { low: 80_000.0, high: 95_000.0, currency: " CAD ".into() }), default_process: vec![], ..Target::default() }).unwrap();
        assert_eq!(ok.pay_range.unwrap().currency, "CAD");
        assert_eq!(ok.default_process, DEFAULT_TARGET_PROCESS, "an empty process becomes the usual stages");
    }

    #[test]
    fn changing_a_target_keeps_its_creation_time_and_archived_state_and_an_unknown_id_is_refused() {
        let (_d, s, first, _second) = two_targets();
        let mut edited = first.clone();
        edited.pitch = "A new pitch.".into();
        edited.created_at = "1999-01-01T00:00:00Z".into();
        edited.archived = true;
        edited.color = "gold".into();
        let saved = s.save_target(&edited).unwrap();
        assert_eq!((saved.created_at.clone(), saved.archived, saved.color.as_str(), saved.pitch.as_str()), (first.created_at, false, "gold", "A new pitch."));
        assert_eq!(s.targets().unwrap().len(), 2, "an update replaces, it does not add");
        let err = s.save_target(&Target { id: "tg_nope".into(), ..Target::default() }).unwrap_err();
        assert_eq!(err.to_string(), "That target isn't here any more.");
        assert!(matches!(s.save_target(&Target { id: "../x".into(), ..Target::default() }), Err(StorageError::Invalid(_))));
    }

    #[test]
    fn targets_come_back_in_the_order_they_were_made_and_a_broken_file_does_not_hide_the_rest() {
        let (_d, s, first, second) = two_targets();
        fs::write(s.root().join("targets/tg_bad.json"), "not json").unwrap();
        fs::write(s.root().join("targets/tg_new.json"), r#"{"schema_version": 99, "id": "tg_new"}"#).unwrap();
        let loaded = s.load_targets().unwrap();
        assert_eq!(loaded.items.iter().map(|t| t.id.clone()).collect::<Vec<_>>(), vec![first.id, second.id]);
        assert_eq!(loaded.problems.len(), 2, "{:?}", loaded.problems);
    }

    // ---------- duplicate, active, archive, restore ----------

    #[test]
    fn a_duplicate_copies_everything_but_the_id_name_colour_and_archived_flag_and_copies_angles_onto_the_same_stories() {
        let (_d, s, first, _second) = two_targets();
        s.save_target(&Target { lead_with: vec!["Fixed churn".into()], pinned_story_ids: vec!["st_a".into()], hidden_story_ids: vec!["st_b".into()], base_resume: Some(BaseResume { path: "/r.pdf".into(), file_name: "r.pdf".into() }), ..s.target(&first.id).unwrap() }).unwrap();
        let mut st = story("st_a");
        st.angles = vec![StoryAngle { target_id: first.id.clone(), headline: "Activation 31% to 44%".into(), emphasis: vec!["the test".into()], lead_branch: Some("ownership".into()) }];
        s.save_story(&st).unwrap();
        s.save_story(&story("st_b")).unwrap();
        let copy = s.duplicate_target(&first.id, None).unwrap();
        let original = s.target(&first.id).unwrap();
        assert_ne!(copy.id, original.id);
        assert_eq!(copy.name, format!("{} copy", original.name));
        assert_eq!(copy.color, "green", "the next colour in order");
        assert_eq!((copy.pitch.clone(), copy.lead_with.clone(), copy.pinned_story_ids.clone(), copy.hidden_story_ids.clone(), copy.base_resume.clone(), copy.role.clone()), (original.pitch, original.lead_with, original.pinned_story_ids, original.hidden_story_ids, original.base_resume, original.role));
        let angles = s.story("st_a").unwrap().angles;
        assert_eq!(angles.len(), 2);
        assert_eq!(angles[1], StoryAngle { target_id: copy.id.clone(), ..angles[0].clone() });
        assert!(s.story("st_b").unwrap().angles.is_empty());
        assert_eq!(s.duplicate_target(&first.id, Some("  Second take ")).unwrap().name, "Second take");
        assert!(s.duplicate_target("tg_nope", None).is_err());
    }

    #[test]
    fn a_duplicate_of_an_archived_target_is_not_archived() {
        let (_d, s, _first, second) = two_targets();
        s.archive_target(&second.id, None).unwrap();
        assert!(!s.duplicate_target(&second.id, None).unwrap().archived);
    }

    #[test]
    fn only_a_target_in_use_can_become_active() {
        let (_d, s, first, second) = two_targets();
        assert_eq!(s.active_target().unwrap().unwrap().id, first.id);
        assert_eq!(s.set_active_target(&second.id).unwrap().active_target_id, Some(second.id.clone()));
        assert_eq!(s.active_target().unwrap().unwrap().id, second.id);
        s.set_active_target(&first.id).unwrap();
        s.archive_target(&second.id, None).unwrap();
        assert!(s.set_active_target(&second.id).is_err(), "archived");
        assert!(s.set_active_target("tg_nope").is_err());
        assert_eq!(s.you().unwrap().unwrap().active_target_id, Some(first.id));
    }

    #[test]
    fn the_last_target_in_use_cannot_be_archived() {
        let (_d, s, first, second) = two_targets();
        s.archive_target(&second.id, None).unwrap();
        let err = s.archive_target(&first.id, None).unwrap_err();
        assert_eq!(err.to_string(), LAST_TARGET);
        assert!(!s.target(&first.id).unwrap().archived);
        assert!(s.archive_target(&second.id, None).is_ok(), "archiving what is already archived changes nothing");
    }

    #[test]
    fn archiving_the_active_target_hands_over_to_the_first_one_left_and_restoring_brings_it_back() {
        let (_d, s, first, second) = two_targets();
        s.set_active_target(&second.id).unwrap();
        s.archive_target(&second.id, None).unwrap();
        assert!(s.target(&second.id).unwrap().archived);
        assert_eq!(s.you().unwrap().unwrap().active_target_id, Some(first.id.clone()));
        let back = s.restore_target(&second.id).unwrap();
        assert!(!back.archived && !s.target(&second.id).unwrap().archived);
        assert_eq!(s.active_target().unwrap().unwrap().id, first.id, "restoring does not take over");
    }

    #[test]
    fn a_target_with_applications_will_not_archive_until_they_have_somewhere_to_go() {
        let (_d, s, first, second) = two_targets();
        let app = s.create_application(NewApplication { company: "Kestrel".into(), target_id: Some(second.id.clone()), ..Default::default() }, day()).unwrap();
        let err = s.archive_target(&second.id, None).unwrap_err();
        assert_eq!(err.to_string(), "This target has applications. Move them to another target first.");
        assert!(!s.target(&second.id).unwrap().archived);
        assert!(s.archive_target(&second.id, Some(&second.id)).is_err(), "not to itself");
        s.archive_target(&second.id, Some(&first.id)).unwrap();
        assert_eq!(s.application(&app.id).unwrap().target_id, Some(first.id.clone()));
        assert!(s.target(&second.id).unwrap().archived);
    }

    #[test]
    fn applications_with_no_target_count_as_the_first_targets_when_archiving() {
        let (_d, s, first, second) = two_targets();
        let mut rec = s.create_application(NewApplication { company: "Old one".into(), ..Default::default() }, day()).unwrap();
        rec.target_id = None;
        s.save_application_record(&rec).unwrap();
        assert!(s.archive_target(&first.id, None).is_err(), "the unlabelled application belongs to the first target");
        s.archive_target(&first.id, Some(&second.id)).unwrap();
        assert_eq!(s.application(&rec.id).unwrap().target_id, Some(second.id));
    }

    #[test]
    fn nothing_moves_when_the_destination_is_archived() {
        let (_d, s, _first, second) = two_targets();
        let third = s.save_target(&Target::default()).unwrap();
        let app = s.create_application(NewApplication { company: "K".into(), target_id: Some(second.id.clone()), ..Default::default() }, day()).unwrap();
        s.archive_target(&third.id, None).unwrap();
        assert!(s.archive_target(&second.id, Some(&third.id)).is_err());
        assert_eq!(s.application(&app.id).unwrap().target_id, Some(second.id.clone()));
        assert!(!s.target(&second.id).unwrap().archived);
    }

    // ---------- who an application or a session belongs to ----------

    #[test]
    fn an_application_is_filed_under_the_target_it_names_else_the_active_one_and_an_archived_or_unknown_one_is_refused() {
        let (_d, s, first, second) = two_targets();
        s.set_active_target(&second.id).unwrap();
        let named = s.create_application(NewApplication { company: "A".into(), target_id: Some(first.id.clone()), ..Default::default() }, day()).unwrap();
        let default = s.create_application(NewApplication { company: "B".into(), ..Default::default() }, day()).unwrap();
        assert_eq!((named.target_id, default.target_id), (Some(first.id.clone()), Some(second.id.clone())));
        assert!(s.create_application(NewApplication { company: "C".into(), target_id: Some("tg_nope".into()), ..Default::default() }, day()).is_err());
        s.archive_target(&first.id, Some(&second.id)).unwrap();
        let err = s.create_application(NewApplication { company: "D".into(), target_id: Some(first.id), ..Default::default() }, day()).unwrap_err();
        assert_eq!(err.to_string(), "That target is archived. Restore it first.");
    }

    #[test]
    fn with_no_targets_yet_an_application_has_none() {
        let (_d, s) = fresh();
        assert_eq!(s.create_application(NewApplication { company: "A".into(), ..Default::default() }, day()).unwrap().target_id, None);
    }

    #[test]
    fn a_session_belongs_to_its_own_target_else_its_applications_else_the_first_one_in_use() {
        use crate::storage::reps::Session;
        let (_d, s, first, second) = two_targets();
        let on_second = s.create_application(NewApplication { company: "A".into(), target_id: Some(second.id.clone()), ..Default::default() }, day()).unwrap();
        let sess = |app: Option<&str>, target: Option<&str>| Session { id: "ses_1".into(), mode: "drill".into(), stage: "recruiter".into(), application_id: app.map(String::from), stage_id: None, started: "2026-10-20T10:00:00Z".into(), target_id: target.map(String::from) };
        assert_eq!(s.session_target(&sess(None, Some(&second.id))).unwrap(), Some(second.id.clone()));
        assert_eq!(s.session_target(&sess(Some(&on_second.id), None)).unwrap(), Some(second.id.clone()));
        assert_eq!(s.session_target(&sess(None, None)).unwrap(), Some(first.id.clone()), "an old session with no target is the first target's");
        assert_eq!(s.session_target(&sess(None, Some("tg_gone"))).unwrap(), Some(first.id.clone()));
        // New sessions: asked for, else the application's, else the active target.
        s.set_active_target(&second.id).unwrap();
        let app_on_first = s.create_application(NewApplication { company: "B".into(), target_id: Some(first.id.clone()), ..Default::default() }, day()).unwrap();
        assert_eq!(s.resolve_session_target(Some(&first.id), Some(&on_second)).unwrap(), Some(first.id.clone()));
        assert_eq!(s.resolve_session_target(None, Some(&app_on_first)).unwrap(), Some(first.id.clone()));
        assert_eq!(s.resolve_session_target(None, None).unwrap(), Some(second.id.clone()));
        assert_eq!(s.resolve_session_target(Some("tg_gone"), None).unwrap(), Some(second.id.clone()), "an unknown target is not stored");
    }

    // ---------- story priority ----------

    #[test]
    fn pinning_hiding_and_clearing_keep_a_story_in_at_most_one_list_in_pin_order() {
        let (_d, s, first, _second) = two_targets();
        let t = s.set_story_priority(&first.id, "st_a", "pin").unwrap();
        assert_eq!(t.pinned_story_ids, vec!["st_a"]);
        let t = s.set_story_priority(&first.id, "st_b", "pin").unwrap();
        assert_eq!(t.pinned_story_ids, vec!["st_a", "st_b"]);
        let t = s.set_story_priority(&first.id, "st_a", "hide").unwrap();
        assert_eq!((t.pinned_story_ids.clone(), t.hidden_story_ids.clone()), (vec!["st_b".to_string()], vec!["st_a".to_string()]));
        let t = s.set_story_priority(&first.id, "st_a", "pin").unwrap();
        assert_eq!((t.pinned_story_ids.clone(), t.hidden_story_ids.clone()), (vec!["st_b".to_string(), "st_a".to_string()], vec![]));
        let t = s.set_story_priority(&first.id, "st_b", "none").unwrap();
        assert_eq!((t.pinned_story_ids, t.hidden_story_ids), (vec!["st_a".to_string()], vec![]));
        assert_eq!(s.target(&first.id).unwrap().pinned_story_ids, vec!["st_a"], "saved");
        assert!(s.set_story_priority(&first.id, "st_a", "love").is_err());
        assert!(s.set_story_priority("tg_nope", "st_a", "pin").is_err());
    }

    // ---------- the merged profile and the legacy save ----------

    #[test]
    fn profile_is_you_plus_the_active_target_in_todays_shape() {
        let (_d, s, first, second) = two_targets();
        assert_eq!(s.profile().unwrap(), Some(profile()));
        s.set_active_target(&second.id).unwrap();
        let p = s.profile().unwrap().unwrap();
        assert_eq!((p.name.as_str(), p.target_role.as_str(), p.sells_to.as_str(), p.identity_statement.as_str()), ("Dana", "Marketing Operations Manager", "b2b", "I run the stack."));
        assert_eq!(p.focus_habits, profile().focus_habits, "habits stay combined across targets");
        let for_first = s.profile_for(Some(&first.id)).unwrap().unwrap();
        assert_eq!(for_first, profile());
        assert_eq!(s.profile_for(Some("tg_nope")).unwrap().unwrap().target_role, "Marketing Operations Manager", "a target that is gone falls back to the active one");
    }

    #[test]
    fn the_legacy_save_creates_target_one_on_first_setup_and_then_edits_the_active_target() {
        let (_d, s) = fresh();
        s.save_profile(&profile()).unwrap();
        assert!(!s.root().join("profile.json").exists(), "the old file is not written any more");
        let targets = s.targets().unwrap();
        assert_eq!(targets.len(), 1);
        let t = &targets[0];
        assert_eq!((t.name.as_str(), t.role_family.as_str(), t.color.as_str(), t.pitch.as_str()), ("B2C lifecycle", "lifecycle", "coral", "I find where activation breaks and build the fix."));
        assert_eq!(s.you().unwrap().unwrap().active_target_id, Some(t.id.clone()));
        assert_eq!(s.profile().unwrap(), Some(profile()));
        let mut changed = profile();
        changed.target_role = "Head of Lifecycle".into();
        changed.name = "Dana O.".into();
        changed.focus_habits = vec!["fillers".into()];
        changed.identity_statement = "New.".into();
        s.save_profile(&changed).unwrap();
        assert_eq!(s.targets().unwrap().len(), 1, "no second target");
        assert_eq!(s.profile().unwrap(), Some(changed));
    }

    #[test]
    fn the_legacy_save_edits_only_the_active_target() {
        let (_d, s, first, second) = two_targets();
        s.set_active_target(&second.id).unwrap();
        let mut p = s.profile().unwrap().unwrap();
        p.identity_statement = "Changed on the active one.".into();
        s.save_profile(&p).unwrap();
        assert_eq!(s.target(&second.id).unwrap().pitch, "Changed on the active one.");
        assert_eq!(s.target(&first.id).unwrap().pitch, profile().identity_statement);
    }

    #[test]
    fn the_legacy_save_makes_a_target_when_every_one_is_archived_or_missing() {
        let (_d, s) = fresh();
        s.save_you(&You { name: "Dana".into(), full_name: "".into(), focus_habits: vec![], active_target_id: None, targets_note_pending: false }).unwrap();
        s.save_profile(&profile()).unwrap();
        assert_eq!(s.targets().unwrap().len(), 1);
    }

    #[test]
    fn a_v0_profile_with_odd_words_in_it_becomes_a_target_that_can_still_be_saved() {
        let (_d, s) = fresh();
        let mut p = profile();
        p.sells_to = "everyone".into();
        p.seniority = "boss".into();
        s.save_profile(&p).unwrap();
        let t = s.targets().unwrap().remove(0);
        assert_eq!((t.sells_to.as_str(), t.seniority.as_str()), ("both", "senior"));
        assert!(s.save_target(&t).is_ok());
    }

    // ---------- helpers ----------

    #[test]
    fn colours_names_and_families_follow_the_plan() {
        assert_eq!([0, 1, 2, 3, 4, 5, 11].map(color_for), ["coral", "slate", "green", "gold", "plum", "coral", "slate"]);
        assert_eq!(target_name("Senior Lifecycle Marketing Manager", "b2c", "lifecycle"), "B2C lifecycle");
        assert_eq!(target_name("Marketing Operations Manager", "b2b", "marketing_ops"), "B2B marketing ops");
        assert_eq!(target_name("Head of Growth", "both", "growth"), "Both growth");
        assert_eq!(target_name("Chef", "both", "other"), "Chef");
        assert_eq!(target_name("", "both", "other"), "My target");
        for (role, family) in [("Senior Lifecycle Marketing Manager", "lifecycle"), ("CRM lead", "lifecycle"), ("Marketing Operations Manager", "marketing_ops"), ("Revenue Operations Analyst", "marketing_ops"), ("Head of Growth", "growth"), ("Product Marketing Manager", "product_marketing"), ("Poet", "other")] {
            assert_eq!(role_family_of(role), family, "{role}");
        }
    }

    #[test]
    fn methods_are_untouched_by_all_of_this() {
        let (_d, s, _a, _b) = two_targets();
        s.save_method(&Method { situation: "motivation".into(), spoken: "x".into(), story_ids: vec![] }).unwrap();
        assert_eq!(s.methods().unwrap().len(), 1);
    }
}
