//! After the interview: the person writes what happened (how it went, what they were asked, what worked, what they
//! would change, who they spoke to, what is next). It is kept next to the application in `interviews.json`, one note
//! per stage. The questions they were asked also go into the application's question set with source `asked`, so the
//! next stage's practice uses them. Nothing here calls a model: the note is the person's own words.

use crate::storage::application_files::{question_key, InterviewNote, InterviewsFile, QuestionRec, QuestionsFile};
use crate::storage::applications::stamp;
use crate::storage::io::is_safe_id;
use crate::storage::{Result as StorageResult, Storage, StorageError};
use chrono::{Local, NaiveDate};
use serde::{Deserialize, Serialize};

const FILE: &str = "interviews.json";

/// What the screen sends. `held_on` left out means today.
#[derive(Debug, Clone, Deserialize)]
pub struct NoteInput {
    pub stage_id: String,
    #[serde(default)]
    pub held_on: Option<String>,
    #[serde(default)]
    pub rating: Option<u8>,
    #[serde(default)]
    pub asked: Vec<String>,
    #[serde(default)]
    pub worked: String,
    #[serde(default)]
    pub differently: String,
    #[serde(default)]
    pub spoke_to: String,
    #[serde(default)]
    pub next_step: String,
}

/// The notes as the screens read them (`InterviewNote` in `src/data/screens/applications.ts`).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteView {
    pub stage_id: String,
    pub held_on: String,
    pub rating: Option<u8>,
    pub asked: Vec<String>,
    pub worked: String,
    pub differently: String,
    pub spoke_to: String,
    pub next_step: String,
    pub created: String,
    pub edited: String,
}

impl From<InterviewNote> for NoteView {
    fn from(n: InterviewNote) -> Self {
        NoteView { stage_id: n.stage_id, held_on: n.held_on, rating: n.rating, asked: n.asked, worked: n.worked, differently: n.differently, spoke_to: n.spoke_to, next_step: n.next_step, created: n.created, edited: n.edited }
    }
}

fn file_of(storage: &Storage, id: &str) -> StorageResult<InterviewsFile> {
    Ok(storage.load_application_part::<InterviewsFile>(id, FILE)?.unwrap_or_default())
}

/// The notes of an application, oldest stage first as they were kept.
pub fn load_notes(storage: &Storage, id: &str) -> StorageResult<Vec<InterviewNote>> {
    Ok(file_of(storage, id)?.notes)
}

/// Whether asked questions come first in a later stage's Drill (on unless the person turned it off).
pub fn asked_first(storage: &Storage, id: &str) -> StorageResult<bool> {
    Ok(file_of(storage, id)?.asked_first)
}

/// One question per line: trimmed, empty lines dropped, the same question once (compared as normalised text), order kept.
pub fn clean_asked(lines: &[String]) -> Vec<String> {
    let mut seen: Vec<String> = Vec::new();
    let mut out = Vec::new();
    for l in lines.iter().flat_map(|l| l.lines()) {
        let t = l.split_whitespace().collect::<Vec<_>>().join(" ");
        if t.is_empty() {
            continue;
        }
        let key = question_key(&t);
        if !seen.contains(&key) {
            seen.push(key);
            out.push(t);
        }
    }
    out
}

/// A guess at the kind of a question from its words; `behavioral` when nothing points elsewhere.
pub fn guess_kind(text: &str) -> &'static str {
    let t = text.to_lowercase();
    let has = |words: &[&str]| words.iter().any(|w| t.contains(w));
    if has(&["tell me about yourself", "walk me through your", "your background", "introduce yourself"]) {
        "tell_me_about_yourself"
    } else if has(&["salary", "compensation", "pay range", "notice period", "when can you start", "how soon", "visa", "relocate", "work authorization", "work authorisation", "how much"]) {
        "factual"
    } else if t.trim_start().starts_with("why ") || has(&["what motivates", "what interests you"]) {
        "motivation"
    } else if has(&["where do you see", "five years", "5 years", "first 90 days", "first 60 days", "first 30 days", "how would you approach", "what would you do"]) {
        "future_looking"
    } else {
        "behavioral"
    }
}

