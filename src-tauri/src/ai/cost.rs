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

/// One row per model in `providers::catalog()`, plus rows for models that left the list so settings saved earlier
/// are still priced. Checked against the providers' official pages on 2026-11-16. `exact` rows are published
/// prices (Claude's Haiku 5.5 is the under-100K-token rate, which every Ensayo prompt is). `guess` rows are
/// unconfirmed or lean high on purpose: a price that is too low would let the spend cap overshoot.
const PRICES: &[(&str, Price)] = &[
    // Claude (Anthropic API).
    ("claude-sonnet-5-5", exact(2.0, 10.0)),
    ("claude-opus-5-5", exact(4.0, 20.0)),
    ("claude-haiku-5-5", exact(0.10, 0.50)),
    ("claude-fable-5-1", exact(10.0, 50.0)),
    ("claude-fable-5-2", exact(8.0, 40.0)),
    // OpenAI.
    ("gpt-6-luna", exact(0.10, 0.50)),
    ("gpt-6-sol", exact(2.0, 10.0)),
    ("gpt-6.1-sol", exact(2.0, 10.0)),
    ("gpt-6.1-terra", exact(1.0, 5.0)),
    ("gpt-6-astra", exact(10.0, 50.0)),
    ("gpt-5.6-sol", exact(4.0, 20.0)),
    ("gpt-5.6-terra", exact(2.0, 12.0)),
    ("gpt-5.6-luna", exact(0.20, 1.20)),
    ("gpt-5.5", exact(5.0, 30.0)),
    ("gpt-5.4", exact(2.50, 15.0)),
    ("gpt-5.4-mini", exact(0.75, 4.50)),
    // Gemini. The output price includes thinking.
    ("gemini-4-hydrogen", exact(1.50, 7.50)),
    // Introductory 0.75 / 3.75 until 2026-12-31, 1.50 / 7.50 from 2027-01-01. The higher price keeps the cap safe.
    ("gemini-3.8-flash", guess(1.50, 7.50)),
    ("gemini-3.6-flash", guess(1.50, 7.50)),
    ("gemini-3.5-flash-lite", exact(0.30, 2.50)),
    ("gemini-3.1-pro-preview", exact(2.0, 12.0)),
    // Left the list (shuts down 2027-05-07); kept so saved settings stay priced.
    ("gemini-3.1-flash-lite", exact(0.25, 1.50)),
    // Groq.
    ("openai/gpt-oss-120b", exact(0.15, 0.60)),
    ("openai/gpt-oss-20b", exact(0.075, 0.30)),
    ("qwen/qwen3.8-27b", exact(0.80, 4.00)),
    // Cerebras (official prices could not be confirmed).
    ("gpt-oss-120b", guess(0.35, 0.75)),
    ("qwen-3.8-27b", guess(0.99, 1.49)),
    // Mistral (the -latest aliases could not be confirmed).
    ("mistral-large-latest", guess(0.70, 2.10)),
    ("mistral-small-latest", guess(0.15, 0.60)),
    ("ministral-14b-latest", guess(0.20, 0.20)),
    ("ministral-8b-latest", guess(0.15, 0.15)),
    // Left the list (Medium 3.5 was deprecated 2026-10-31); kept so saved settings stay priced.
    ("mistral-medium-latest", guess(1.50, 7.50)),
    // OpenRouter (passes the maker's price through, plus a small fee on credit purchases that is not counted here).
    ("anthropic/claude-sonnet-5.5", exact(2.0, 10.0)),
    ("anthropic/claude-opus-5.5", exact(4.0, 20.0)),
    ("anthropic/claude-haiku-5.5", exact(0.10, 0.50)),
    ("anthropic/claude-fable-5.2", exact(8.0, 40.0)),
    ("openai/gpt-6.1-sol", exact(2.0, 10.0)),
    ("openai/gpt-6-luna", exact(0.10, 0.50)),
    ("google/gemini-4-hydrogen", exact(1.50, 7.50)),
    ("deepseek/deepseek-v4.1-flash", exact(0.14, 0.42)),
    ("qwen/qwen3.8-flash", exact(0.15, 0.47)),
    ("mistralai/mistral-large-4-0", exact(0.70, 2.10)),
    ("x-ai/grok-4.7", exact(2.0, 6.0)),
    ("meta-llama/llama-4-maverick", exact(0.35, 1.0)),
    // Left the list; kept so saved settings stay priced.
    ("openai/gpt-6-sol", exact(2.0, 10.0)),
    ("google/gemini-3.8-flash", exact(0.825, 4.125)),
    ("google/gemini-3.1-pro-preview", exact(2.0, 12.0)),
    ("mistralai/mistral-medium-3-5", exact(1.50, 7.50)),
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

/// True when the table has a price for this model (a dated snapshot of a listed model counts).
pub fn price_known(model: &str) -> bool {
    price(model).is_some()
}

/// The rows of the table that belong to a provider. Claude rows are `claude-*`, OpenAI `gpt-*` (not the open-weight
/// `gpt-oss`), Gemini `gemini-*`, OpenRouter rows contain a slash; Groq, Cerebras and Mistral are the models their
/// catalog lists. Nothing breaks when a provider's highest price changes: gpt-6-astra at 10 / 50 makes OpenAI's
/// fallback for unknown models 10 / 50, which is intended (never counted as free, leans high).
fn rows_of(provider: Provider) -> Vec<Price> {
    let rows = PRICES.iter().filter(|(id, _)| match provider {
        Provider::Claude => id.starts_with("claude-"),
        Provider::OpenAi => id.starts_with("gpt-") && !id.starts_with("gpt-oss"),
        Provider::Gemini => id.starts_with("gemini-"),
        Provider::OpenRouter => id.contains('/'),
        Provider::Groq | Provider::Cerebras | Provider::Mistral => super::providers::catalog(provider).contains(id),
        Provider::Compatible => false,
    });
    rows.map(|(_, p)| *p).collect()
}

fn highest(rows: impl IntoIterator<Item = Price>) -> Option<Price> {
    rows.into_iter().max_by(|a, b| a.output.total_cmp(&b.output))
}

/// What a model on a paid provider is priced at: its table price, or, when it has none, the provider's highest listed
/// price (by output price) marked as a guess, so an unlisted model is never counted as free. When a provider's
/// highest price changes nothing breaks (see `rows_of`). A provider with no rows
/// falls back to the highest price in the whole table. Local servers are free and never come here.
pub fn price_or_fallback(provider: Provider, model: &str) -> Option<Price> {
    if provider == Provider::Compatible {
        return None;
    }
    if let Some(p) = price(model) {
        return Some(p);
    }
    let top = highest(rows_of(provider)).or_else(|| highest(PRICES.iter().map(|(_, p)| *p)))?;
    Some(Price { approx: true, ..top })
}

fn cost_at(p: Price, input_tokens: u32, output_tokens: u32, cache_read_tokens: u32, cache_write_tokens: u32) -> f64 {
    let input = f64::from(input_tokens) + 0.10 * f64::from(cache_read_tokens) + 1.25 * f64::from(cache_write_tokens);
    (input * p.input + f64::from(output_tokens) * p.output) / 1_000_000.0
}

/// USD for one call, or None when the model has no known price (local models: free, so the caller counts them as 0).
pub fn estimate(model: &str, input_tokens: u32, output_tokens: u32) -> Option<f64> {
    estimate_cached(model, input_tokens, output_tokens, 0, 0)
}

/// Like `estimate`, with Claude's prompt cache: reads cost 10% of the input price and writes 125% of it. The cached
/// tokens are counted apart from `input_tokens`.
pub fn estimate_cached(model: &str, input_tokens: u32, output_tokens: u32, cache_read_tokens: u32, cache_write_tokens: u32) -> Option<f64> {
    Some(cost_at(price(model)?, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens))
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
    /// The model of the most recent reply.
    pub last_model: Option<String>,
}

impl Spend {
    /// Counts one reply at the table price. A model with no price counts as free. A local server that happens to
    /// serve a model whose id is in the table must be counted with `add_from`, so it stays free.
    pub fn add(&mut self, reply: &LlmReply) {
        let usd = estimate_cached(&reply.model, reply.input_tokens, reply.output_tokens, reply.cache_read_tokens, reply.cache_write_tokens).unwrap_or(0.0);
        self.record(reply, usd, price(&reply.model).is_some_and(|p| p.approx));
    }

    /// Like `add`, but knows which provider answered: a local server (`Provider::Compatible`) costs nothing, and a
    /// model a paid provider has no price for is counted at that provider's highest price, as an estimate.
    pub fn add_from(&mut self, provider: Provider, reply: &LlmReply) {
        match price_or_fallback(provider, &reply.model) {
            None => self.record(reply, 0.0, false),
            Some(p) => {
                let usd = cost_at(p, reply.input_tokens, reply.output_tokens, reply.cache_read_tokens, reply.cache_write_tokens);
                self.record(reply, usd, p.approx);
            }
        }
    }

    /// Adds what `child` spent since it was copied from `base` (see `Budget::fork`).
    pub fn absorb(&mut self, child: &Spend, base: &Spend) {
        self.usd += child.usd - base.usd;
        self.calls += child.calls - base.calls;
        self.input_tokens += child.input_tokens - base.input_tokens;
        self.output_tokens += child.output_tokens - base.output_tokens;
        self.approx |= child.approx;
        if child.calls > base.calls {
            self.last_model = child.last_model.clone();
        }
    }

    fn record(&mut self, reply: &LlmReply, usd: f64, approx: bool) {
        self.approx |= approx;
        self.usd += usd;
        self.calls += 1;
        self.last_model = Some(reply.model.clone());
        self.input_tokens += u64::from(reply.input_tokens) + u64::from(reply.cache_read_tokens) + u64::from(reply.cache_write_tokens);
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
        LlmReply { text: String::new(), input_tokens: input, output_tokens: output, model: model.into(), cut_off: false, cache_read_tokens: 0, cache_write_tokens: 0 }
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
    fn cache_reads_cost_a_tenth_and_cache_writes_a_quarter_more_than_input() {
        // Sonnet 5.5 at $2 in: 1M plain input = 2.00, 1M cache reads = 0.20, 1M cache writes = 2.50.
        let plain = estimate_cached("claude-sonnet-5-5", 1_000_000, 0, 0, 0).unwrap();
        let read = estimate_cached("claude-sonnet-5-5", 0, 0, 1_000_000, 0).unwrap();
        let write = estimate_cached("claude-sonnet-5-5", 0, 0, 0, 1_000_000).unwrap();
        assert!((plain - 2.0).abs() < 1e-9 && (read - 0.2).abs() < 1e-9 && (write - 2.5).abs() < 1e-9, "{plain} {read} {write}");
        let mut s = Spend::default();
        s.add(&LlmReply { cache_read_tokens: 1_000_000, cache_write_tokens: 100_000, ..reply("claude-sonnet-5-5", 0, 0) });
        assert!((s.usd - 0.45).abs() < 1e-9, "{}", s.usd);
        assert_eq!(s.input_tokens, 1_100_000);
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
        assert!(price("gemini-3.8-flash").unwrap().approx);
        assert!(!price("gpt-6-sol").unwrap().approx);
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
        s.add(&reply("mistral-large-latest", 1000, 1000));
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

    #[test]
    fn an_unlisted_model_is_priced_at_its_providers_top_row_and_is_an_estimate() {
        let mut s = Spend::default();
        s.add_from(Provider::Claude, &reply("claude-sonnet-9-9", 1_000_000, 1_000_000));
        assert!((s.usd - 60.0).abs() < 1e-9, "{}", s.usd);
        assert!(s.approx);
        // The cache price rules apply to the fallback too: 1M reads at a tenth of $10.
        let mut c = Spend::default();
        c.add_from(Provider::Claude, &LlmReply { cache_read_tokens: 1_000_000, ..reply("claude-sonnet-9-9", 0, 0) });
        assert!((c.usd - 1.0).abs() < 1e-9, "{}", c.usd);
        let mut o = Spend::default();
        o.add_from(Provider::OpenRouter, &reply("acme/brand-new", 1_000_000, 1_000_000));
        let top = price("anthropic/claude-fable-5.2").unwrap();
        assert!((o.usd - (top.input + top.output)).abs() < 1e-9, "{}", o.usd);
        assert!(o.approx);
        // A local server stays free for any model.
        let mut l = Spend::default();
        l.add_from(Provider::Compatible, &reply("claude-sonnet-9-9", 1_000_000, 1_000_000));
        assert_eq!(l.usd, 0.0);
        assert!(!price_known("claude-sonnet-9-9") && price_known("claude-fable-5-2"));
    }

    #[test]
    fn every_paid_provider_has_rows_to_fall_back_on() {
        assert!(rows_of(Provider::Claude).len() >= 5);
        for p in [Provider::OpenAi, Provider::Gemini, Provider::Groq, Provider::Cerebras, Provider::Mistral, Provider::OpenRouter] {
            assert!(!rows_of(p).is_empty(), "{p:?}");
        }
        assert!(rows_of(Provider::Compatible).is_empty());
        assert_eq!(highest(PRICES.iter().map(|(_, p)| *p)).unwrap().output, 50.0);
    }
}
