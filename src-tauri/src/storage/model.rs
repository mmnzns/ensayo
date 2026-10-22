//! The records saved in the data folder. Field names match `src/data/types.ts` so the screens read them as they are.

use serde::{Deserialize, Serialize};

/// Who the user is. Written by first-run and Settings › Profile.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub name: String,
    pub full_name: String,
    pub target_role: String,
    pub seniority: String,
    pub industry: String,
    pub sells_to: String,
    pub identity_statement: String,
    pub focus_habits: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProofPoint {
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub metric: String,
    #[serde(default)]
    pub before: String,
    #[serde(default)]
    pub after: String,
    #[serde(default)]
    pub unit: String,
    #[serde(default)]
    pub approximate: bool,
    #[serde(default)]
    pub verified: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Branch {
    pub kind: String,
    pub trigger: String,
    pub angle: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Usage {
    #[serde(default)]
    pub practiced: u32,
    #[serde(default)]
    pub fits: u32,
    #[serde(default, rename = "saidNumber", skip_serializing_if = "Option::is_none")]
    pub said_number: Option<u32>,
    /// Answers practiced with this story, per target. Worked out from the reps whenever the stories are read and never
    /// saved with the story.
    #[serde(default, rename = "byTarget", skip_serializing_if = "std::collections::BTreeMap::is_empty")]
    pub by_target: std::collections::BTreeMap<String, u32>,
}

/// One story, in the Build Plan's shape (Context, Approach, Action, Result; the format is never named in the UI).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Story {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub employer: String,
    #[serde(default)]
    pub best_for: Vec<String>,
    #[serde(default)]
    pub direct_answer: String,
    #[serde(default)]
    pub context: String,
    /// Empty for a story that only says what was done: the gap to fill, never invented.
    #[serde(default)]
    pub approach: String,
    #[serde(default)]
    pub action: String,
    #[serde(default)]
    pub ownership: String,
    #[serde(default)]
    pub result: String,
    #[serde(default)]
    pub proof_points: Vec<ProofPoint>,
    #[serde(default)]
    pub scale: String,
    #[serde(default)]
    pub competencies: Vec<String>,
    #[serde(default)]
    pub great_eight: Vec<String>,
    #[serde(default)]
    pub branches: Vec<Branch>,
    /// True only when there is at least one proof point and every one is verified.
    #[serde(default)]
    pub verified: bool,
    #[serde(default)]
    pub headline: String,
    #[serde(default)]
    pub usage: Usage,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub year: Option<String>,
    /// One per target that has its own way in; targets without one use `headline`. An angle never changes a number: its
    /// headline may only carry the numbers in `proof_points` (checked when the story is saved).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub angles: Vec<StoryAngle>,
}

/// A story's way in for one target (`StoryAngle` in `src/data/types.ts`: snake_case like the story).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StoryAngle {
    pub target_id: String,
    #[serde(default)]
    pub headline: String,
    #[serde(default)]
    pub emphasis: Vec<String>,
    #[serde(default)]
    pub lead_branch: Option<String>,
}

/// How the user handles one kind of behavioral question, in one sentence.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Method {
    pub situation: String,
    pub spoken: String,
    #[serde(default, rename = "storyIds")]
    pub story_ids: Vec<String>,
}

/// The six situations, in the order the Methods screen lists them.
pub const SITUATIONS: [&str; 6] = ["problem_solving", "disagreement", "influence", "serving_customers", "leading_team", "motivation"];