fn check_ids(storage: &Storage, id: &str, stage_id: &str) -> StorageResult<()> {
    storage.application_dir(id)?;
    if !is_safe_id(stage_id) {
        return Err(StorageError::Invalid(format!("\"{stage_id}\" is not a valid id")));
    }
    Ok(())
}

fn check_date(s: &str) -> StorageResult<String> {
    NaiveDate::parse_from_str(s.trim(), "%Y-%m-%d").map(|d| d.format("%Y-%m-%d").to_string()).map_err(|_| StorageError::Invalid(format!("\"{s}\" is not a date (use 2026-10-23).")))
}

/// Saves the note for a stage (replacing the one there), marks the stage done, and puts the questions they were asked
/// into the application's question set. A question already there for that stage (same words) is left as it is.
pub fn save_note(storage: &Storage, id: &str, input: NoteInput, today: NaiveDate) -> StorageResult<InterviewNote> {
    check_ids(storage, id, &input.stage_id)?;
    let app = storage.application(id)?;
    let stage = app.process.iter().find(|p| p.id == input.stage_id).ok_or_else(|| StorageError::NotFound(format!("stage {}", input.stage_id)))?;
    if let Some(r) = input.rating {
        if !(1..=5).contains(&r) {
            return Err(StorageError::Invalid("How it went is a number from 1 to 5.".into()));
        }
    }
    let held_on = match input.held_on.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(d) => check_date(d)?,
        None => today.format("%Y-%m-%d").to_string(),
    };
    let asked = clean_asked(&input.asked);
    let mut file = file_of(storage, id)?;
    let now = stamp();
    let created = file.notes.iter().find(|n| n.stage_id == input.stage_id).map(|n| n.created.clone()).filter(|c| !c.is_empty()).unwrap_or_else(|| now.clone());
    let note = InterviewNote {
        stage_id: input.stage_id.clone(),
        held_on,
        rating: input.rating,
        asked,
        worked: input.worked.trim().to_string(),
        differently: input.differently.trim().to_string(),
        spoke_to: input.spoke_to.trim().to_string(),
        next_step: input.next_step.trim().to_string(),
        created,
        edited: now,
    };
    match file.notes.iter().position(|n| n.stage_id == note.stage_id) {
        Some(i) => file.notes[i] = note.clone(),
        None => file.notes.push(note.clone()),
    }
    let order = |n: &InterviewNote| app.process.iter().position(|p| p.id == n.stage_id).unwrap_or(usize::MAX);
    file.notes.sort_by_key(order);
    storage.save_application_part(id, FILE, &file)?;
    bank_asked(storage, id, &stage.id, &stage.stage, &note.asked)?;
    storage.set_stage_done(id, &input.stage_id, true)?;
    Ok(note)
}

/// Adds each asked question to the question set as `asked` for this stage. The person's own words are kept: one that is
/// already there (same normalised text, same stage) is not touched. One they had taken out comes back, since they
/// wrote it down again.
fn bank_asked(storage: &Storage, id: &str, stage_id: &str, stage: &str, asked: &[String]) -> StorageResult<()> {
    if asked.is_empty() {
        return Ok(());
    }
    let app = storage.application(id)?;
    let mut file = storage.load_application_part::<QuestionsFile>(id, "questions.json")?.unwrap_or_default();
    let mut changed = false;
    for text in asked {
        let key = question_key(text);
        if file.questions.iter().any(|q| q.stage_id == stage_id && question_key(&q.text) == key) {
            continue;
        }
        file.deleted.retain(|d| d != &key);
        let rec = QuestionRec {
            id: file.new_id(),
            stage_id: stage_id.to_string(),
            stage: stage.to_string(),
            text: text.clone(),
            kind: guess_kind(text).to_string(),
            behavioral_situation: None,
            commitment_check: false,
            builder_operator_check: false,
            best_story_id: None,
            why: String::new(),
            requirement: None,
            source: "asked".into(),
            edited_by_user: true,
        };
        file.questions.push(rec);
        changed = true;
    }
    if changed {
        let order = |q: &QuestionRec| app.process.iter().position(|p| p.id == q.stage_id).unwrap_or(usize::MAX);
        file.questions.sort_by_key(order);
        storage.save_application_part(id, "questions.json", &file)?;
    }
    Ok(())
}

