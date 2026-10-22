//! Story Bank paste and parse: the command the "Read it" button calls.

use crate::rep_commands::with_ai;
use crate::scoring::parse_story::{self, ParsedStory};

type Cmd<T> = std::result::Result<T, String>;

const NO_ENGINE: &str = "Reading pasted text needs a feedback engine. Choose one in Settings › AI, or fill the story in yourself.";

/// Sorts pasted text into a draft story. Nothing is saved: the user checks every field first, and only the user can mark
/// a number verified.
#[tauri::command]
pub async fn parse_story(raw: String, employer_hint: String) -> Cmd<ParsedStory> {
    tauri::async_runtime::spawn_blocking(move || {
        let _t = crate::logging::Timer::new("parse_story");
        let (out, unavailable) = with_ai("story-parse", |ai| match ai {
            Some(ctx) => parse_story::parse_story(ctx.llm, &raw, &employer_hint, ctx.budget).map_err(|e| e.notice().replace(" This answer was checked for timing only.", "")),
            None => Err(NO_ENGINE.to_string()),
        });
        out.map_err(|e| unavailable.map(|u| u.replace(" This answer was checked for timing only.", "")).unwrap_or(e))
    })
    .await
    .map_err(|e| e.to_string())?
}
