//! Pulls the JSON object out of a model's reply. Models wrap it in code fences, think out loud first, or add a
//! sentence afterwards; this finds the object anyway and, when it can't, says what was wrong in words that can be
//! appended to a retry prompt ("Your last reply was not valid JSON: ...").

use serde_json::Value;

/// Removes `<think>...</think>` blocks. An unclosed block (the reply was cut off while thinking) drops everything
/// from the tag on. A closing tag with no opening one (some servers add the opening tag themselves) drops everything
/// before it.
fn strip_think(text: &str) -> String {
    const OPEN: &str = "<think>";
    const CLOSE: &str = "</think>";
    let mut out = text.to_string();
    if let Some(close) = out.rfind(CLOSE) {
        if out.find(OPEN).is_none_or(|open| open > close) {
            out = out[close + CLOSE.len()..].to_string();
        }
    }
    while let Some(open) = out.find(OPEN) {
        match out[open..].find(CLOSE) {
            Some(rel) => out.replace_range(open..open + rel + CLOSE.len(), ""),
            None => out.truncate(open),
        }
    }
    out
}

/// Where the object that starts at `start` (a `{`) ends, if it does: string-aware brace matching.
fn balanced_end(text: &str, start: usize) -> Option<usize> {
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;
    for (i, c) in text[start..].char_indices() {
        if in_string {
            match c {
                _ if escaped => escaped = false,
                '\\' => escaped = true,
                '"' => in_string = false,
                _ => {}
            }
            continue;
        }
        match c {
            '"' => in_string = true,
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(start + i + 1);
                }
            }
            _ => {}
        }
    }
    None
}

/// A `{` that opens JSON (a key or an empty object follows), as opposed to a brace in a sentence.
fn opens_json(text: &str, at: usize) -> bool {
    matches!(text[at + 1..].trim_start().chars().next(), Some('"') | Some('}'))
}

/// The first JSON object in a model reply. The error says what was wrong.
pub fn extract_json(text: &str) -> Result<Value, String> {
    let text = strip_think(text);
    if text.trim().is_empty() {
        return Err("The reply was empty.".into());
    }
    let mut first_error: Option<String> = None;
    let mut from = 0;
    while let Some(rel) = text[from..].find('{') {
        let start = from + rel;
        if !opens_json(&text, start) {
            from = start + 1;
            continue;
        }
        match balanced_end(&text, start) {
            Some(end) => match serde_json::from_str::<Value>(&text[start..end]) {
                Ok(v) => return Ok(v),
                Err(e) => {
                    first_error.get_or_insert(format!("The reply had invalid JSON: {e}."));
                    from = end;
                }
            },
            None => {
                // Everything after this brace is inside it, so a later brace is not a separate object.
                let why = serde_json::from_str::<Value>(&text[start..]).err().map(|e| e.to_string()).unwrap_or_default();
                return Err(first_error.unwrap_or(format!("The JSON was cut off before it ended ({why}). The reply may have been too long.")));
            }
        }
    }
    Err(first_error.unwrap_or_else(|| "No JSON object was found in the reply.".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_bare_object_is_returned() {
        assert_eq!(extract_json(r#"{"score": 4, "ok": true}"#).unwrap(), json!({"score": 4, "ok": true}));
    }

    #[test]
    fn a_json_code_fence_is_stripped() {
        let reply = "```json\n{\"score\": 4}\n```";
        assert_eq!(extract_json(reply).unwrap(), json!({"score": 4}));
        assert_eq!(extract_json("```\n{\"a\": 1}\n```").unwrap(), json!({"a": 1}));
    }

    #[test]
    fn a_think_block_is_ignored_even_when_it_contains_braces() {
        let reply = "<think>maybe {\"draft\": 1} or something</think>\n{\"final\": 2}";
        assert_eq!(extract_json(reply).unwrap(), json!({"final": 2}));
    }

    #[test]
    fn a_closing_think_tag_alone_drops_what_came_before() {
        let reply = "let me reason {\"x\": 0}\n</think>\n{\"final\": 2}";
        assert_eq!(extract_json(reply).unwrap(), json!({"final": 2}));
    }

    #[test]
    fn an_unclosed_think_block_leaves_nothing_to_read() {
        let e = extract_json("<think>I should answer with {\"a\": 1} but first").unwrap_err();
        assert!(e.contains("empty"), "{e}");
        let e = extract_json("{\"a\": 1}\n<think>and then I kept going").unwrap();
        assert_eq!(e, json!({"a": 1}));
    }

    #[test]
    fn prose_before_and_after_is_tolerated() {
        let reply = "Sure, here is the result:\n\n{\"score\": 3}\n\nLet me know if you want changes {or not}.";
        assert_eq!(extract_json(reply).unwrap(), json!({"score": 3}));
    }

    #[test]
    fn braces_inside_strings_do_not_confuse_the_matching() {
        let reply = r#"{"text": "use {curly} braces and a \" quote }", "n": 1}"#;
        assert_eq!(extract_json(reply).unwrap(), json!({"text": "use {curly} braces and a \" quote }", "n": 1}));
    }

    #[test]
    fn nested_objects_come_back_whole() {
        let reply = r#"Here: {"a": {"b": [1, {"c": 2}]}, "d": "x"} done"#;
        assert_eq!(extract_json(reply).unwrap(), json!({"a": {"b": [1, {"c": 2}]}, "d": "x"}));
    }

    #[test]
    fn the_first_object_wins() {
        assert_eq!(extract_json(r#"{"a": 1} and {"a": 2}"#).unwrap(), json!({"a": 1}));
    }

    #[test]
    fn a_brace_in_a_sentence_before_the_object_is_skipped() {
        assert_eq!(extract_json(r#"Use {name} like this: {"a": 1}"#).unwrap(), json!({"a": 1}));
    }

    #[test]
    fn truncated_json_is_reported_as_cut_off_not_as_its_inner_object() {
        let e = extract_json(r#"{"a": {"b": 1}, "c": "this was cut o"#).unwrap_err();
        assert!(e.contains("cut off"), "{e}");
    }

    #[test]
    fn an_empty_reply_is_named() {
        assert!(extract_json("").unwrap_err().contains("empty"));
        assert!(extract_json("  \n ").unwrap_err().contains("empty"));
    }

    #[test]
    fn a_reply_with_no_object_is_named() {
        let e = extract_json("I can't help with that.").unwrap_err();
        assert!(e.contains("No JSON object"), "{e}");
        assert!(extract_json("[1, 2, 3]").unwrap_err().contains("No JSON object"));
    }

    #[test]
    fn invalid_json_carries_serdes_message() {
        let e = extract_json(r#"{"a": 1,, "b": 2}"#).unwrap_err();
        assert!(e.contains("invalid JSON") && e.contains("line 1 column"), "{e}");
    }

    #[test]
    fn a_later_valid_object_beats_an_earlier_broken_one() {
        assert_eq!(extract_json(r#"Format: {"a": ...} Real answer: {"a": 1}"#).unwrap(), json!({"a": 1}));
    }

    #[test]
    fn fence_think_and_commentary_together() {
        let reply = "<think>hmm</think>Here you go:\n```json\n{\"verdict\": \"strong\", \"notes\": [\"a\", \"b\"]}\n```\nHope that helps!";
        assert_eq!(extract_json(reply).unwrap(), json!({"verdict": "strong", "notes": ["a", "b"]}));
    }
}
