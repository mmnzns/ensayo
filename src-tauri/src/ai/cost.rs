//! What a model call costs, so Settings can show a running total and stop at the spend cap. Prices are US dollars
//! per million tokens, keyed by model id. Local servers (Ollama, LM Studio) are free and are not in the table.

use super::llm::LlmReply;
use super::providers::Provider;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Price {
    /// USD per million input tokens.
    pub input: f64,
    /// USD per million output tokens.
    pub output: f64,
    /// A best guess, not a published price. The total shown to the user is then labelled as an estimate.
    pub approx: bool,
}

const fn exact(input: f64, output: f64) -> Price {
    Price { input, output, approx: false }
}

const fn guess(input: f64, output: f64) -> Price {
    Price { input, output, approx: true }
}

/// One row per model in `providers::catalog()`. Claude prices are the published ones for Anthropic's own API (Haiku
/// 5.5 is the under-100K-token rate, which every Ensayo prompt is). Every other price is from memory or a guess for a
/// model too new to have a price I know, and is marked `approx`. Prices that are too low would let the spend cap
/// overshoot, so the guesses lean high.
const PRICES: &[(&str, Price)] = &[
    // Claude (Anthropic API).
    ("claude-sonnet-5-5", exact(2.0, 10.0)),
    ("claude-opus-5-5", exact(4.0, 20.0)),
    ("claude-haiku-5-5", exact(0.10, 0.50)),
    ("claude-fable-5-1", exact(10.0, 50.0)),
    // OpenAI.
    ("gpt-6-sol", guess(5.0, 30.0)),
    ("gpt-6.1-sol", guess(5.0, 30.0)),
    ("gpt-6-luna", guess(1.0, 6.0)),
    ("gpt-6-astra", guess(0.30, 2.0)),
    ("gpt-5.6-sol", guess(4.0, 24.0)),
    ("gpt-5.6-terra", guess(2.0, 12.0)),
    ("gpt-5.6-luna", guess(0.50, 3.0)),
    ("gpt-5.5", guess(5.0, 30.0)),
    ("gpt-5.4", guess(2.50, 15.0)),
    ("gpt-5.4-mini", guess(0.75, 4.50)),
    // Gemini.
    ("gemini-3.8-flash", guess(0.50, 3.0)),
    ("gemini-3.1-pro-preview", guess(2.0, 12.0)),
    ("gemini-3.6-flash", guess(0.50, 3.0)),
    ("gemini-3.5-flash-lite", guess(0.25, 1.50)),
    ("gemini-3.1-flash-lite", guess(0.25, 1.50)),
    // Groq.
    ("openai/gpt-oss-120b", guess(0.15, 0.75)),
    ("openai/gpt-oss-20b", guess(0.10, 0.50)),
    ("qwen/qwen3.8-27b", guess(0.40, 1.60)),
    // Cerebras.
    ("gpt-oss-120b", guess(0.35, 0.75)),
    ("qwen-3.8-27b", guess(0.40, 1.60)),
    // Mistral.
    ("mistral-medium-latest", guess(0.40, 2.0)),
    ("mistral-large-latest", guess(0.50, 1.50)),
    ("mistral-small-latest", guess(0.10, 0.30)),
    ("ministral-14b-latest", guess(0.20, 0.20)),
    ("ministral-8b-latest", guess(0.15, 0.15)),
    // OpenRouter (passes the maker's price through, plus a small fee on credit purchases that is not counted here).
    ("anthropic/claude-sonnet-5.5", guess(2.0, 10.0)),
    ("anthropic/claude-opus-5.5", guess(4.0, 20.0)),
    ("anthropic/claude-haiku-5.5", guess(0.10, 0.50)),
    ("openai/gpt-6-sol", guess(5.0, 30.0)),
    ("openai/gpt-6-luna", guess(1.0, 6.0)),
    ("google/gemini-3.8-flash", guess(0.50, 3.0)),
    ("google/gemini-3.1-pro-preview", guess(2.0, 12.0)),
    ("deepseek/deepseek-v4.1-flash", guess(0.20, 0.80)),
    ("qwen/qwen3.8-flash", guess(0.25, 1.0)),
    ("mistralai/mistral-medium-3-5", guess(0.40, 2.0)),
    ("x-ai/grok-4.7", guess(3.0, 15.0)),
    ("meta-llama/llama-4-maverick", guess(0.20, 0.80)),
];

/// The price of a model id. A dated snapshot of a listed model ("claude-sonnet-5-5-20261001") is priced as the
/// listed model; anything else not in the table is unknown.
pub fn price(model: &str) -> Option<Price> {
    if let Some((_, p)) = PRICES.iter().find(|(id, _)| *id == model) {
        return Some(*p);
    }
    PRICES
        .iter()
        .filter(|(id, _)| model.strip_prefix(id).is_some_and(|rest| rest.strip_prefix('-').is_some_and(|d| d.starts_with(|c: char| c.is_ascii_digit()))))
        .max_by_key(|(id, _)| id.len())
        .map(|(_, p)| *p)
}

/// USD for one call, or None when the model has no known price (local models: free, so the caller counts them as 0).
pub fn estimate(model: &str, input_tokens: u32, output_tokens: u32) -> Option<f64> {
    let p = price(model)?;
    Some((f64::from(input_tokens) * p.input + f64::from(output_tokens) * p.output) / 1_000_000.0)
}

