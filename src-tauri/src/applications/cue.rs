//! The night before: lock an opener, one power story and two questions for a stage, and the cue sheet made from them
//! (opener beats, the power story as beats and numbers, the two questions; beats, never a script). When a resume is
//! attached, each locked number says what the resume says, with a marker when it does not match.

use super::inputs::norm;
use super::jd::story_headline;
use super::resume::bank_status;
use crate::metrics::numbers;
use crate::storage::application_files::{BankCheck, ClaimRec, ClaimsFile, Locked, LockedFile, ResumeRec};
use crate::storage::applications::{parse_at, stamp, stage_label};
use crate::storage::model::{ProofPoint, Story};
use crate::storage::{Result as StorageResult, Storage, StorageError};
use serde::{Deserialize, Serialize};

const DEFAULT_PROMPT: &str = "Tell me about yourself";
const REMINDERS: [&str; 3] = ["Answer first.", "One story.", "Stop when the number lands."];

#[derive(Debug, Clone, Deserialize)]
pub struct LockInput {
    pub opener: String,
    /// The question the opener answers; "Tell me about yourself" when left out.
    #[serde(default)]
    pub opener_prompt: Option<String>,
    /// A story id from the bank.
    pub power_story: String,
    /// At most two.
    #[serde(default)]
    pub questions: Vec<String>,
}

fn locked_file(storage: &Storage, id: &str) -> StorageResult<LockedFile> {
    Ok(storage.load_application_part::<LockedFile>(id, "locked.json")?.unwrap_or_default())
}

/// Locks the night-before set for one stage, replacing an earlier one.
pub fn save_locked(storage: &Storage, id: &str, stage_id: &str, input: LockInput) -> StorageResult<Locked> {
    let app = storage.application(id)?;
    app.stage_index(stage_id)?;
    let opener = input.opener.trim().to_string();
    if opener.is_empty() {
        return Err(StorageError::Invalid("Write your opener first.".into()));
    }
    if storage.story(&input.power_story).is_err() {
        return Err(StorageError::Invalid("That story isn't in your bank. Pick one of your stories.".into()));
    }
    let questions: Vec<String> = input.questions.iter().map(|q| q.trim().to_string()).filter(|q| !q.is_empty()).collect();
    if questions.len() > 2 {
        return Err(StorageError::Invalid("Lock two questions at most. Pick the two you most want answered.".into()));
    }
    let locked = Locked { opener_prompt: input.opener_prompt.map(|p| p.trim().to_string()).filter(|p| !p.is_empty()).unwrap_or_else(|| DEFAULT_PROMPT.to_string()), opener, power_story: input.power_story, questions, locked_on: stamp() };
    let mut file = locked_file(storage, id)?;
    file.by_stage.insert(stage_id.to_string(), locked.clone());
    storage.save_application_part(id, "locked.json", &file)?;
    Ok(locked)
}

pub fn load_locked(storage: &Storage, id: &str, stage_id: &str) -> StorageResult<Option<Locked>> {
    Ok(locked_file(storage, id)?.by_stage.get(stage_id).cloned())
}

/// Takes the lock off a stage.
pub fn clear_locked(storage: &Storage, id: &str, stage_id: &str) -> StorageResult<()> {
    let mut file = locked_file(storage, id)?;
    if file.by_stage.remove(stage_id).is_some() {
        storage.save_application_part(id, "locked.json", &file)?;
    }
    Ok(())
}

// ---------- the night-before card ----------

/// The lock as the Stages tab reads it (`NightBefore` in `src/data/screens/applications.ts`).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NightBeforeView {
    pub stage_id: String,
    pub opener_prompt: String,
    pub opener: String,
    pub power_story_id: String,
    /// "31% → 44%": what to say out loud for the power story.
    pub power_numbers: String,
    pub questions: Vec<String>,
    pub rehearse_minutes: u32,
}

/// "31% → 44%", "3 → 1 steps", "44%": a proof point as it is said.
pub fn point_value(p: &ProofPoint) -> String {
    let u = p.unit.trim();
    let side = |v: &str| if u == "%" { format!("{v}%") } else { v.to_string() };
    let suffix = if u.is_empty() || u == "%" { String::new() } else { format!(" {u}") };
    let (before, after) = (p.before.trim(), p.after.trim());
    if before.is_empty() { format!("{}{suffix}", side(after)) } else { format!("{} → {}{suffix}", side(before), side(after)) }
}

