//! The one interface the scoring pipeline uses to talk to a model. The pipeline never knows which provider is behind
//! it: tests use a fake, the app uses `chat::ProviderLlm` (cloud providers, Ollama, LM Studio, the local helper).

use super::providers::AiError;

/// Which model of the chosen provider a task runs on (Build Plan, "Model per task"): a fast one for classify, score,
/// follow-up and parse; a stronger one for the rewritten sentence and for reading a job posting or a resume.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tier {
    Fast,
    Strong,
}

#[derive(Debug, Clone)]
pub struct LlmRequest {
    pub system: String,
    pub user: String,
    /// Ask the provider for JSON output where it has a switch for it.
    pub json: bool,
    pub max_tokens: u32,
    pub tier: Tier,
}

#[derive(Debug, Clone, PartialEq)]
pub struct LlmReply {
    pub text: String,
    pub input_tokens: u32,
    pub output_tokens: u32,
    /// The model id that answered, for the cost table and the score log.
    pub model: String,
}

pub trait Llm: Send + Sync {
    fn complete(&self, req: &LlmRequest) -> Result<LlmReply, AiError>;
}
