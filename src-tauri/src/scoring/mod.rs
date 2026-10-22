//! Scoring a rep with a model: prompts, rendering, calling, validating, merging with the rules, picking the one fix.

pub mod coach;
pub mod criteria;
pub mod followup;
#[cfg(test)]
pub mod fixtures;
pub mod inputs;
pub mod mock_debrief;
pub mod parse_story;
pub mod pipeline;
pub mod prompts;
pub mod run;
pub mod score;
pub mod template;