pub fn night_before_view(storage: &Storage, id: &str, stage_id: &str) -> StorageResult<Option<NightBeforeView>> {
    let Some(l) = load_locked(storage, id, stage_id)? else { return Ok(None) };
    let story = storage.story(&l.power_story).ok();
    let items = 2 + u32::from(!l.questions.is_empty());
    Ok(Some(NightBeforeView {
        stage_id: stage_id.to_string(),
        opener_prompt: l.opener_prompt,
        opener: l.opener,
        power_story_id: l.power_story,
        power_numbers: story.and_then(|s| s.proof_points.first().map(point_value)).unwrap_or_default(),
        questions: l.questions,
        rehearse_minutes: items * 2,
    }))
}

// ---------- the cue sheet ----------

/// The opener as beats: its lines, else its sentences, else its semicolon parts; six at most.
pub fn opener_beats(opener: &str) -> Vec<String> {
    let lines: Vec<String> = opener.lines().map(str::trim).filter(|l| !l.is_empty()).map(String::from).collect();
    let mut beats = if lines.len() > 1 {
        lines
    } else {
        let one = lines.into_iter().next().unwrap_or_default();
        if one.contains(';') {
            one.split(';').map(str::trim).filter(|p| !p.is_empty()).map(String::from).collect()
        } else {
            sentences(&one)
        }
    };
    beats.truncate(6);
    beats
}

fn sentences(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = text.trim();
    while !rest.is_empty() {
        match rest.find(". ") {
            Some(i) => {
                out.push(rest[..=i].trim().to_string());
                rest = rest[i + 2..].trim_start();
            }
            None => {
                out.push(rest.trim().to_string());
                break;
            }
        }
    }
    out
}

/// The first sentence of a story part, short enough to be a beat.
fn beat(text: &str) -> String {
    let first = sentences(text).into_iter().next().unwrap_or_default();
    if first.chars().count() <= 160 {
        return first.replace(" \u{2014} ", ", ");
    }
    let cut: String = first.chars().take(160).collect();
    let cut = cut.rsplit_once(' ').map(|(a, _)| a.to_string()).unwrap_or(cut);
    format!("{cut}...")
}

