import { describe, expect, it } from "vitest";
import { TIMING_ONLY, engineStatusOf, modelLabel } from "../data/engine";
import type { AiSettings, ProviderInfo } from "../screens/settings/aiSettings";

const s = (over: Partial<AiSettings> = {}): AiSettings => ({ provider: "", fast_model: "", strong_model: "", base_url: "", cost_cap_usd: 0, ...over });
const claude: ProviderInfo = { id: "claude", name: "Claude", models: [], fast_default: "claude-haiku-5-5", strong_default: "claude-sonnet-5-5", has_key: true, needs_key: true, base_default: "" };
const openai: ProviderInfo = { ...claude, id: "openai", name: "OpenAI", fast_default: "gpt-5.4-mini" };

describe("engine status for the sidebar", () => {
  it("is timing only before the settings are known, with nothing chosen, or when the engine cannot run", () => {
    expect(engineStatusOf(null, true, [claude])).toEqual(TIMING_ONLY);
    expect(engineStatusOf(s(), true, [claude])).toEqual({ label: "Timing only", kind: "timing", offline: false });
    expect(engineStatusOf(s({ provider: "claude" }), false, [claude])).toEqual(TIMING_ONLY);
    expect(engineStatusOf(s({ provider: "local" }), false, [claude])).toEqual(TIMING_ONLY);
  });

  it("names the built-in model", () => {
    expect(engineStatusOf(s({ provider: "local" }), true, [claude])).toEqual({ label: "Built-in model", kind: "local", offline: false });
  });

  it("names the Claude model in use, a typed one over the provider's default", () => {
    expect(engineStatusOf(s({ provider: "claude", fast_model: "claude-sonnet-5-5" }), true, [claude])).toEqual({ label: "Claude Sonnet 5.5", kind: "key", offline: false });
    expect(engineStatusOf(s({ provider: "claude" }), true, [claude]).label).toBe("Claude Haiku 5.5");
  });

  it("falls back to the provider's name when the model has no friendly name", () => {
    expect(engineStatusOf(s({ provider: "openai", fast_model: "gpt-5.4-mini" }), true, [openai])).toMatchObject({ label: "OpenAI", kind: "key" });
    expect(engineStatusOf(s({ provider: "mystery" }), true, [])).toMatchObject({ label: "mystery", kind: "key" });
  });

  it("reads offline only for engines that need the internet", () => {
    expect(engineStatusOf(s({ provider: "claude" }), true, [claude], false).offline).toBe(true);
    expect(engineStatusOf(s({ provider: "local" }), true, [claude], false).offline).toBe(false);
    expect(engineStatusOf(s({ provider: "compatible", base_url: "http://localhost:11434" }), true, [], false)).toEqual({ label: "Ollama", kind: "local", offline: false });
  });

  it("calls a local server by name and a far one a key engine", () => {
    expect(engineStatusOf(s({ provider: "compatible", base_url: "http://localhost:1234" }), true, []).label).toBe("LM Studio");
    expect(engineStatusOf(s({ provider: "compatible", base_url: "https://example.com/v1" }), true, [])).toMatchObject({ label: "Your own server", kind: "key" });
  });

  it("only makes friendly names from Claude ids", () => {
    expect(modelLabel("claude-opus-5-5")).toBe("Claude Opus 5.5");
    expect(modelLabel("claude-fable-5-1")).toBe("Claude Fable 5.1");
    expect(modelLabel("gpt-6-sol")).toBeNull();
    expect(modelLabel("")).toBeNull();
  });
});