/// Removes the note for a stage. The questions already in the question set stay there (they are the person's now).
pub fn delete_note(storage: &Storage, id: &str, stage_id: &str) -> StorageResult<()> {
    check_ids(storage, id, stage_id)?;
    let mut file = file_of(storage, id)?;
    let before = file.notes.len();
    file.notes.retain(|n| n.stage_id != stage_id);
    if file.notes.len() != before {
        storage.save_application_part(id, FILE, &file)?;
    }
    Ok(())
}

/// The switch on the Questions tab.
pub fn set_asked_first(storage: &Storage, id: &str, on: bool) -> StorageResult<()> {
    storage.application_dir(id)?;
    let mut file = file_of(storage, id)?;
    if file.asked_first != on {
        file.asked_first = on;
        storage.save_application_part(id, FILE, &file)?;
    }
    Ok(())
}

/// A question taken out of the question set that was an `asked` one also leaves the note (one list, two views).
pub fn forget_asked(storage: &Storage, id: &str, stage_id: &str, text: &str) -> StorageResult<()> {
    let Some(mut file) = storage.load_application_part::<InterviewsFile>(id, FILE)? else { return Ok(()) };
    let key = question_key(text);
    let mut changed = false;
    for n in file.notes.iter_mut().filter(|n| n.stage_id == stage_id) {
        let before = n.asked.len();
        n.asked.retain(|a| question_key(a) != key);
        changed |= n.asked.len() != before;
    }
    if changed {
        storage.save_application_part(id, FILE, &file)?;
    }
    Ok(())
}

