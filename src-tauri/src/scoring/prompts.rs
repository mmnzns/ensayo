//! The eleven prompts in `prompts/`, parsed once from the files embedded in the app. They are versioned files, never
//! inline strings (Build Plan, M4): changing one bumps its `version`; changing a criterion bumps the rubric version.

use super::template::{render, Vars};
use crate::ai::llm::Tier;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::OnceLock;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PromptId {
    Classify,
    Score,
    Coach,
    FollowUp,
    ScoreFollowUp,
    Clarify,
    Claims,
    ParseStory,
    AnalyseJd,
    QuestionQuality,
    ReadResume,
}

impl PromptId {
    pub const ALL: [PromptId; 11] = [
        PromptId::Classify,
        PromptId::Score,
        PromptId::Coach,
        PromptId::FollowUp,
        PromptId::ScoreFollowUp,
        PromptId::Clarify,
        PromptId::Claims,
        PromptId::ParseStory,
        PromptId::AnalyseJd,
        PromptId::QuestionQuality,
        PromptId::ReadResume,
    ];
}

pub struct Prompt {
    /// "classify-question".
    pub id: String,
    pub version: u32,
    pub tier: Tier,
    system: String,
    user: String,
    pub inputs: Vec<String>,
    pub schema: Value,
}

const RUBRIC: &str = include_str!("../../../prompts/rubric-v1.md");

fn source(id: PromptId) -> (&'static str, &'static str) {
    match id {
        PromptId::Classify => (include_str!("../../../prompts/01-classify-question.md"), include_str!("../../../prompts/schemas/classify-question.schema.json")),
        PromptId::Score => (include_str!("../../../prompts/02-score-answer.md"), include_str!("../../../prompts/schemas/score-answer.schema.json")),
        PromptId::Coach => (include_str!("../../../prompts/03-coach-note.md"), include_str!("../../../prompts/schemas/coach-note.schema.json")),
        PromptId::FollowUp => (include_str!("../../../prompts/04-generate-follow-up.md"), include_str!("../../../prompts/schemas/generate-follow-up.schema.json")),
        PromptId::ScoreFollowUp => (include_str!("../../../prompts/05-score-follow-up.md"), include_str!("../../../prompts/schemas/score-follow-up.schema.json")),
        PromptId::Clarify => (include_str!("../../../prompts/06-answer-clarification.md"), include_str!("../../../prompts/schemas/answer-clarification.schema.json")),
        PromptId::Claims => (include_str!("../../../prompts/07-extract-claims.md"), include_str!("../../../prompts/schemas/extract-claims.schema.json")),
        PromptId::ParseStory => (include_str!("../../../prompts/08-parse-story.md"), include_str!("../../../prompts/schemas/parse-story.schema.json")),
        PromptId::AnalyseJd => (include_str!("../../../prompts/09-analyse-jd.md"), include_str!("../../../prompts/schemas/analyse-jd.schema.json")),
        PromptId::QuestionQuality => (include_str!("../../../prompts/10-question-quality.md"), include_str!("../../../prompts/schemas/question-quality.schema.json")),
        PromptId::ReadResume => (include_str!("../../../prompts/11-read-resume.md"), include_str!("../../../prompts/schemas/read-resume.schema.json")),
    }
}

/// Splits a prompt file into its front matter and its `## ` sections.
fn parse(file: &str, schema: &str) -> Result<Prompt, String> {
    // A Windows checkout can turn the files' line feeds into CRLF; the parser reads line feeds only.
    let file = &file.replace("\r\n", "\n");
    let rest = file.strip_prefix("---\n").ok_or("missing front matter")?;
    let (front, body) = rest.split_once("\n---\n").ok_or("unterminated front matter")?;
    let mut meta: HashMap<&str, &str> = HashMap::new();
    for line in front.lines() {
        if let Some((k, v)) = line.split_once(':') {
            meta.insert(k.trim(), v.trim());
        }
    }
    let mut sections: Vec<(String, String)> = Vec::new();
    for line in body.lines() {
        if let Some(title) = line.strip_prefix("## ") {
            sections.push((title.trim().to_string(), String::new()));
        } else if let Some(last) = sections.last_mut() {
            last.1.push_str(line);
            last.1.push('\n');
        }
    }
    let find = |name: &str| sections.iter().find(|(t, _)| t == name).map(|(_, b)| b.trim().to_string());
    let mut system = find("System").ok_or("no System section")?;
    let user = find("User").ok_or("no User section")?;
    // Worked examples in the prompt file are part of the instructions the model gets.
    for name in ["Examples", "Example"] {
        if let Some(ex) = find(name) {
            system.push_str("\n\nExamples:\n\n");
            system.push_str(&ex);
        }
    }
    let inputs = meta
        .get("inputs")
        .map(|v| v.trim_matches(|c| c == '[' || c == ']').split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect())
        .unwrap_or_default();
    Ok(Prompt {
        id: meta.get("id").ok_or("no id")?.to_string(),
        version: meta.get("version").and_then(|v| v.parse().ok()).ok_or("no version")?,
        tier: if meta.get("model_tier") == Some(&"strong") { Tier::Strong } else { Tier::Fast },
        system,
        user,
        inputs,
        schema: serde_json::from_str(schema).map_err(|e| format!("schema: {e}"))?,
    })
}

