//! Story Bank paste and parse: the command the "Read it" button calls.

use crate::rep_commands::with_ai;
use crate::scoring::parse_story::{self, ParsedStory};
use crate::scoring::run::CallError;

type Cmd<T> = std::result::Result<T, String>;

const NO_ENGINE: &str = "Reading pasted text needs a feedback engine. Choose one in Settings › AI, or fill the story in yourself.";

/// The line the story screen shows when reading fails. Not the answer screens' "checked for timing only", which
/// means nothing here.
fn story_message(e: &CallError) -> String {
    match e {
        CallError::Unavailable(m) | CallError::Failed(m) => m.clone(),
        CallError::Invalid(_) => "The AI's reply couldn't be read this time. Try Read it again, or fill it in yourself.".into(),
        CallError::CapReached { .. } => format!("{} Or fill it in yourself.", e.cap_words()),
    }
}

/// Sorts pasted text into a draft story. Nothing is saved: the user checks every field first, and only the user can mark
/// a number verified.
#[tauri::command]
pub async fn parse_story(raw: String, employer_hint: String) -> Cmd<ParsedStory> {
    tauri::async_runtime::spawn_blocking(move || {
        let _t = crate::logging::Timer::new("parse_story");
        let (out, unavailable) = with_ai("story-parse", |ai| match ai {
            Some(ctx) => parse_story::parse_story(ctx.llm, &raw, &employer_hint, ctx.budget).map_err(|e| story_message(&e)),
            None => Err(NO_ENGINE.to_string()),
        });
        out.map_err(|e| unavailable.map(|u| u.replace(" This answer was checked for timing only.", "")).unwrap_or(e))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod story_message_tests {
    use super::*;

    #[test]
    fn a_failed_read_never_talks_about_timing() {
        for e in [CallError::Invalid("x".into()), CallError::CapReached { spent: 1.02, cap: 1.0 }, CallError::Failed("The provider is busy.".into())] {
            let m = story_message(&e);
            assert!(!m.contains("timing"), "{m}");
            assert!(!m.contains('\u{2014}'), "no em dashes: {m}");
        }
        assert!(story_message(&CallError::Invalid("x".into())).contains("Try Read it again"));
    }
}
