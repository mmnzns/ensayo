//! Profile, stories and methods in the data folder: one small file per record.

use super::io::{is_safe_id, list_json};
use crate::metrics::numbers;
use crate::scoring::coach::without_compounds;
use super::migrate;
use super::model::{Method, Story, SITUATIONS};
use super::versioned::{load_record, save_record};
use super::{Loaded, Result, Storage, StorageError};
use std::fs;
use std::path::PathBuf;

/// What Ensayo writes inside a data folder. `delete_all` removes exactly these and nothing else.
const OWNED: [&str; 9] = ["profile.json", "profile.v0.json", "you.json", "targets", "bank", "applications", "sessions", "eval", "lock.json"];

fn checked_id(id: &str) -> Result<&str> {
    if is_safe_id(id) {
        Ok(id)
    } else {
        Err(StorageError::Invalid(format!("\"{id}\" is not a valid id")))
    }
}

/// True only when there is at least one number and every number is verified (Build Plan, Story Bank).
fn all_verified(story: &Story) -> bool {
    !story.proof_points.is_empty() && story.proof_points.iter().all(|p| p.verified)
}

impl Storage {
    pub(super) fn profile_path(&self) -> PathBuf {
        self.root().join("profile.json")
    }
    fn story_path(&self, id: &str) -> PathBuf {
        self.root().join("bank/stories").join(format!("{id}.json"))
    }
    fn method_path(&self, situation: &str) -> PathBuf {
        self.root().join("bank/methods").join(format!("{situation}.json"))
    }

    // ---------- stories ----------

    pub fn load_stories(&self) -> Result<Loaded<Story>> {
        let mut out = Loaded::<Story>::default();
        for path in list_json(&self.root().join("bank/stories"))? {
            match load_record::<Story>(&path, migrate::story) {
                Ok(Some(s)) => out.items.push(s),
                Ok(None) => {}
                Err(e) => out.problems.push(format!("{}: {e}", path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default())),
            }
        }
        out.items.sort_by_key(|s| s.title.to_lowercase());
        Ok(out)
    }

    pub fn story(&self, id: &str) -> Result<Story> {
        load_record(&self.story_path(checked_id(id)?), migrate::story)?.ok_or_else(|| StorageError::NotFound(format!("story {id}")))
    }

    /// Creates or replaces a story by id. The verified flag is always recomputed from its numbers. Returns what was saved.
    pub fn save_story(&self, story: &Story) -> Result<Story> {
        checked_id(&story.id)?;
        if story.title.trim().is_empty() {
            return Err(StorageError::Invalid("A story needs a title".into()));
        }
        self.check_angles(story)?;
        let mut saved = story.clone();
        saved.verified = all_verified(&saved);
        save_record(&self.story_path(&saved.id), &saved)?;
        Ok(saved)
    }

    /// An angle may change what a story opens with, never its numbers: the headline can only carry numbers that are in
    /// the story's proof points (same value, any wording; "seven-day" is a name, not a number). Angles for a target that
    /// no longer exists are kept as they are.
    fn check_angles(&self, story: &Story) -> Result<()> {
        if story.angles.is_empty() {
            return Ok(());
        }
        let targets = self.targets()?;
        let known = crate::rep_commands::bank_numbers(std::slice::from_ref(story), std::slice::from_ref(&story.id));
        for angle in &story.angles {
            let Some(target) = targets.iter().find(|t| t.id == angle.target_id) else { continue };
            let said = numbers::extract(&without_compounds(&angle.headline));
            if let Some(bad) = said.iter().find(|n| !known.iter().any(|k| numbers::same(k.value, n.value))) {
                let shown = if bad.percent { format!("{}%", bad.value) } else { bad.raw.clone() };
                return Err(StorageError::Invalid(format!("The opening sentence for {} says {shown}, which is not one of this story's numbers.", target.name)));
            }
        }
        Ok(())
    }