pub fn today() -> NaiveDate {
    Local::now().date_naive()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::applications::NewApplication;
    use serde_json::Value;

    fn setup() -> (tempfile::TempDir, Storage, String) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::init(dir.path().join("data")).unwrap();
        let day = NaiveDate::from_ymd_opt(2026, 10, 14).unwrap();
        let a = s.create_application(NewApplication { company: "Kestrel Pay".into(), ..Default::default() }, day).unwrap();
        (dir, s, a.id)
    }

    fn input(stage: &str, asked: &[&str]) -> NoteInput {
        NoteInput { stage_id: stage.into(), held_on: Some("2026-10-14".into()), rating: Some(4), asked: asked.iter().map(|s| s.to_string()).collect(), worked: "The activation story".into(), differently: "Slow down on pay".into(), spoke_to: "Priya".into(), next_step: "Hiring manager call next week".into() }
    }

    fn day() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 10, 15).unwrap()
    }

    fn questions(s: &Storage, id: &str) -> Vec<QuestionRec> {
        s.load_application_part::<QuestionsFile>(id, "questions.json").unwrap().map(|f| f.questions).unwrap_or_default()
    }

    #[test]
    fn a_note_round_trips_with_a_schema_version_and_saving_again_replaces_it() {
        let (_d, s, id) = setup();
        assert!(load_notes(&s, &id).unwrap().is_empty(), "no file yet: no notes");
        let saved = save_note(&s, &id, input("stg_1", &["What is your notice period?"]), day()).unwrap();
        assert_eq!(saved.held_on, "2026-10-14");
        let raw: Value = serde_json::from_str(&s.application_text(&id, "interviews.json").unwrap().unwrap()).unwrap();
        assert_eq!(raw["schema_version"], 1);
        assert_eq!(raw["notes"][0]["stage_id"], "stg_1");
        assert_eq!(raw["notes"][0]["rating"], 4);
        let again = save_note(&s, &id, NoteInput { worked: "Changed".into(), ..input("stg_1", &["What is your notice period?"]) }, day()).unwrap();
        let notes = load_notes(&s, &id).unwrap();
        assert_eq!(notes.len(), 1, "one note per stage");
        assert_eq!(notes[0].worked, "Changed");
        assert_eq!(again.created, saved.created, "the first writing time is kept");
        assert!(s.application(&id).unwrap().process[0].done, "the stage is done once it is written down");
    }

    #[test]
    fn deleting_a_note_removes_only_that_note() {
        let (_d, s, id) = setup();
        save_note(&s, &id, input("stg_1", &[]), day()).unwrap();
        save_note(&s, &id, input("stg_2", &[]), day()).unwrap();
        delete_note(&s, &id, "stg_1").unwrap();
        let notes = load_notes(&s, &id).unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].stage_id, "stg_2");
        delete_note(&s, &id, "stg_1").unwrap();
    }

    #[test]
    fn the_questions_are_split_trimmed_and_kept_in_order_without_repeats() {
        let lines = vec!["  Why Kestrel?  \n\n  What is your notice period?\nwhy   kestrel?".to_string(), "".into(), "Tell me about a launch".into()];
        assert_eq!(clean_asked(&lines), vec!["Why Kestrel?", "What is your notice period?", "Tell me about a launch"]);
    }

    #[test]
    fn asked_questions_land_in_the_question_set_as_asked_and_are_not_added_twice() {
        let (_d, s, id) = setup();
        let before = questions(&s, &id).len();
        save_note(&s, &id, input("stg_1", &["How soon could you start?", "Describe a time you changed a roadmap."]), day()).unwrap();
        let q = questions(&s, &id);
        assert_eq!(q.len(), before + 2);
        let a = q.iter().find(|x| x.text == "How soon could you start?").unwrap();
        assert_eq!((a.source.as_str(), a.stage_id.as_str(), a.edited_by_user), ("asked", "stg_1", true));
        assert_eq!(a.kind, "factual", "logistics words");
        assert_eq!(questions(&s, &id).iter().find(|x| x.text.starts_with("Describe")).unwrap().kind, "behavioral");
        // The same questions again, different case and spacing: nothing new.
        save_note(&s, &id, input("stg_1", &["how soon  could you start?", "Describe a time you changed a roadmap."]), day()).unwrap();
        assert_eq!(questions(&s, &id).len(), before + 2);
    }

    #[test]
    fn a_question_the_person_already_edited_keeps_their_words_and_kind() {
        let (_d, s, id) = setup();
        save_note(&s, &id, input("stg_1", &["What salary do you expect?"]), day()).unwrap();
        let mut f = s.load_application_part::<QuestionsFile>(&id, "questions.json").unwrap().unwrap();
        let q = f.questions.iter_mut().find(|q| q.source == "asked").unwrap();
        assert_eq!(q.kind, "factual");
        q.kind = "motivation".into();
        q.why = "My own note".into();
        s.save_application_part(&id, "questions.json", &f).unwrap();
        save_note(&s, &id, input("stg_1", &["what salary do you expect?"]), day()).unwrap();
        let q = questions(&s, &id).into_iter().find(|q| q.source == "asked").unwrap();
        assert_eq!((q.kind.as_str(), q.why.as_str()), ("motivation", "My own note"));
    }

    #[test]
    fn a_question_taken_out_comes_back_when_it_is_written_down_again_and_leaves_the_note_when_removed_from_the_set() {
        let (_d, s, id) = setup();
        save_note(&s, &id, input("stg_1", &["Why Kestrel?", "Any questions for us?"]), day()).unwrap();
        let q = questions(&s, &id).into_iter().find(|q| q.text == "Why Kestrel?").unwrap();
        crate::applications::jd::delete_question(&s, &id, &q.id).unwrap();
        assert_eq!(load_notes(&s, &id).unwrap()[0].asked, vec!["Any questions for us?"], "one list, two views");
        assert!(questions(&s, &id).iter().all(|x| x.text != "Why Kestrel?"));
        save_note(&s, &id, input("stg_1", &["Why Kestrel?"]), day()).unwrap();
        assert!(questions(&s, &id).iter().any(|x| x.text == "Why Kestrel?" && x.source == "asked"));
    }

    #[test]
    fn an_empty_list_is_allowed_and_a_bad_rating_stage_date_or_id_is_refused() {
        let (_d, s, id) = setup();
        save_note(&s, &id, input("stg_1", &[]), day()).unwrap();
        assert!(questions(&s, &id).iter().all(|q| q.source != "asked"));
        assert!(save_note(&s, &id, NoteInput { rating: Some(6), ..input("stg_1", &[]) }, day()).is_err());
        assert!(save_note(&s, &id, NoteInput { rating: Some(0), ..input("stg_1", &[]) }, day()).is_err());
        assert!(save_note(&s, &id, NoteInput { held_on: Some("yesterday".into()), ..input("stg_1", &[]) }, day()).is_err());
        assert!(save_note(&s, &id, input("stg_99", &[]), day()).is_err(), "the stage has to exist");
        assert!(save_note(&s, &id, input("../stg_1", &[]), day()).is_err());
        assert!(save_note(&s, "../app", input("stg_1", &[]), day()).is_err());
        assert!(save_note(&s, "app_nope", input("stg_1", &[]), day()).is_err());
        assert!(delete_note(&s, "../app", "stg_1").is_err());
        assert!(delete_note(&s, &id, "../x").is_err());
        assert!(load_notes(&s, "../app").is_err());
        let held = save_note(&s, &id, NoteInput { held_on: None, ..input("stg_1", &[]) }, day()).unwrap();
        assert_eq!(held.held_on, "2026-10-15", "left out means today");
    }

    #[test]
    fn the_switch_defaults_on_and_is_kept_with_the_notes() {
        let (_d, s, id) = setup();
        assert!(asked_first(&s, &id).unwrap());
        set_asked_first(&s, &id, false).unwrap();
        assert!(!asked_first(&s, &id).unwrap());
        save_note(&s, &id, input("stg_1", &[]), day()).unwrap();
        assert!(!asked_first(&s, &id).unwrap(), "saving a note does not turn it back on");
        set_asked_first(&s, &id, true).unwrap();
        assert!(asked_first(&s, &id).unwrap());
    }

    #[test]
    fn a_newer_file_is_refused_and_not_rewritten() {
        let (_d, s, id) = setup();
        let path = s.application_path(&id, "interviews.json").unwrap();
        std::fs::write(&path, "{\"schema_version\": 99, \"notes\": []}").unwrap();
        assert!(save_note(&s, &id, input("stg_1", &[]), day()).is_err());
        assert!(std::fs::read_to_string(&path).unwrap().contains("99"));
    }

    #[test]
    fn the_notes_go_when_the_application_goes_and_with_delete_all() {
        let (_d, s, id) = setup();
        save_note(&s, &id, input("stg_1", &["Why Kestrel?"]), day()).unwrap();
        let path = s.application_path(&id, "interviews.json").unwrap();
        assert!(path.is_file());
        s.delete_application(&id, false).unwrap();
        assert!(!path.exists(), "the notes live in the application's folder");
        let (_d2, s2, id2) = setup();
        save_note(&s2, &id2, input("stg_1", &[]), day()).unwrap();
        let path2 = s2.application_path(&id2, "interviews.json").unwrap();
        assert!(path2.is_file());
        s2.delete_all().unwrap();
        assert!(!path2.exists(), "delete all covers it");
        assert!(!s2.root().join("applications").exists());
    }
}