/// What the session has spent so far.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Spend {
    pub usd: f64,
    pub calls: u32,
    pub input_tokens: u64,
    pub output_tokens: u64,
    /// Some of `usd` comes from a guessed price (see `Price::approx`), so show the total as an estimate.
    pub approx: bool,
}

impl Spend {
    /// Counts one reply at the table price. A model with no price counts as free. A local server that happens to
    /// serve a model whose id is in the table must be counted with `add_from`, so it stays free.
    pub fn add(&mut self, reply: &LlmReply) {
        let usd = estimate(&reply.model, reply.input_tokens, reply.output_tokens).unwrap_or(0.0);
        self.record(reply, usd, price(&reply.model).is_some_and(|p| p.approx));
    }

    /// Like `add`, but knows which provider answered: a local server (`Provider::Compatible`) costs nothing.
    pub fn add_from(&mut self, provider: Provider, reply: &LlmReply) {
        if provider == Provider::Compatible {
            self.record(reply, 0.0, false);
        } else {
            self.add(reply);
        }
    }

    fn record(&mut self, reply: &LlmReply, usd: f64, approx: bool) {
        self.approx |= approx;
        self.usd += usd;
        self.calls += 1;
        self.input_tokens += u64::from(reply.input_tokens);
        self.output_tokens += u64::from(reply.output_tokens);
    }

    /// True once the spend has reached the cap, so the next call must not start.
    pub fn would_exceed(&self, cap_usd: f64) -> bool {
        self.usd >= cap_usd
    }
}

#[cfg(test)]
mod tests {
    use super::super::providers::catalog;
    use super::*;

    fn reply(model: &str, input: u32, output: u32) -> LlmReply {
        LlmReply { text: String::new(), input_tokens: input, output_tokens: output, model: model.into() }
    }

    #[test]
    fn every_catalog_model_has_a_price() {
        for p in Provider::ALL {
            for m in catalog(p) {
                assert!(price(m).is_some(), "no price for {m}");
            }
        }
    }

    #[test]
    fn no_model_is_listed_twice() {
        let mut seen = std::collections::HashSet::new();
        for (id, _) in PRICES {
            assert!(seen.insert(*id), "{id}");
        }
    }

    #[test]
    fn a_call_is_priced_per_million_tokens() {
        // 10,000 in and 2,000 out on Sonnet 5.5 at $2 / $10: 0.02 + 0.02.
        let usd = estimate("claude-sonnet-5-5", 10_000, 2_000).unwrap();
        assert!((usd - 0.04).abs() < 1e-9, "{usd}");
        let usd = estimate("claude-fable-5-1", 1_000_000, 1_000_000).unwrap();
        assert!((usd - 60.0).abs() < 1e-9, "{usd}");
    }

    #[test]
    fn unknown_and_local_models_have_no_price() {
        assert_eq!(estimate("llama3.2:3b", 1000, 1000), None);
        assert_eq!(estimate("", 1, 1), None);
    }

    #[test]
    fn a_dated_snapshot_is_priced_as_its_model_but_a_different_model_is_not() {
        assert_eq!(price("claude-sonnet-5-5-20261001"), price("claude-sonnet-5-5"));
        assert_eq!(price("gpt-5.4-mini-2026-03-17"), price("gpt-5.4-mini"), "the longest listed name wins");
        assert_eq!(price("gpt-5.4-nano"), None, "a sibling is not a snapshot");
        assert_eq!(price("claude-sonnet-5-5-experimental"), None);
    }

    #[test]
    fn guessed_prices_are_marked_and_published_ones_are_not() {
        assert!(!price("claude-opus-5-5").unwrap().approx);
        assert!(price("gpt-6-sol").unwrap().approx);
    }

    #[test]
    fn spend_adds_up_calls_tokens_and_dollars() {
        let mut s = Spend::default();
        s.add(&reply("claude-sonnet-5-5", 10_000, 2_000));
        s.add(&reply("claude-sonnet-5-5", 10_000, 2_000));
        s.add(&reply("llama3.2:3b", 500, 100));
        assert_eq!(s.calls, 3);
        assert_eq!(s.input_tokens, 20_500);
        assert_eq!(s.output_tokens, 4_100);
        assert!((s.usd - 0.08).abs() < 1e-9, "{}", s.usd);
        assert!(!s.approx, "Claude prices are published");
        s.add(&reply("gpt-6-sol", 1000, 1000));
        assert!(s.approx, "a guessed price makes the total an estimate");
    }

    #[test]
    fn the_cap_stops_further_calls_once_reached() {
        let mut s = Spend::default();
        assert!(!s.would_exceed(0.05));
        s.add(&reply("claude-sonnet-5-5", 10_000, 2_000));
        assert!(!s.would_exceed(0.05), "$0.04 of $0.05");
        s.add(&reply("claude-sonnet-5-5", 10_000, 2_000));
        assert!(s.would_exceed(0.05), "$0.08 of $0.05");
        assert!(s.would_exceed(0.08), "reaching the cap exactly stops the next call");
    }

    #[test]
    fn a_local_server_is_free_even_when_its_model_id_matches_a_priced_one() {
        let mut s = Spend::default();
        // LM Studio serves "openai/gpt-oss-20b", which is also a Groq model.
        s.add_from(Provider::Compatible, &reply("openai/gpt-oss-20b", 1_000_000, 1_000_000));
        assert_eq!(s.usd, 0.0);
        assert_eq!(s.calls, 1);
        s.add_from(Provider::Groq, &reply("openai/gpt-oss-20b", 1_000_000, 1_000_000));
        assert!(s.usd > 0.0);
    }
}
