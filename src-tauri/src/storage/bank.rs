//! Profile, stories and methods in the data folder: one small file per record.

use super::io::{is_safe_id, list_json};
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
        let mut saved = story.clone();
        saved.verified = all_verified(&saved);
        save_record(&self.story_path(&saved.id), &saved)?;
        Ok(saved)
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
