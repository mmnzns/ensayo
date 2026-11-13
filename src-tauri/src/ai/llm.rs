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
    /// The JSON Schema the reply must follow, when the caller has one. Only a provider that can enforce a schema
    /// while it writes uses it (the local helper does); the others ignore it, and the caller validates either way.
    pub schema: Option<serde_json::Value>,
    pub max_tokens: u32,
    pub tier: Tier,
    /// Which step this call is, for the `ai-progress` event: the prompt's id, or "ai" for anything else. Never text.
    pub label: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct LlmReply {
    pub text: String,
    pub input_tokens: u32,
    pub output_tokens: u32,
    /// The model id that answered, for the cost table and the score log.
    pub model: String,
    /// The provider stopped because it hit the token limit, even if some text came back.
    pub cut_off: bool,
    /// Input tokens the provider served from its prompt cache (billed at a tenth of the input price). Claude only.
    pub cache_read_tokens: u32,
    /// Input tokens written to the prompt cache (billed at 125% of the input price). Claude only. Neither count is
    /// part of `input_tokens`.
    pub cache_write_tokens: u32,
}

pub trait Llm: Send + Sync {
    fn complete(&self, req: &LlmRequest) -> Result<LlmReply, AiError>;
}
