//! The files next to an application's record: the claims log, what was read from the posting, the prepared questions,
//! the night-before lock and the resume. Plain data; the rules that fill and read them live in `applications/`.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

// ---------- claims.json ----------

/// Which rep a claim was heard in.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RepRef {
    pub session_id: String,
    pub n: u32,
}

/// A claim that contradicted an earlier one when it was heard. Kept so the "What you've said" screen can show both.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ClaimConflict {
    pub earlier_claim_id: String,
    pub earlier_value: String,
    /// The earlier claim's stage type ("recruiter") or "resume".
    pub earlier_stage: String,
}

/// One thing the user has said about themselves to this company: in the resume (stage `resume`) or in an answer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ClaimRec {
    /// `cl_1`, `cl_2`...: short, so the model can repeat one exactly. Never reused inside an application.
    pub id: String,
    /// `reason_for_leaving`, `why_this_company`, `compensation`, `availability`, `role_title`, `tenure`, `proof_number`.
    #[serde(rename = "type")]
    pub kind: String,
    pub subject: String,
    pub value: String,
    pub quote: String,
    /// The process stage id (`stg_2`) it was said in, or `resume`.
    pub stage: String,
    /// The stage type at the time (`recruiter`, `hiring_manager`...) or `resume`: kept even if the stage is later
    /// removed, and what the prompts and the notes call the stage.
    pub stage_ref: String,
    /// None for resume claims and for claims the user added by hand.
    #[serde(default)]
    pub rep: Option<RepRef>,
    /// When this claim was written or last changed (RFC 3339).
    pub updated: String,
    /// Set when the user marked a newer value as the current one: this claim no longer counts.
    #[serde(default)]
    pub superseded_by: Option<String>,
    /// Which parts the user edited (`value`, `quote`, `subject`). A resume claim with an entry here is kept when the
    /// resume is read again or replaced, unless the user removes it.
    #[serde(default)]
    pub edited_by_user: Vec<String>,
    /// `resume`, `answer`, or `user` (added or replaced by hand).
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub conflict: Option<ClaimConflict>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ClaimsFile {
    #[serde(default)]
    pub claims: Vec<ClaimRec>,
    #[serde(default)]
    pub next_n: u32,
}

impl ClaimsFile {
    pub fn new_id(&mut self) -> String {
        let highest = self.claims.iter().filter_map(|c| c.id.strip_prefix("cl_").and_then(|n| n.parse::<u32>().ok())).max().unwrap_or(0);
        self.next_n = self.next_n.max(highest) + 1;
        format!("cl_{}", self.next_n)
    }
}

// ---------- analysis.json ----------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Priority {
    pub title: String,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Belief {
    pub text: String,
    #[serde(rename = "storyId")]
    pub story_id: Option<String>,
    /// "Onboarding drop-off · 7-day activation 31% → 44%": the covering story as it was when the posting was read.
    pub story: String,
    pub covered: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub why: Option<String>,
}

/// What the Overview shows, in the shape of `Application["analysis"]` in `src/data/types.ts`, plus the company read.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DerivedAnalysis {
    pub summary: String,
    pub priorities: Vec<Priority>,
    pub beliefs: Vec<Belief>,
    pub gaps: Vec<String>,
    pub echo: Vec<String>,
    /// `early_startup`, `growth`, `scale_up`, `enterprise`, `unknown`.
    #[serde(default)]
    pub company_stage: String,
    #[serde(default)]
    pub stage_evidence: String,
    #[serde(default)]
    pub unsaid: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnalysisFile {
    /// "analyse-jd v1", or "keywords" when no engine read it.
    pub prompt: String,
    /// "ai" or "keywords".
    pub engine: String,
    pub read_on: String,
    /// Prompt 09's reply as it was returned (None for a keyword reading).
    #[serde(default)]
    pub raw: Option<Value>,
    /// The version the screens show, with the user's edits laid over what was read.
    pub derived: DerivedAnalysis,
    /// Paths the user edited inside `derived`: `summary`, `priorities.1`, `beliefs.0`, `gaps.2`, `echo.0`.
    #[serde(default)]
    pub edited_by_user: Vec<String>,
}

// ---------- questions.json ----------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct QuestionRec {
    /// `q_1`, `q_2`...
    pub id: String,
    /// The process stage id this question is for.
    pub stage_id: String,
    /// The stage type (`recruiter`...), kept for the practice screens.
    pub stage: String,
    pub text: String,
    /// The classifier's types: `behavioral`, `tell_me_about_yourself`, `technical`, `factual`, `future_looking`, `gap`, `motivation`.
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub behavioral_situation: Option<String>,
    #[serde(default)]
    pub commitment_check: bool,
    #[serde(default)]
    pub builder_operator_check: bool,
    #[serde(default)]
    pub best_story_id: Option<String>,
    #[serde(default)]
    pub why: String,
    /// For a gap question: what the posting asks for.
    #[serde(default)]
    pub requirement: Option<String>,
    /// `jd` (read by the AI), `keywords`, `gap`, `user`.
    #[serde(default)]
    pub source: String,
    /// True when the user rewrote it or added it: reading the posting again keeps it.
    #[serde(default)]
    pub edited_by_user: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct QuestionsFile {
    #[serde(default)]
    pub prompt: String,
    #[serde(default)]
    pub engine: String,
    #[serde(default)]
    pub questions: Vec<QuestionRec>,
    #[serde(default)]
    pub next_n: u32,
    /// Questions the person deleted, as normalised text, so reading the posting again never brings them back.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub deleted: Vec<String>,
}

