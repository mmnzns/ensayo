//! Reading and writing one record file with its `schema_version`. Older files are migrated on read (in memory only);
//! a file from a newer Ensayo is refused and never rewritten.

use super::migrate::CURRENT;
use super::{io, Result, StorageError};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::{Map, Value};
use std::path::Path;

fn parse<T: DeserializeOwned>(path: &Path, text: &str, migrate: impl Fn(Value) -> Result<Value>) -> Result<T> {
    let value: Value = serde_json::from_str(text).map_err(|e| StorageError::Json(path.to_path_buf(), e.to_string()))?;
    let found = value.get("schema_version").and_then(Value::as_u64).unwrap_or(0);
    if found > CURRENT {
        return Err(StorageError::TooNew(path.to_path_buf(), found as u32, CURRENT as u32));
    }
    let mut value = migrate(value)?;
    if let Some(o) = value.as_object_mut() {
        o.remove("schema_version");
    }
    serde_json::from_value(value).map_err(|e| StorageError::Json(path.to_path_buf(), e.to_string()))
}

/// Parses record text that is not in a file (tests, imports).
pub fn load_record_from_str<T: DeserializeOwned>(text: &str, migrate: impl Fn(Value) -> Result<Value>) -> Result<T> {
    parse(Path::new("<text>"), text, migrate)
}

/// The record in a file, migrated to the current format in memory; `None` when the file does not exist.
pub fn load_record<T: DeserializeOwned>(path: &Path, migrate: impl Fn(Value) -> Result<Value>) -> Result<Option<T>> {
    match io::read_text(path)? {
        Some(text) => parse(path, &text, migrate).map(Some),
        None => Ok(None),
    }
}

/// What is in the way of a save. A file from a newer Ensayo is never written over. A file that isn't JSON at all
/// (damaged) is moved to `<name>.damaged-<time>` first, so a save never destroys what was there.
fn guard_existing(path: &Path) -> Result<()> {
    let Some(old) = io::read_text(path).ok().flatten() else { return Ok(()) };
    match serde_json::from_str::<Value>(&old) {
        Ok(v) => match v.get("schema_version").and_then(Value::as_u64) {
            Some(found) if found > CURRENT => Err(StorageError::TooNew(path.to_path_buf(), found as u32, CURRENT as u32)),
            _ => Ok(()),
        },
        Err(_) => {
            let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
            let mut name = path.file_name().map(|n| n.to_os_string()).unwrap_or_default();
            name.push(format!(".damaged-{stamp}"));
            let mut aside = path.with_file_name(&name);
            let mut n = 2;
            while aside.exists() {
                let mut again = name.clone();
                again.push(format!("-{n}"));
                aside = path.with_file_name(again);
                n += 1;
            }
            std::fs::rename(path, &aside).map_err(|e| StorageError::Io(path.to_path_buf(), e.to_string()))
        }
    }
}