    /// Deletes a story and takes it out of every method that listed it.
    pub fn delete_story(&self, id: &str) -> Result<()> {
        let path = self.story_path(checked_id(id)?);
        if !path.is_file() {
            return Err(StorageError::NotFound(format!("story {id}")));
        }
        fs::remove_file(&path).map_err(|e| StorageError::Io(path, e.to_string()))?;
        for mut m in self.methods()? {
            if m.story_ids.iter().any(|s| s == id) {
                m.story_ids.retain(|s| s != id);
                self.save_method(&m)?;
            }
        }
        Ok(())
    }

    /// Ticks or unticks one number of a story ("Checked" in the UI) and recomputes the story's verified flag.
    pub fn set_proof_verified(&self, story_id: &str, label: &str, verified: bool) -> Result<Story> {
        let mut story = self.story(story_id)?;
        let point = story.proof_points.iter_mut().find(|p| p.label == label).ok_or_else(|| StorageError::NotFound(format!("number {label} in story {story_id}")))?;
        point.verified = verified;
        self.save_story(&story)
    }

    // ---------- methods ----------

    /// The saved methods, in the order the Methods screen lists the six situations.
    pub fn methods(&self) -> Result<Vec<Method>> {
        let mut out = vec![];
        for situation in SITUATIONS {
            if let Some(m) = load_record::<Method>(&self.method_path(situation), migrate::unchanged)? {
                out.push(m);
            }
        }
        Ok(out)
    }

    pub fn save_method(&self, method: &Method) -> Result<()> {
        if !SITUATIONS.contains(&method.situation.as_str()) {
            return Err(StorageError::Invalid(format!("\"{}\" is not a situation", method.situation)));
        }
        save_record(&self.method_path(&method.situation), method)
    }

    pub fn delete_method(&self, situation: &str) -> Result<()> {
        if !SITUATIONS.contains(&situation) {
            return Err(StorageError::Invalid(format!("\"{situation}\" is not a situation")));
        }
        let path = self.method_path(situation);
        if !path.is_file() {
            return Err(StorageError::NotFound(format!("method {situation}")));
        }
        fs::remove_file(&path).map_err(|e| StorageError::Io(path, e.to_string()))
    }

    // ---------- everything ----------