/// The rubric text without its front matter.
pub fn rubric() -> String {
    let text = RUBRIC.replace("\r\n", "\n");
    text.strip_prefix("---\n").and_then(|r| r.split_once("\n---\n")).map(|(_, b)| b.trim().to_string()).unwrap_or(text)
}

pub fn get(id: PromptId) -> &'static Prompt {
    static CACHE: OnceLock<HashMap<PromptId, Prompt>> = OnceLock::new();
    CACHE
        .get_or_init(|| {
            PromptId::ALL
                .iter()
                .map(|id| {
                    let (file, schema) = source(*id);
                    (*id, parse(file, schema).unwrap_or_else(|e| panic!("prompt {id:?}: {e}")))
                })
                .collect()
        })
        .get(&id)
        .expect("every prompt is loaded")
}

impl Prompt {
    /// The system and user messages with the values filled in. The rubric is added to the system part.
    pub fn render(&self, vars: &Vars) -> (String, String) {
        let vars = vars.clone().set("rubric", rubric());
        (render(&self.system, &vars), render(&self.user, &vars))
    }

    pub fn system_template(&self) -> &str {
        &self.system
    }

    pub fn user_template(&self) -> &str {
        &self.user
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_checkout_with_windows_line_endings_parses_the_same() {
        let (file, schema) = source(PromptId::Classify);
        let crlf = file.replace('\n', "\r\n");
        let a = parse(file, schema).unwrap();
        let b = parse(&crlf, schema).unwrap();
        assert_eq!((a.id, a.version, a.system, a.user), (b.id, b.version, b.system, b.user));
    }
    use crate::scoring::template::placeholders;

    #[test]
    fn every_prompt_file_parses_with_both_parts_and_a_schema() {
        for id in PromptId::ALL {
            let p = get(id);
            assert!(p.version >= 1, "{}", p.id);
            assert!(p.system_template().len() > 200, "{}", p.id);
            assert!(p.user_template().contains("JSON"), "{} user part ends by asking for JSON", p.id);
            assert!(p.schema["$schema"].is_string(), "{}", p.id);
        }
    }

    #[test]
    fn ids_follow_the_file_names_and_tiers_follow_the_readme() {
        assert_eq!(get(PromptId::Classify).id, "classify-question");
        assert_eq!(get(PromptId::Score).id, "score-answer");
        assert_eq!(get(PromptId::Coach).tier, Tier::Strong);
        assert_eq!(get(PromptId::Score).tier, Tier::Fast);
        assert_eq!(get(PromptId::AnalyseJd).tier, Tier::Strong);
        assert_eq!(get(PromptId::ReadResume).tier, Tier::Strong);
    }

    #[test]
    fn every_placeholder_is_a_declared_input() {
        for id in PromptId::ALL {
            let p = get(id);
            if p.inputs.is_empty() {
                continue;
            }
            for template in [p.system_template(), p.user_template()] {
                for name in placeholders(template) {
                    assert!(name == "rubric" || p.inputs.contains(&name), "{}: {{{{{name}}}}} is not in its inputs list {:?}", p.id, p.inputs);
                }
            }
        }
    }

    #[test]
    fn the_rubric_is_inserted_into_the_scoring_prompts() {
        let (system, _) = get(PromptId::Score).render(&Vars::new());
        assert!(system.contains("### answer_first"));
        assert!(!system.contains("{{rubric}}"));
        assert!(!rubric().starts_with("---"));
    }

    #[test]
    fn rendering_fills_the_user_part_and_drops_empty_blocks() {
        let v = Vars::new().set("question", "Tell me about a time.").set("question_type", "behavioral").set("stage", "recruiter").set("transcript", "[1] (0.0s to 1.0s) Hi.");
        let (_, user) = get(PromptId::Score).render(&v);
        assert!(user.contains("<data name=\"question\">Tell me about a time.</data>"));
        assert!(!user.contains("bank_stories"));
        assert!(!user.contains("{{#if"));
    }

    #[test]
    fn worked_examples_are_part_of_the_system_prompt() {
        assert!(get(PromptId::Classify).system_template().contains("behavioral implementation") || get(PromptId::Classify).system_template().contains("Have you done a behavioral implementation"));
    }
}