/// Wraps whole-number tokens that are one of the story's numbers in `**`, so the sheet shows them in bold.
fn bold_numbers(text: &str, values: &[String]) -> String {
    text.split(' ')
        .map(|tok| {
            let core = tok.trim_matches(|c: char| !(c.is_alphanumeric() || c == '%' || c == '.')).trim_end_matches('.');
            let bare = core.trim_end_matches('%');
            if !core.is_empty() && values.iter().any(|v| v == bare) {
                tok.replacen(core, &format!("**{core}**"), 1)
            } else {
                tok.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn branch_label(kind: &str) -> &'static str {
    match kind {
        "data" => "Data",
        "failure" => "Failure",
        "pushback" => "Pushback",
        "leadership" => "Leadership",
        "ambiguity" => "Ambiguity",
        "technical" => "Technical",
        "avoided_failure" => "Avoided failure",
        _ => "Branch",
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CueNumber {
    pub label: String,
    /// "31% → 44%".
    pub value: String,
    /// What the resume says about this number, when a resume with a matching line is attached.
    pub resume_says: Option<String>,
    /// The resume's number is not the story's. Only called against a story the user has checked.
    pub mismatch: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CuePower {
    /// Bold words are marked with double stars.
    pub headline: String,
    #[serde(rename = "headlineNote")]
    pub headline_note: String,
    pub noticed: String,
    pub decided: String,
    pub did: String,
    #[serde(rename = "didNote")]
    pub did_note: String,
    pub result: String,
    #[serde(rename = "ifPushed")]
    pub if_pushed: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Said {
    pub label: String,
    pub text: String,
}

/// What the cue sheet screen reads (`CueSheetData` in `src/data/screens/applications.ts`), plus the two questions, the
/// numbers with what the resume says, and the heading.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CueSheet {
    #[serde(rename = "openerBeats")]
    pub opener_beats: Vec<String>,
    pub power: CuePower,
    pub said: Vec<Said>,
    pub reminders: Vec<String>,
    pub company: String,
    /// "Hiring manager · Friday, October 23 · 2:00 PM".
    pub stage_line: String,
    pub opener_prompt: String,
    pub power_story_title: String,
    pub questions: Vec<String>,
    pub numbers: Vec<CueNumber>,
}

fn word_set(s: &str) -> std::collections::HashSet<String> {
    norm(s).split(' ').filter(|w| w.len() >= 3).map(String::from).collect()
}

fn digit_values(text: &str) -> Vec<f64> {
    numbers::extract(text).into_iter().filter(|n| n.raw.chars().next().is_some_and(|c| c.is_ascii_digit())).map(|n| n.value).collect()
}

/// For one number of the story: the resume line about the same thing, and whether it disagrees.
fn resume_line(story: &Story, point: &ProofPoint, claims: &[ClaimRec], resume: &ResumeRec, stories: &[Story]) -> (Option<String>, bool) {
    let mine = word_set(&format!("{} {}", point.metric, point.label.replace('_', " ")));
    let best = claims
        .iter()
        .filter(|c| c.stage == "resume" && c.kind == "proof_number" && c.superseded_by.is_none())
        .map(|c| (word_set(&format!("{} {}", c.subject, c.quote)).intersection(&mine).count(), c))
        .filter(|(n, _)| *n >= 1)
        .max_by_key(|(n, _)| *n);
    let Some((_, claim)) = best else { return (None, false) };
    let check: Option<&BankCheck> = resume.bank_check.iter().find(|b| b.claim_id == claim.id);
    let mismatch = match check {
        Some(b) => bank_status(Some(b), stories).0 == "differs",
        None => {
            let have: Vec<f64> = [point.before.as_str(), point.after.as_str()].iter().filter_map(|v| v.replace(',', "").trim().parse::<f64>().ok()).collect();
            let said = digit_values(&claim.value);
            story.verified && !said.is_empty() && !said.iter().all(|n| have.iter().any(|h| numbers::same(*h, *n)))
        }
    };
    (Some(claim.value.clone()), mismatch)
}

fn note(n: Option<&CueNumber>) -> String {
    match n.and_then(|n| n.resume_says.as_ref().map(|s| (s, n.mismatch))) {
        Some((says, true)) => format!("Resume says {says}"),
        Some((_, false)) => "Resume says the same".to_string(),
        None => String::new(),
    }
}

fn stage_line(label: &str, at: Option<&str>) -> String {
    let when = at.and_then(parse_at);
    let mut parts = vec![label.to_string()];
    if let Some((d, t)) = when {
        parts.push(d.format("%A, %B %-d").to_string());
        if let Some(t) = t {
            parts.push(t.format("%-I:%M %p").to_string());
        }
    }
    parts.join(" · ")
}

/// The things said the same way every time: the latest live claim of each kind the cue sheet lists.
fn said_lines(claims: &[ClaimRec]) -> Vec<Said> {
    [("availability", "Notice"), ("compensation", "Pay range"), ("reason_for_leaving", "Why leaving"), ("why_this_company", "Why this company")]
        .iter()
        .filter_map(|(kind, label)| {
            claims.iter().filter(|c| c.kind == *kind && c.superseded_by.is_none() && c.stage != "resume").next_back().map(|c| Said { label: label.to_string(), text: c.value.clone() })
        })
        .collect()
}

/// None when nothing is locked for the stage yet.
pub fn cue_sheet(storage: &Storage, id: &str, stage_id: &str) -> StorageResult<Option<CueSheet>> {
    let app = storage.application(id)?;
    let stage = app.process[app.stage_index(stage_id)?].clone();
    let Some(locked) = load_locked(storage, id, stage_id)? else { return Ok(None) };
    let stories = storage.load_stories()?.items;
    let story = stories.iter().find(|s| s.id == locked.power_story).cloned();
    let claims = storage.load_application_part::<ClaimsFile>(id, "claims.json")?.unwrap_or_default().claims;
    let resume = storage.load_application_part::<ResumeRec>(id, "resume/resume.json")?;
    let mut numbers = Vec::new();
    if let Some(s) = &story {
        for p in &s.proof_points {
            let (says, mismatch) = resume.as_ref().map(|r| resume_line(s, p, &claims, r, &stories)).unwrap_or((None, false));
            numbers.push(CueNumber { label: if p.metric.trim().is_empty() { p.label.clone() } else { p.metric.clone() }, value: point_value(p), resume_says: says, mismatch });
        }
    }
    let power = match &story {
        Some(s) => {
            let values: Vec<String> = s.proof_points.iter().flat_map(|p| [p.before.trim().to_string(), p.after.trim().to_string()]).filter(|v| !v.is_empty()).collect();
            let headline = match (s.proof_points.first(), numbers.first()) {
                (Some(p), Some(n)) => format!("{} **{}**", if p.metric.trim().is_empty() { &p.label } else { &p.metric }, n.value),
                _ => {
                    let h = story_headline(s);
                    if h.is_empty() { beat(&s.direct_answer) } else { h }
                }
            };
            let result = {
                let r = bold_numbers(&beat(&s.result), &values);
                match (r.is_empty(), s.scale.trim().is_empty()) {
                    (_, true) => r,
                    (true, false) => s.scale.trim().to_string(),
                    (false, false) => format!("{r} · {}", s.scale.trim()),
                }
            };
            let pushed = s.branches.iter().take(2).map(|b| format!("{}: {}", branch_label(&b.kind), b.angle.trim())).collect::<Vec<_>>().join(". ");
            CuePower { headline, headline_note: note(numbers.first()), noticed: beat(&s.context), decided: beat(&s.approach), did: beat(&s.action), did_note: note(numbers.get(1)), result, if_pushed: pushed }
        }
        None => CuePower { headline: "Pick a story from your bank.".into(), headline_note: String::new(), noticed: String::new(), decided: String::new(), did: String::new(), did_note: String::new(), result: String::new(), if_pushed: String::new() },
    };
    Ok(Some(CueSheet {
        opener_beats: opener_beats(&locked.opener),
        power,
        said: said_lines(&claims),
        reminders: REMINDERS.iter().map(|r| r.to_string()).collect(),
        company: app.company.clone(),
        stage_line: stage_line(if stage.label.is_empty() { stage_label(&stage.stage) } else { &stage.label }, stage.at.as_deref()),
        opener_prompt: locked.opener_prompt,
        power_story_title: story.map(|s| s.title).unwrap_or_default(),
        questions: locked.questions,
        numbers,
    }))
}

/// The cue sheet as Markdown, for "Markdown" in the export (the PDF is the screen printed).
pub fn cue_sheet_markdown(storage: &Storage, id: &str, stage_id: &str) -> StorageResult<String> {
    let Some(c) = cue_sheet(storage, id, stage_id)? else {
        let app = storage.application(id)?;
        let stage = app.process[app.stage_index(stage_id)?].clone();
        return Ok(format!("# {}\n\n{}\n\nNothing is locked yet. Lock an opener, one power story and two questions on the night-before page.\n", app.company, stage_line(if stage.label.is_empty() { stage_label(&stage.stage) } else { &stage.label }, stage.at.as_deref())));
    };
    let mut md: Vec<String> = vec![format!("# {}", c.company), c.stage_line.clone(), String::new(), format!("## Opener, {}", c.opener_prompt.to_lowercase())];
    md.extend(c.opener_beats.iter().map(|b| format!("- {b}")));
    md.push(String::new());
    md.push(format!("## Power story, {}", c.power_story_title.to_lowercase()));
    let line = |label: &str, text: &str, note: &str| -> Option<String> {
        (!text.is_empty()).then(|| if note.is_empty() { format!("- **{label}:** {text}") } else { format!("- **{label}:** {text} ({note})") })
    };
    md.extend(line("Headline", &c.power.headline, &c.power.headline_note));
    md.extend(line("Noticed", &c.power.noticed, ""));
    md.extend(line("Decided", &c.power.decided, ""));
    md.extend(line("Did", &c.power.did, &c.power.did_note));
    md.extend(line("Result", &c.power.result, ""));
    md.extend(line("If pushed", &c.power.if_pushed, ""));
    if !c.numbers.is_empty() {
        md.push(String::new());
        md.push("## Numbers".to_string());
        for n in &c.numbers {
            let mut l = format!("- {}: {}.", n.label, n.value);
            if let Some(says) = &n.resume_says {
                l.push_str(&format!(" Resume says {says}."));
            }
            if n.mismatch {
                l.push_str(" MISMATCH");
            }
            md.push(l);
        }
    }
    md.push(String::new());
    md.push("## Ask them".to_string());
    if c.questions.is_empty() {
        md.push("No questions picked yet.".to_string());
    }
    md.extend(c.questions.iter().enumerate().map(|(i, q)| format!("{}. {q}", i + 1)));
    if !c.said.is_empty() {
        md.push(String::new());
        md.push("## Say the same way every time".to_string());
        md.extend(c.said.iter().map(|s| format!("- **{}:** {}", s.label, s.text)));
    }
    md.push(String::new());
    md.push(c.reminders.join(" "));
    md.push(String::new());
    Ok(md.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::application_files::{BankCheck, ClaimRec, ClaimsFile, ResumeRec};
    use crate::storage::applications::NewApplication;
    use crate::storage::model::{Branch, ProofPoint, Usage};
    use chrono::NaiveDate;

    fn story(verified: bool) -> Story {
        Story {
            id: "st_onboarding".into(),
            title: "Onboarding drop-off".into(),
            employer: "Fernhill".into(),
            best_for: vec![],
            direct_answer: "I moved seven-day activation from 31 to 44 percent by fixing what happened after signup, not the emails.".into(),
            context: "People clicked the emails, then stalled on bank linking. Everyone blamed the copy.".into(),
            approach: "I decided the fix was the handoff. I chose seven-day activation to prove it.".into(),
            action: "I rebuilt the trigger so it fired on the stall. I cut the screen from three steps to one with design.".into(),
            ownership: "".into(),
            result: "Within a quarter, seven-day activation went from 31 to 44 percent. Opens held.".into(),
            proof_points: vec![
                ProofPoint { label: "activation_7d".into(), metric: "7-day activation".into(), before: "31".into(), after: "44".into(), unit: "%".into(), approximate: false, verified },
                ProofPoint { label: "bank_link_steps".into(), metric: "Bank-linking steps".into(), before: "3".into(), after: "1".into(), unit: "steps".into(), approximate: false, verified },
            ],
            scale: "About 40k signups a quarter".into(),
            competencies: vec![],
            great_eight: vec![],
            branches: vec![
                Branch { kind: "data".into(), trigger: "How did you find it?".into(), angle: "Funnel by step".into() },
                Branch { kind: "failure".into(), trigger: "What went wrong?".into(), angle: "First trigger fired mid-flow, moved to 20 minutes".into() },
                Branch { kind: "pushback".into(), trigger: "x".into(), angle: "never shown, only two branches".into() },
            ],
            verified,
            headline: "7-day activation 31% → 44%".into(),
            usage: Usage::default(),
            year: None,
            angles: vec![],
        }
    }

    fn setup(verified: bool) -> (tempfile::TempDir, Storage, String) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::init(dir.path().join("data")).unwrap();
        s.save_story(&story(verified)).unwrap();
        let app = s.create_application(NewApplication { company: "Kestrel Pay".into(), role: "Lifecycle".into(), ..Default::default() }, NaiveDate::from_ymd_opt(2026, 10, 6).unwrap()).unwrap();
        s.set_stage_time(&app.id, "stg_2", Some("2026-10-23T14:00")).unwrap();
        (dir, s, app.id)
    }

    fn lock(s: &Storage, id: &str) -> Locked {
        save_locked(s, id, "stg_2", LockInput { opener: "Lifecycle marketer, I find where activation breaks.\nNow: Fernhill, owning onboarding.\nBefore: Brightwave, email.".into(), opener_prompt: None, power_story: "st_onboarding".into(), questions: vec!["How will you judge this hire?".into(), "What is in the way?".into()] }).unwrap()
    }

    fn resume_claim(id: &str, subject: &str, value: &str) -> ClaimRec {
        ClaimRec { id: id.into(), kind: "proof_number".into(), subject: subject.into(), value: value.into(), quote: value.into(), stage: "resume".into(), stage_ref: "resume".into(), rep: None, updated: "x".into(), superseded_by: None, edited_by_user: vec![], source: "resume".into(), conflict: None }
    }

    /// A resume was read: two numbers, one of which differs from the story.
    fn with_resume(s: &Storage, id: &str, checks: Vec<BankCheck>) {
        let mut file = ClaimsFile::default();
        file.claims = vec![resume_claim("cl_1", "7-day activation, Fernhill onboarding", "31% to 44%"), resume_claim("cl_2", "Bank-linking steps", "5 steps to 1")];
        file.next_n = 2;
        s.save_application_part(id, "claims.json", &file).unwrap();
        let rec = ResumeRec { file_name: "Dana.pdf".into(), kind: "pdf".into(), file: Some("resume.pdf".into()), file_hash: "x".into(), pages: 1, attached_on: "x".into(), status: "read".into(), text_source: "file".into(), read_on: Some("x".into()), engine: Some("ai".into()), prompt: None, must_say_state: "ready".into(), bank_check: checks, must_say: vec![], mocks_checked: 0, story_suggestions: vec![] };
        s.save_application_part(id, "resume/resume.json", &rec).unwrap();
    }

    fn model_checks() -> Vec<BankCheck> {
        vec![
            BankCheck { claim_id: "cl_1".into(), result: "matches".into(), story_id: Some("st_onboarding".into()), note: "Matches.".into() },
            BankCheck { claim_id: "cl_2".into(), result: "differs".into(), story_id: Some("st_onboarding".into()), note: "Resume 5 steps to 1, story 3 steps to 1.".into() },
        ]
    }

    // ---------- the lock ----------

    #[test]
    fn the_night_before_set_is_saved_per_stage_and_replaced_when_locked_again() {
        let (_d, s, id) = setup(true);
        let l = lock(&s, &id);
        assert_eq!((l.power_story.as_str(), l.opener_prompt.as_str(), l.questions.len()), ("st_onboarding", "Tell me about yourself", 2));
        assert_eq!(load_locked(&s, &id, "stg_2").unwrap().unwrap(), l);
        assert!(load_locked(&s, &id, "stg_3").unwrap().is_none(), "another stage has its own lock");
        let again = save_locked(&s, &id, "stg_2", LockInput { opener: "A shorter opener.".into(), opener_prompt: Some("Walk me through your background".into()), power_story: "st_onboarding".into(), questions: vec!["One question?".into()] }).unwrap();
        assert_eq!(load_locked(&s, &id, "stg_2").unwrap().unwrap(), again);
        assert_eq!((again.opener.as_str(), again.opener_prompt.as_str(), again.questions.len()), ("A shorter opener.", "Walk me through your background", 1));
        let file = std::fs::read_to_string(s.application_path(&id, "locked.json").unwrap()).unwrap();
        assert!(file.contains("\"schema_version\": 1") && file.contains("stg_2"), "{file}");
    }

    #[test]
    fn a_lock_needs_a_real_stage_a_story_from_the_bank_an_opener_and_at_most_two_questions() {
        let (_d, s, id) = setup(true);
        let ok = || LockInput { opener: "Opener".into(), opener_prompt: None, power_story: "st_onboarding".into(), questions: vec![] };
        assert!(save_locked(&s, &id, "stg_99", ok()).is_err());
        assert!(save_locked(&s, &id, "stg_2", LockInput { power_story: "st_nope".into(), ..ok() }).unwrap_err().to_string().contains("bank"));
        assert!(save_locked(&s, &id, "stg_2", LockInput { opener: "  ".into(), ..ok() }).is_err());
        assert!(save_locked(&s, &id, "stg_2", LockInput { questions: vec!["a".into(), "b".into(), "c".into()], ..ok() }).unwrap_err().to_string().contains("two"));
        let trimmed = save_locked(&s, &id, "stg_2", LockInput { questions: vec![" a? ".into(), "".into()], ..ok() }).unwrap();
        assert_eq!(trimmed.questions, vec!["a?"], "blank questions are not kept");
        assert!(load_locked(&s, "../x", "stg_2").is_err());
    }

    #[test]
    fn a_removed_stage_takes_its_lock_with_it() {
        let (_d, s, id) = setup(true);
        lock(&s, &id);
        s.remove_stage(&id, "stg_2", true).unwrap();
        assert!(load_locked(&s, &id, "stg_2").unwrap().is_none());
    }

    #[test]
    fn the_night_before_card_shows_the_lock_in_the_shape_the_screen_reads() {
        let (_d, s, id) = setup(true);
        assert!(night_before_view(&s, &id, "stg_2").unwrap().is_none());
        lock(&s, &id);
        let nb = night_before_view(&s, &id, "stg_2").unwrap().unwrap();
        assert_eq!((nb.stage_id.as_str(), nb.power_story_id.as_str(), nb.power_numbers.as_str()), ("stg_2", "st_onboarding", "31% → 44%"));
        assert_eq!(nb.opener_prompt, "Tell me about yourself");
        assert!(nb.opener.starts_with("Lifecycle marketer"));
        assert_eq!(nb.questions.len(), 2);
        assert_eq!(nb.rehearse_minutes, 6, "three things, two minutes each");
        let json = serde_json::to_value(&nb).unwrap();
        assert!(json.get("stageId").is_some() && json.get("openerPrompt").is_some() && json.get("powerStoryId").is_some() && json.get("powerNumbers").is_some() && json.get("rehearseMinutes").is_some(), "{json}");
    }

    // ---------- the cue sheet ----------

    #[test]
    fn nothing_locked_means_no_cue_sheet_yet() {
        let (_d, s, id) = setup(true);
        assert!(cue_sheet(&s, &id, "stg_2").unwrap().is_none());
        let md = cue_sheet_markdown(&s, &id, "stg_2").unwrap();
        assert!(md.starts_with("# Kestrel Pay") && md.contains("Nothing is locked yet"), "{md}");
    }

    #[test]
    fn the_cue_sheet_has_the_openers_beats_the_power_story_as_beats_and_numbers_and_the_two_questions() {
        let (_d, s, id) = setup(true);
        lock(&s, &id);
        let c = cue_sheet(&s, &id, "stg_2").unwrap().unwrap();
        assert_eq!(c.opener_beats, vec!["Lifecycle marketer, I find where activation breaks.", "Now: Fernhill, owning onboarding.", "Before: Brightwave, email."]);
        assert_eq!(c.power.headline, "7-day activation **31% → 44%**");
        assert_eq!(c.power.noticed, "People clicked the emails, then stalled on bank linking.");
        assert_eq!(c.power.decided, "I decided the fix was the handoff.");
        assert_eq!(c.power.did, "I rebuilt the trigger so it fired on the stall.");
        assert_eq!(c.power.result, "Within a quarter, seven-day activation went from **31** to **44** percent. · About 40k signups a quarter");
        assert_eq!(c.power.if_pushed, "Data: Funnel by step. Failure: First trigger fired mid-flow, moved to 20 minutes");
        assert_eq!(c.questions, vec!["How will you judge this hire?", "What is in the way?"]);
        assert_eq!(c.numbers.iter().map(|n| (n.label.as_str(), n.value.as_str())).collect::<Vec<_>>(), vec![("7-day activation", "31% → 44%"), ("Bank-linking steps", "3 → 1 steps")]);
        assert!(c.numbers.iter().all(|n| n.resume_says.is_none() && !n.mismatch), "no resume, nothing to compare");
        assert_eq!(c.power.headline_note, "");
        assert_eq!(c.reminders, vec!["Answer first.", "One story.", "Stop when the number lands."]);
        assert_eq!((c.company.as_str(), c.stage_line.as_str()), ("Kestrel Pay", "Hiring manager · Friday, October 23 · 2:00 PM"));
        let json = serde_json::to_value(&c).unwrap();
        for key in ["openerBeats", "power", "said", "reminders"] {
            assert!(json.get(key).is_some(), "{key} in {json}");
        }
        for key in ["headline", "headlineNote", "noticed", "decided", "did", "didNote", "result", "ifPushed"] {
            assert!(json["power"].get(key).is_some(), "{key}");
        }
    }

    #[test]
    fn what_was_said_the_same_way_every_time_comes_from_the_claims_log_latest_first() {
        let (_d, s, id) = setup(true);
        lock(&s, &id);
        let mut file = ClaimsFile::default();
        let mk = |n: u32, kind: &str, value: &str, superseded: bool| ClaimRec { id: format!("cl_{n}"), kind: kind.into(), subject: kind.into(), value: value.into(), quote: value.into(), stage: "stg_1".into(), stage_ref: "recruiter".into(), rep: None, updated: "x".into(), superseded_by: superseded.then(|| "cl_9".into()), edited_by_user: vec![], source: "answer".into(), conflict: None };
        file.claims = vec![mk(1, "availability", "four weeks", true), mk(2, "reason_for_leaving", "to own lifecycle end to end", false), mk(3, "availability", "two weeks", false), mk(4, "proof_number", "31% to 44%", false)];
        file.next_n = 4;
        s.save_application_part(&id, "claims.json", &file).unwrap();
        let said = cue_sheet(&s, &id, "stg_2").unwrap().unwrap().said;
        assert_eq!(said.iter().map(|x| (x.label.as_str(), x.text.as_str())).collect::<Vec<_>>(), vec![("Notice", "two weeks"), ("Why leaving", "to own lifecycle end to end")]);
    }

    #[test]
    fn with_a_resume_each_locked_number_says_what_the_resume_says_and_marks_a_mismatch() {
        let (_d, s, id) = setup(true);
        lock(&s, &id);
        with_resume(&s, &id, model_checks());
        let c = cue_sheet(&s, &id, "stg_2").unwrap().unwrap();
        assert_eq!(c.numbers[0].resume_says.as_deref(), Some("31% to 44%"));
        assert!(!c.numbers[0].mismatch);
        assert_eq!(c.numbers[1].resume_says.as_deref(), Some("5 steps to 1"));
        assert!(c.numbers[1].mismatch, "the resume says 5 steps, the story says 3");
        assert_eq!(c.power.headline_note, "Resume says the same");
        assert_eq!(c.power.did_note, "Resume says 5 steps to 1");
    }

    #[test]
    fn a_mismatch_needs_a_checked_story_and_a_reading_without_an_engine_is_compared_by_the_numbers() {
        // The story's numbers are not ticked as checked: no ruling.
        let (_d, s, id) = setup(false);
        lock(&s, &id);
        with_resume(&s, &id, model_checks());
        let c = cue_sheet(&s, &id, "stg_2").unwrap().unwrap();
        assert!(c.numbers.iter().all(|n| !n.mismatch));
        assert_eq!(c.numbers[1].resume_says.as_deref(), Some("5 steps to 1"), "it still says what the resume says");
        // No bank check at all (a pattern reading) and a checked story: the numbers decide.
        let (_d2, s2, id2) = setup(true);
        lock(&s2, &id2);
        with_resume(&s2, &id2, vec![]);
        let c = cue_sheet(&s2, &id2, "stg_2").unwrap().unwrap();
        assert!(!c.numbers[0].mismatch && c.numbers[1].mismatch);
    }

    #[test]
    fn the_markdown_export_has_every_section_and_a_plain_text_mismatch_marker() {
        let (_d, s, id) = setup(true);
        lock(&s, &id);
        with_resume(&s, &id, model_checks());
        let md = cue_sheet_markdown(&s, &id, "stg_2").unwrap();
        for part in [
            "# Kestrel Pay",
            "Hiring manager · Friday, October 23 · 2:00 PM",
            "## Opener, tell me about yourself",
            "- Lifecycle marketer, I find where activation breaks.",
            "## Power story, onboarding drop-off",
            "- **Headline:** 7-day activation **31% → 44%** (Resume says the same)",
            "- **Noticed:** People clicked the emails, then stalled on bank linking.",
            "- **If pushed:** Data: Funnel by step.",
            "## Numbers",
            "- Bank-linking steps: 3 → 1 steps. Resume says 5 steps to 1. MISMATCH",
            "- 7-day activation: 31% → 44%. Resume says 31% to 44%.",
            "## Ask them",
            "1. How will you judge this hire?",
            "2. What is in the way?",
            "Answer first. One story. Stop when the number lands.",
        ] {
            assert!(md.contains(part), "missing {part:?} in\n{md}");
        }
        assert!(!md.contains('\u{2014}'), "no em dashes");
        assert!(!md.contains("Decided:") || md.contains("I decided the fix"), "an empty beat is left out, not printed blank");
    }

    #[test]
    fn a_beat_that_is_empty_in_the_story_is_left_out_of_the_markdown() {
        let (_d, s, id) = setup(true);
        let mut st = story(true);
        st.approach = "".into();
        s.save_story(&st).unwrap();
        lock(&s, &id);
        let md = cue_sheet_markdown(&s, &id, "stg_2").unwrap();
        assert!(!md.contains("**Decided:**"), "{md}");
        assert!(md.contains("**Did:**"));
    }

    #[test]
    fn the_openers_beats_are_lines_or_sentences_and_never_more_than_six() {
        assert_eq!(opener_beats("One. Two. Three."), vec!["One.", "Two.", "Three."]);
        assert_eq!(opener_beats("First beat; second beat; third beat"), vec!["First beat", "second beat", "third beat"]);
        assert_eq!(opener_beats("Line one\n\nLine two\n"), vec!["Line one", "Line two"]);
        assert_eq!(opener_beats("a. b. c. d. e. f. g. h.").len(), 6);
        assert!(opener_beats("   ").is_empty());
    }
}
