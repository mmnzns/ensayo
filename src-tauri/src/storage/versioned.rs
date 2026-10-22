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
        assert!(text.contains("\"schema_version\": 1"), "{text}");
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
        assert!(matches!(err, StorageError::TooNew(_, 99, 1)), "{err:?}");
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
}
