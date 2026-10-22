//! Moving old files to the current format, one pure function per kind of record. They only ever read; the file on
//! disk is rewritten when the user next saves it.

use super::{Result, StorageError};
use serde_json::{json, Value};

/// The format Ensayo writes today.
pub const CURRENT: u64 = 1;

fn version_of(v: &Value) -> u64 {
    v.get("schema_version").and_then(Value::as_u64).unwrap_or(0)
}

fn slug(text: &str) -> String {
    let s: String = text.to_lowercase().chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '_' }).collect();
    s.split('_').filter(|p| !p.is_empty()).collect::<Vec<_>>().join("_")
}

fn text(v: &Value, key: &str) -> String {
    v.get(key).and_then(Value::as_str).unwrap_or("").to_string()
}

/// Version 0 stories (before `schema_version` existed) kept their numbers in `numbers[]` with no verification and had
/// no branches, competencies, usage or scale. They become proof points that are not verified, with the card headline
/// rebuilt from the first number.
pub fn story(mut v: Value) -> Result<Value> {
    if version_of(&v) >= CURRENT {
        return Ok(v);
    }
    let obj = v.as_object_mut().ok_or_else(|| StorageError::Invalid("a story file must hold a JSON object".into()))?;
    let numbers = obj.remove("numbers").and_then(|n| n.as_array().cloned()).unwrap_or_default();
    let points: Vec<Value> = numbers
        .iter()
        .map(|n| {
            let metric = text(n, "label");
            json!({
                "label": slug(&metric),
                "metric": metric,
                "before": text(n, "before"),
                "after": text(n, "after"),
                "unit": text(n, "unit"),
                "approximate": false,
                "verified": false,
            })
        })
        .collect();
    let headline = points
        .first()
        .map(|p| {
            let unit = if text(p, "unit") == "%" { "%" } else { "" };
            format!("{} {}{unit} → {}{unit}", text(p, "metric"), text(p, "before"), text(p, "after"))
        })
        .unwrap_or_default();
    if !obj.contains_key("proof_points") {
        obj.insert("proof_points".into(), Value::Array(points));
    }
    let defaults: [(&str, Value); 8] = [
        ("headline", Value::String(headline)),
        ("scale", Value::String(String::new())),
        ("branches", Value::Array(vec![])),
        ("competencies", Value::Array(vec![])),
        ("great_eight", Value::Array(vec![])),
        ("best_for", Value::Array(vec![])),
        ("usage", json!({ "practiced": 0, "fits": 0 })),
        ("verified", Value::Bool(false)),
    ];
    for (k, d) in defaults {
        obj.entry(k).or_insert(d);
    }
    obj.insert("schema_version".into(), json!(CURRENT));
    Ok(v)
}

/// Records that have only ever had one format.
pub fn unchanged(v: Value) -> Result<Value> {
    Ok(v)
}

/// An application's record and the files next to it (`analysis.json`, `claims.json`, `resume/resume.json`...).
/// Format 1 is the first, so nothing changes yet. When one of these files changes shape, bump `CURRENT` and add the
/// step here: a file older than `CURRENT` is moved forward in memory and rewritten when the user next saves it.
pub fn application(v: Value) -> Result<Value> {
    Ok(v)
}
