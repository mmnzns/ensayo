//! What prompt 02 returns, as typed data. Only read after the JSON passed the schema (`prompts/schemas/score-answer`).

use serde::Deserialize;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Deserialize)]
pub struct Verdict {
    /// "pass", "fail" or "na".
    pub result: String,
    #[serde(default)]
    pub sentences: Vec<usize>,
    #[serde(default)]
    pub quote: String,
    #[serde(default)]
    pub reason: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NumberSaid {
    pub text: String,
    pub sentence: usize,
    #[serde(default)]
    pub metric: String,
    pub matches_bank: Option<String>,
    /// "st_onboarding.activation_7d = 44%".
    pub conflicts_with_bank: Option<String>,
    #[serde(default)]
    pub not_in_bank: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ScoreAnswer {
    pub clarifying_question: bool,
    pub not_an_answer: bool,
    pub restart_at_sentence: Option<usize>,
    pub story_id: Option<String>,
    pub first_answer_sentence: Option<usize>,
    pub proof_landed_sentence: Option<usize>,
    #[serde(default)]
    pub tail_exempt_sentences: Vec<usize>,
    pub approach_sentence: Option<usize>,
    pub action_sentence: Option<usize>,
    #[serde(default)]
    pub numbers_said: Vec<NumberSaid>,
    pub criteria: BTreeMap<String, Verdict>,
}

impl ScoreAnswer {
    /// The bank value out of "st_onboarding.activation_7d = 44%".
    pub fn bank_value(conflict: &str) -> &str {
        conflict.split_once('=').map(|(_, v)| v.trim()).unwrap_or(conflict)
    }
}