    /// Removes what Ensayo wrote in the data folder. The folder itself and any other file in it stay: it may be a
    /// synced drive folder the user also uses for other things.
    pub fn delete_all(&self) -> Result<()> {
        for name in OWNED {
            let path = self.root().join(name);
            let result = if path.is_dir() { fs::remove_dir_all(&path) } else if path.exists() { fs::remove_file(&path) } else { Ok(()) };
            result.map_err(|e| StorageError::Io(path, e.to_string()))?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use crate::storage::model::{Method, Profile, ProofPoint, Story, Usage};
    use crate::storage::versioned::save_record;
    use crate::storage::{Storage, StorageError};
    use std::fs;

    fn point(label: &str, verified: bool) -> ProofPoint {
        ProofPoint { label: label.into(), metric: label.into(), before: "1".into(), after: "2".into(), unit: "".into(), approximate: false, verified }
    }

    fn story(id: &str, title: &str) -> Story {
        Story {
            id: id.into(),
            title: title.into(),
            employer: "Fernhill".into(),
            best_for: vec![],
            direct_answer: "I did the thing.".into(),
            context: "".into(),
            approach: "".into(),
            action: "".into(),
            ownership: "".into(),
            result: "".into(),
            proof_points: vec![],
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

    fn profile() -> Profile {
        Profile { name: "Dana".into(), full_name: "Dana Ortiz".into(), target_role: "Lifecycle".into(), seniority: "senior".into(), industry: "Fintech".into(), sells_to: "b2c".into(), identity_statement: "I fix funnels.".into(), focus_habits: vec!["to_the_point".into()] }
    }

    fn fresh() -> (tempfile::TempDir, Storage) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::init(dir.path().join("data")).unwrap();
        (dir, s)
    }

    #[test]
    fn init_creates_the_folder_and_open_never_does() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("data");
        assert!(matches!(Storage::open(root.clone()), Err(StorageError::Unavailable(_))));
        assert!(!root.exists(), "open must not create an empty bank in place of a missing one");
        Storage::init(root.clone()).unwrap();
        assert!(root.is_dir());
        assert!(Storage::open(root).is_ok());
    }

    #[test]
    fn opening_a_file_instead_of_a_folder_is_unavailable() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("file");
        fs::write(&f, "x").unwrap();
        assert!(matches!(Storage::open(f), Err(StorageError::Unavailable(_))));
    }

    #[test]
    fn the_profile_round_trips_and_is_none_before_it_is_saved() {
        let (_d, s) = fresh();
        assert_eq!(s.profile().unwrap(), None);
        s.save_profile(&profile()).unwrap();
        assert_eq!(s.profile().unwrap(), Some(profile()));
        let mut changed = profile();
        changed.target_role = "Head of Lifecycle".into();
        s.save_profile(&changed).unwrap();
        assert_eq!(s.profile().unwrap().unwrap().target_role, "Head of Lifecycle");
    }

    #[test]
    fn a_story_can_be_created_read_updated_listed_and_deleted() {
        let (_d, s) = fresh();
        assert!(s.load_stories().unwrap().items.is_empty());
        s.save_story(&story("st_b", "Zebra")).unwrap();
        s.save_story(&story("st_a", "apple")).unwrap();
        let titles: Vec<_> = s.load_stories().unwrap().items.iter().map(|x| x.title.clone()).collect();
        assert_eq!(titles, vec!["apple", "Zebra"], "sorted by title, ignoring case");
        let mut edited = s.story("st_a").unwrap();
        edited.approach = "I noticed the funnel stalled.".into();
        s.save_story(&edited).unwrap();
        assert_eq!(s.story("st_a").unwrap().approach, "I noticed the funnel stalled.");
        assert_eq!(s.load_stories().unwrap().items.len(), 2, "an update replaces, it does not add");
        s.delete_story("st_a").unwrap();
        assert!(matches!(s.story("st_a"), Err(StorageError::NotFound(_))));
        assert!(matches!(s.delete_story("st_a"), Err(StorageError::NotFound(_))));
    }

    #[test]
    fn a_story_needs_a_title_and_a_safe_id() {
        let (_d, s) = fresh();
        assert!(matches!(s.save_story(&story("st_x", "  ")), Err(StorageError::Invalid(_))));
        assert!(matches!(s.save_story(&story("../evil", "Title")), Err(StorageError::Invalid(_))));
        assert!(matches!(s.story("../evil"), Err(StorageError::Invalid(_))));
    }

    #[test]
    fn a_story_is_verified_only_when_it_has_numbers_and_all_are_verified() {
        let (_d, s) = fresh();
        let mut st = story("st_v", "Verified");
        assert!(!s.save_story(&st).unwrap().verified, "no numbers means not verified");
        st.proof_points = vec![point("a", true), point("b", true)];
        st.verified = false;
        assert!(s.save_story(&st).unwrap().verified);
        st.proof_points = vec![point("a", true), point("b", false)];
        st.verified = true;
        assert!(!s.save_story(&st).unwrap().verified, "the story flag is recomputed, never trusted");
    }

    #[test]
    fn ticking_one_number_flips_that_number_and_recomputes_the_story() {
        let (_d, s) = fresh();
        let mut st = story("st_t", "Ticks");
        st.proof_points = vec![point("a", true), point("b", false)];
        s.save_story(&st).unwrap();
        let after = s.set_proof_verified("st_t", "b", true).unwrap();
        assert!(after.verified && after.proof_points.iter().all(|p| p.verified));
        let after = s.set_proof_verified("st_t", "a", false).unwrap();
        assert!(!after.verified);
        assert!(matches!(s.set_proof_verified("st_t", "nope", true), Err(StorageError::NotFound(_))));
    }

    #[test]
    fn one_broken_story_file_does_not_hide_the_others() {
        let (_d, s) = fresh();
        s.save_story(&story("st_ok", "Fine")).unwrap();
        fs::write(s.root().join("bank/stories/st_bad.json"), "not json").unwrap();
        fs::write(s.root().join("bank/stories/st_new.json"), r#"{"schema_version": 99, "id": "st_new", "title": "Newer"}"#).unwrap();
        let loaded = s.load_stories().unwrap();
        assert_eq!(loaded.items.len(), 1);
        assert_eq!(loaded.problems.len(), 2, "{:?}", loaded.problems);
    }

    #[test]
    fn methods_round_trip_in_situation_order_and_only_known_situations_are_accepted() {
        let (_d, s) = fresh();
        let m = |sit: &str, text: &str| Method { situation: sit.into(), spoken: text.into(), story_ids: vec!["st_a".into()] };
        s.save_method(&m("influence", "Make it cheap to say yes.")).unwrap();
        s.save_method(&m("problem_solving", "Find where people drop.")).unwrap();
        let got: Vec<_> = s.methods().unwrap().into_iter().map(|x| x.situation).collect();
        assert_eq!(got, vec!["problem_solving", "influence"]);
        assert!(matches!(s.save_method(&m("small_talk", "x")), Err(StorageError::Invalid(_))));
        s.delete_method("influence").unwrap();
        assert_eq!(s.methods().unwrap().len(), 1);
    }

    #[test]
    fn deleting_a_story_also_removes_it_from_the_methods_that_used_it() {
        let (_d, s) = fresh();
        s.save_story(&story("st_a", "A")).unwrap();
        s.save_story(&story("st_b", "B")).unwrap();
        s.save_method(&Method { situation: "problem_solving".into(), spoken: "x".into(), story_ids: vec!["st_a".into(), "st_b".into()] }).unwrap();
        s.delete_story("st_a").unwrap();
        assert_eq!(s.methods().unwrap()[0].story_ids, vec!["st_b"]);
    }

    #[test]
    fn delete_all_also_removes_you_the_targets_and_the_v0_backup() {
        let (_d, s) = fresh();
        save_record(&s.root().join("profile.json"), &profile()).unwrap();
        assert!(s.you().unwrap().is_some(), "reading moves the profile to profile.v0.json");
        s.save_target(&crate::storage::targets::Target::default()).unwrap();
        assert!(s.root().join("you.json").is_file() && s.root().join("targets").is_dir() && s.root().join("profile.v0.json").is_file());
        fs::write(s.root().join("notes.txt"), "mine").unwrap();
        s.delete_all().unwrap();
        for gone in ["you.json", "targets", "profile.v0.json", "profile.json"] {
            assert!(!s.root().join(gone).exists(), "{gone}");
        }
        assert_eq!(fs::read_to_string(s.root().join("notes.txt")).unwrap(), "mine");
        assert_eq!(s.you().unwrap(), None);
        assert!(s.targets().unwrap().is_empty());
    }

    // ---------- story angles ----------

    fn with_targets() -> (tempfile::TempDir, Storage, String) {
        let (d, s) = fresh();
        let t = s.save_target(&crate::storage::targets::Target { name: "B2B marketing ops".into(), ..Default::default() }).unwrap();
        (d, s, t.id)
    }

    fn angled(target: &str, headline: &str) -> Story {
        let mut st = story("st_act", "Activation");
        st.proof_points = vec![ProofPoint { label: "activation".into(), metric: "7-day activation".into(), before: "31".into(), after: "44".into(), unit: "%".into(), approximate: false, verified: true }, point("team", true)];
        st.proof_points[1].before = "".into();
        st.proof_points[1].after = "12".into();
        st.angles = vec![crate::storage::model::StoryAngle { target_id: target.into(), headline: headline.into(), emphasis: vec!["the test design".into()], lead_branch: Some("ownership".into()) }];
        st
    }

    #[test]
    fn an_angle_headline_may_use_the_numbers_of_the_story_in_any_wording() {
        let (_d, s, t) = with_targets();
        for ok in ["Activation up from 31% to 44%", "Activation went from thirty-one percent to forty-four percent", "I led a team of 12 and lifted activation", "No numbers here at all", ""] {
            assert!(s.save_story(&angled(&t, ok)).is_ok(), "{ok}");
        }
    }

    #[test]
    fn compound_adjectives_like_seven_day_are_not_numbers() {
        let (_d, s, t) = with_targets();
        assert!(s.save_story(&angled(&t, "Seven-day activation from 31% to 44%")).is_ok());
        assert!(s.save_story(&angled(&t, "7-day activation from 31% to 44%")).is_ok());
        assert!(s.save_story(&angled(&t, "A three-step fix that lifted it 31% to 44%")).is_ok());
    }

    #[test]
    fn a_number_that_is_not_in_the_story_is_refused_with_the_plain_line_and_nothing_is_saved() {
        let (_d, s, t) = with_targets();
        let err = s.save_story(&angled(&t, "Activation up 52% in a quarter")).unwrap_err();
        assert!(matches!(err, StorageError::Invalid(_)));
        assert_eq!(err.to_string(), "The opening sentence for B2B marketing ops says 52%, which is not one of this story's numbers.");
        assert!(matches!(s.story("st_act"), Err(StorageError::NotFound(_))), "nothing was saved");
        let err = s.save_story(&angled(&t, "Activation went up by fifty two percent")).unwrap_err();
        assert!(err.to_string().contains("which is not one of this story's numbers."), "{err}");
        let err = s.save_story(&angled(&t, "I led 30 people")).unwrap_err();
        assert_eq!(err.to_string(), "The opening sentence for B2B marketing ops says 30, which is not one of this story's numbers.");
    }

    #[test]
    fn an_angle_for_a_target_that_no_longer_exists_is_kept_as_it_is() {
        let (_d, s, t) = with_targets();
        let mut st = angled(&t, "Activation from 31% to 44%");
        st.angles.push(crate::storage::model::StoryAngle { target_id: "tg_gone".into(), headline: "Up 99%".into(), emphasis: vec![], lead_branch: None });
        let saved = s.save_story(&st).unwrap();
        assert_eq!(saved.angles.len(), 2);
        assert_eq!(s.story("st_act").unwrap().angles[1].target_id, "tg_gone");
    }

    #[test]
    fn angles_are_written_in_snake_case_like_the_rest_of_the_story_and_a_story_without_any_has_no_angles_key() {
        let (_d, s, t) = with_targets();
        s.save_story(&angled(&t, "Activation from 31% to 44%")).unwrap();
        let text = fs::read_to_string(s.root().join("bank/stories/st_act.json")).unwrap();
        assert!(text.contains("\"angles\"") && text.contains("\"target_id\"") && text.contains("\"lead_branch\": \"ownership\"") && text.contains("\"emphasis\""), "{text}");
        s.save_story(&story("st_plain", "Plain")).unwrap();
        assert!(!fs::read_to_string(s.root().join("bank/stories/st_plain.json")).unwrap().contains("angles"));
        let back = s.story("st_act").unwrap();
        assert_eq!(back.angles[0].lead_branch.as_deref(), Some("ownership"));
    }

    #[test]
    fn a_story_saved_by_v0_has_no_angles_and_still_reads() {
        let (_d, s) = fresh();
        fs::write(s.root().join("bank/stories/st_old.json"), r#"{"schema_version": 1, "id": "st_old", "title": "Old"}"#).unwrap();
        assert!(s.story("st_old").unwrap().angles.is_empty());
    }

    #[test]
    fn delete_all_removes_ensayos_data_but_not_the_folder_or_other_files() {
        let (_d, s) = fresh();
        s.save_profile(&profile()).unwrap();
        s.save_story(&story("st_a", "A")).unwrap();
        s.save_method(&Method { situation: "motivation".into(), spoken: "x".into(), story_ids: vec![] }).unwrap();
        fs::write(s.root().join("notes.txt"), "my own notes").unwrap();
        fs::create_dir_all(s.root().join("applications/app_x")).unwrap();
        fs::write(s.root().join("applications/app_x/application.json"), "{}").unwrap();
        s.delete_all().unwrap();
        assert!(s.root().is_dir());
        assert_eq!(fs::read_to_string(s.root().join("notes.txt")).unwrap(), "my own notes");
        assert_eq!(s.profile().unwrap(), None);
        assert!(s.load_stories().unwrap().items.is_empty());
        assert!(s.methods().unwrap().is_empty());
        assert!(!s.root().join("applications").exists());
        s.delete_all().unwrap(); // nothing left: still fine
    }
}