/// A question's text as compared for "the same question": trimmed, lower case, spaces collapsed.
pub fn question_key(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

impl QuestionsFile {
    pub fn new_id(&mut self) -> String {
        let highest = self.questions.iter().filter_map(|c| c.id.strip_prefix("q_").and_then(|n| n.parse::<u32>().ok())).max().unwrap_or(0);
        self.next_n = self.next_n.max(highest) + 1;
        format!("q_{}", self.next_n)
    }
}

// ---------- locked.json ----------

/// The night-before set for one stage.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Locked {
    /// The question the opener answers ("Tell me about yourself").
    pub opener_prompt: String,
    /// The opener in the user's words. Beats are separated by new lines (or sentences, or semicolons).
    pub opener: String,
    /// A story id from the bank.
    pub power_story: String,
    /// At most two questions to ask the interviewer.
    pub questions: Vec<String>,
    pub locked_on: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct LockedFile {
    #[serde(default)]
    pub by_stage: BTreeMap<String, Locked>,
}

// ---------- resume/resume.json ----------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BankCheck {
    pub claim_id: String,
    /// `matches`, `differs`, `not_in_bank`.
    pub result: String,
    #[serde(default)]
    pub story_id: Option<String>,
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MustSay {
    /// `ms-1`, `ms-2`...: assigned by code when this file is written, and sent on to the Mock debrief.
    pub id: String,
    pub qualification: String,
    pub resume_quote: String,
    pub why: String,
    #[serde(default)]
    pub story_id: Option<String>,
    /// In how many Mocks it was said out loud, out of `mocks_checked` (set by the Mock debrief).
    #[serde(default)]
    pub said_in: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StorySuggestion {
    pub bullet: String,
    pub employer: String,
    pub title: String,
    pub headline_result: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResumeRec {
    /// The name of the file the user chose ("Dana Ortiz, Resume, Kestrel.pdf").
    pub file_name: String,
    /// `pdf`, `docx`, or `text` (pasted).
    pub kind: String,
    /// The copy kept in the application's `resume/` folder (`resume.pdf`), None for pasted text.
    #[serde(default)]
    pub file: Option<String>,
    /// SHA-256 of the file as it was attached.
    #[serde(default)]
    pub file_hash: String,
    #[serde(default)]
    pub pages: u32,
    pub attached_on: String,
    /// `attached` (waiting for the user to confirm the read), `no_text` (nothing could be read: paste the text),
    /// `read`.
    pub status: String,
    /// `file` or `pasted`.
    #[serde(default)]
    pub text_source: String,
    #[serde(default)]
    pub read_on: Option<String>,
    /// `ai` or `patterns`.
    #[serde(default)]
    pub engine: Option<String>,
    /// "read-resume v1".
    #[serde(default)]
    pub prompt: Option<String>,
    /// `ready`, `waiting_for_posting` (the list needs the posting), or `none` (no engine, no list).
    #[serde(default)]
    pub must_say_state: String,
    #[serde(default)]
    pub bank_check: Vec<BankCheck>,
    #[serde(default)]
    pub must_say: Vec<MustSay>,
    /// How many Mocks the debrief checked the list against.
    #[serde(default)]
    pub mocks_checked: u32,
    #[serde(default)]
    pub story_suggestions: Vec<StorySuggestion>,
}

// ---------- interviews.json ----------

/// What the person wrote down after one interview. One note per stage; saving again replaces it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct InterviewNote {
    /// The process stage id (`stg_2`). A note on a stage that is later removed stays in the file.
    pub stage_id: String,
    /// The local date the interview was held ("2026-10-23").
    #[serde(default)]
    pub held_on: String,
    /// How it went, 1 (badly) to 5 (very well); none when the person did not say.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rating: Option<u8>,
    /// The questions they were asked, in the order written.
    #[serde(default)]
    pub asked: Vec<String>,
    /// What the person said that worked.
    #[serde(default)]
    pub worked: String,
    /// What they would change.
    #[serde(default)]
    pub differently: String,
    /// Who they spoke to, in their own words.
    #[serde(default)]
    pub spoke_to: String,
    /// What happens next, in their own words.
    #[serde(default)]
    pub next_step: String,
    #[serde(default)]
    pub created: String,
    #[serde(default)]
    pub edited: String,
}

fn yes() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct InterviewsFile {
    /// Questions asked at earlier stages come first in a later stage's Drill. The person can turn it off per application.
    #[serde(default = "yes")]
    pub asked_first: bool,
    #[serde(default)]
    pub notes: Vec<InterviewNote>,
}

impl Default for InterviewsFile {
    fn default() -> Self {
        InterviewsFile { asked_first: true, notes: vec![] }
    }
}