/// Writes the record as readable JSON with `schema_version` first, atomically.
pub fn save_record<T: Serialize>(path: &Path, record: &T) -> Result<()> {
    let body = serde_json::to_value(record).map_err(|e| StorageError::Json(path.to_path_buf(), e.to_string()))?;
    let mut out = Map::new();
    out.insert("schema_version".into(), CURRENT.into());
    if let Value::Object(fields) = body {
        out.extend(fields);
    } else {
        return Err(StorageError::Invalid("a record must serialize to a JSON object".into()));
    }
    guard_existing(path)?;
    let mut text = serde_json::to_string_pretty(&Value::Object(out)).map_err(|e| StorageError::Json(path.to_path_buf(), e.to_string()))?;
    text.push('\n');
    io::atomic_write(path, text.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::model::Story;
    use crate::storage::StorageError;
    use std::fs;

    const V0: &str = include_str!("../../tests/fixtures/story-v0.json");

    fn migrate_story(v: serde_json::Value) -> crate::storage::Result<serde_json::Value> {
        crate::storage::migrate::story(v)
    }

    #[test]
    fn a_version_0_story_becomes_a_current_story() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("st_deliverability.json");
        fs::write(&path, V0).unwrap();
        let s: Story = load_record(&path, migrate_story).unwrap().unwrap();
        assert_eq!(s.id, "st_deliverability");
        assert_eq!(s.proof_points.len(), 2);
        assert_eq!(s.proof_points[0].metric, "Sender score");
        assert_eq!((s.proof_points[0].before.as_str(), s.proof_points[0].after.as_str()), ("62", "94"));
        assert_eq!(s.proof_points[1].unit, "%");
        assert!(s.proof_points.iter().all(|p| !p.verified && !p.approximate), "old numbers were never verified");
        assert_eq!(s.headline, "Sender score 62 → 94");
        assert_eq!((s.usage.practiced, s.usage.fits), (0, 0));
        assert!(s.branches.is_empty() && s.competencies.is_empty() && s.great_eight.is_empty());
        assert_eq!(s.approach, "", "a missing strategy stays missing");
        assert!(!s.verified);
    }

    #[test]
    fn migrating_does_not_rewrite_the_file_until_something_saves_it() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        fs::write(&path, V0).unwrap();
        let _: Story = load_record(&path, migrate_story).unwrap().unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), V0);
    }

    #[test]
    fn saving_writes_the_current_schema_version_and_reads_back_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        let s: Story = load_record_from_str(V0, migrate_story).unwrap();
        save_record(&path, &s).unwrap();
        let text = fs::read_to_string(&path).unwrap();
        assert!(text.contains("\"schema_version\": 2"), "{text}");
        let back: Story = load_record(&path, migrate_story).unwrap().unwrap();
        assert_eq!(back, s);
    }

    #[test]
    fn a_file_from_a_newer_ensayo_is_refused_and_left_alone() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        let text = r#"{"schema_version": 99, "id": "x", "title": "From the future"}"#;
        fs::write(&path, text).unwrap();
        let err = load_record::<Story>(&path, migrate_story).unwrap_err();
        assert!(matches!(err, StorageError::TooNew(_, 99, 2)), "{err:?}");
        assert_eq!(fs::read_to_string(&path).unwrap(), text);
    }

    #[test]
    fn a_missing_file_is_none_and_garbage_is_a_json_error() {
        let dir = tempfile::tempdir().unwrap();
        assert!(load_record::<Story>(&dir.path().join("nope.json"), migrate_story).unwrap().is_none());
        let bad = dir.path().join("bad.json");
        fs::write(&bad, "this is not json").unwrap();
        assert!(matches!(load_record::<Story>(&bad, migrate_story).unwrap_err(), StorageError::Json(_, _)));
    }

    #[test]
    fn a_format_1_file_still_reads_and_is_written_as_format_2() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("st_a.json");
        fs::write(&path, r#"{"schema_version": 1, "id": "st_a", "title": "Old but current", "headline": "Kept as is", "proof_points": []}"#).unwrap();
        let s: Story = load_record(&path, migrate_story).unwrap().unwrap();
        assert_eq!((s.title.as_str(), s.headline.as_str()), ("Old but current", "Kept as is"));
        assert_eq!(fs::read_to_string(&path).unwrap().matches("\"schema_version\": 1").count(), 1, "reading never rewrites");
        save_record(&path, &s).unwrap();
        let text = fs::read_to_string(&path).unwrap();
        assert!(text.contains("\"schema_version\": 2") && !text.contains("\"schema_version\": 1"), "{text}");
    }

    #[test]
    fn fields_this_build_does_not_know_survive_a_save() {
        use crate::storage::model::{Method, Profile};
        use crate::storage::migrate::unchanged;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("st_a.json");
        fs::write(&path, r#"{"schema_version": 2, "id": "st_a", "title": "T", "mood": "calm", "nested": {"a": [1, 2]}}"#).unwrap();
        let s: Story = load_record(&path, migrate_story).unwrap().unwrap();
        save_record(&path, &s).unwrap();
        let back: serde_json::Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(back["mood"], "calm");
        assert_eq!(back["nested"]["a"][1], 2);
        // A record with nothing extra writes nothing extra.
        let m = Method { situation: "motivation".into(), spoken: "x".into(), story_ids: vec![], extra: Default::default() };
        save_record(&path, &m).unwrap();
        let text = fs::read_to_string(&path).unwrap();
        assert!(!text.contains("extra"), "{text}");
        // Profile and Method keep them too.
        let pp = dir.path().join("p.json");
        fs::write(&pp, r#"{"schema_version": 2, "name": "D", "fullName": "", "targetRole": "", "seniority": "", "industry": "", "sellsTo": "", "identityStatement": "", "focusHabits": [], "futureThing": true}"#).unwrap();
        let p: Profile = load_record(&pp, unchanged).unwrap().unwrap();
        save_record(&pp, &p).unwrap();
        assert!(fs::read_to_string(&pp).unwrap().contains("futureThing"));
    }

    #[test]
    fn saving_never_writes_over_a_newer_file_and_keeps_a_damaged_one_aside() {
        use crate::storage::model::Method;
        let dir = tempfile::tempdir().unwrap();
        let m = Method { situation: "motivation".into(), spoken: "x".into(), story_ids: vec![], extra: Default::default() };
        let newer = dir.path().join("newer.json");
        let text = r#"{"schema_version": 99, "situation": "motivation", "spoken": "future"}"#;
        fs::write(&newer, text).unwrap();
        assert!(matches!(save_record(&newer, &m), Err(StorageError::TooNew(_, 99, 2))));
        assert_eq!(fs::read_to_string(&newer).unwrap(), text);
        let damaged = dir.path().join("damaged.json");
        fs::write(&damaged, "{ half a file").unwrap();
        save_record(&damaged, &m).unwrap();
        assert!(fs::read_to_string(&damaged).unwrap().contains("\"spoken\": \"x\""));
        let aside: Vec<_> = fs::read_dir(dir.path()).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into_owned()).filter(|n| n.starts_with("damaged.json.damaged-")).collect();
        assert_eq!(aside.len(), 1, "{aside:?}");
        assert_eq!(fs::read_to_string(dir.path().join(&aside[0])).unwrap(), "{ half a file");
    }
}
