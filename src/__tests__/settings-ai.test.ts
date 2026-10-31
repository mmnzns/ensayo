import { describe, expect, it } from "vitest";
import {
  OTHER_MODEL,
  advancedChoices,
  advancedValue,
  assistantName,
  capLabel,
  capOptions,
  capValue,
  cloudProviders,
  explainTestError,
  fromAdvanced,
  initialState,
  kindOfProvider,
  localEngineFor,
  localEngineOf,
  contextLine,
  detectedLine,
  localDeletedLine,
  serverFor,
  withDetectedServer,
  type AiScreenState,
  type DetectedServer,
  localModelHere,
  localModelLine,
  localModelOf,
  modelChoices,
  modelFromChoice,
  privacySetup,
  providerIdForKind,
  shownModel,
  testedLine,
  withCap,
  withKind,
  withLocalEngine,
  withLocalModel,
  withModelChoice,
  withProvider,
  withTypedModel,
  withWriting,
  type AiView,
  type LocalAiView,
  type ProviderInfo,
} from "../screens/settings/aiSettings";
import { leavesRows } from "../screens/settings/privacy";

const p = (id: string, over: Partial<ProviderInfo> = {}): ProviderInfo => ({ id, name: id, models: [], fast_default: "", strong_default: "", has_key: false, needs_key: id !== "compatible", base_default: "", ...over });
const claude = p("claude", { name: "Claude", models: ["claude-opus-4", "claude-sonnet-4", "claude-haiku-4"], fast_default: "claude-haiku-4", strong_default: "claude-opus-4", has_key: true });
const openai = p("openai", { name: "OpenAI", models: ["gpt-5", "gpt-5-mini"], fast_default: "gpt-5-mini", strong_default: "gpt-5" });
const openrouter = p("openrouter", { name: "OpenRouter" });
const compatible = p("compatible", { name: "OpenAI-compatible", base_default: "http://localhost:11434" });
const providers = [claude, openai, openrouter, compatible];
const settings = { provider: "claude", fast_model: "", strong_model: "", base_url: "", cost_cap_usd: 0.25 };
const view: AiView = { settings, providers };

describe("engine kinds", () => {
  it("maps a provider id to the screen's three kinds", () => {
    expect(kindOfProvider("")).toBe("timing");
    expect(kindOfProvider("compatible")).toBe("local");
    expect(kindOfProvider("local")).toBe("local");
    expect(kindOfProvider("claude")).toBe("key");
    expect(kindOfProvider("openrouter")).toBe("key");
  });

  it("maps a kind back to a provider id", () => {
    expect(providerIdForKind("timing", "claude")).toBe("");
    expect(providerIdForKind("local", "claude")).toBe("compatible");
    expect(providerIdForKind("key", "openai")).toBe("openai");
  });

  it("lists cloud providers without the compatible one", () => {
    expect(cloudProviders(providers).map((x) => x.id)).toEqual(["claude", "openai", "openrouter"]);
  });

  it("never lists the built-in engine as a company to bring a key to", () => {
    expect(cloudProviders([...providers, p("local", { needs_key: false })]).map((x) => x.id)).toEqual(["claude", "openai", "openrouter"]);
  });

  it("tells LM Studio from Ollama by its address", () => {
    expect(localEngineFor("http://localhost:1234").name).toBe("LM Studio");
    expect(localEngineFor("http://127.0.0.1:1234/v1").name).toBe("LM Studio");
    expect(localEngineFor("http://localhost:11434").name).toBe("Ollama");
    expect(localEngineFor("").name).toBe("Ollama");
    expect(localEngineFor("http://studio.local:9000").name).toBe("Ollama");
  });
});

describe("model dropdown", () => {
  it("lists the real ids, marks the scoring default, and ends with Other model", () => {
    expect(modelChoices(claude)).toEqual(["claude-opus-4", "claude-sonnet-4", "claude-haiku-4 (recommended)", OTHER_MODEL]);
    expect(OTHER_MODEL).toBe("Other model…");
  });

  it("offers only Other model when the provider lists none", () => {
    expect(modelChoices(openrouter)).toEqual([OTHER_MODEL]);
    expect(modelChoices(compatible)).toEqual([OTHER_MODEL]);
  });

  it("does not mark anything when the default is not in the list", () => {
    expect(modelChoices(p("x", { models: ["a", "b"], fast_default: "zzz" }))).toEqual(["a", "b", OTHER_MODEL]);
  });

  it("turns a choice back into a model id", () => {
    expect(modelFromChoice("claude-haiku-4 (recommended)")).toBe("claude-haiku-4");
    expect(modelFromChoice("claude-opus-4")).toBe("claude-opus-4");
    expect(modelFromChoice(OTHER_MODEL)).toBeNull();
  });

  it("shows the provider default when nothing is chosen", () => {
    expect(shownModel(claude, settings)).toEqual({ choice: "claude-haiku-4 (recommended)", typed: "" });
  });

  it("shows a listed choice", () => {
    expect(shownModel(claude, { ...settings, fast_model: "claude-opus-4" })).toEqual({ choice: "claude-opus-4", typed: "" });
  });

  it("shows Other model with the typed id when the saved one is not listed", () => {
    expect(shownModel(claude, { ...settings, fast_model: "claude-next" })).toEqual({ choice: OTHER_MODEL, typed: "claude-next" });
  });

  it("shows Other model with nothing typed when there is no default and nothing saved", () => {
    expect(shownModel(compatible, { ...settings, provider: "compatible" })).toEqual({ choice: OTHER_MODEL, typed: "" });
  });

  it("stores the default as empty so it follows the provider", () => {
    expect(withModelChoice(claude, { ...settings, fast_model: "claude-opus-4" }, "claude-haiku-4 (recommended)").fast_model).toBe("");
    expect(withModelChoice(claude, settings, "claude-sonnet-4").fast_model).toBe("claude-sonnet-4");
  });

  it("keeps what was typed when Other model is picked", () => {
    expect(withModelChoice(claude, { ...settings, fast_model: "claude-next" }, OTHER_MODEL).fast_model).toBe("claude-next");
    expect(withModelChoice(claude, settings, OTHER_MODEL).fast_model).toBe("");
  });

  it("stores a typed model id, trimmed", () => {
    expect(withTypedModel(settings, "  llama3.2 ").fast_model).toBe("llama3.2");
  });
});

describe("advanced models", () => {
  it("starts with Automatic and the default, then the real ids", () => {
    expect(advancedChoices(claude, "fast", "")).toEqual(["Automatic · claude-haiku-4", "claude-opus-4", "claude-sonnet-4", "claude-haiku-4"]);
    expect(advancedChoices(claude, "strong", "")[0]).toBe("Automatic · claude-opus-4");
  });

  it("says Automatic follows the model above when there is no default", () => {
    expect(advancedChoices(openrouter, "fast", "")).toEqual(["Automatic · the model above"]);
  });

  it("includes a typed model that is not in the list", () => {
    expect(advancedChoices(claude, "fast", "claude-next")).toContain("claude-next");
  });

  it("reads and writes the value", () => {
    expect(advancedValue(claude, "fast", "")).toBe("Automatic · claude-haiku-4");
    expect(advancedValue(claude, "strong", "claude-sonnet-4")).toBe("claude-sonnet-4");
    expect(fromAdvanced("Automatic · claude-haiku-4")).toBe("");
    expect(fromAdvanced("claude-sonnet-4")).toBe("claude-sonnet-4");
    expect(withWriting(settings, "claude-sonnet-4").strong_model).toBe("claude-sonnet-4");
    expect(withWriting(settings, "Automatic · claude-opus-4").strong_model).toBe("");
  });
});

describe("spending cap", () => {
  it("maps the options to dollars", () => {
    expect(capValue("None")).toBe(0);
    expect(capValue("25 cents")).toBe(0.25);
    expect(capValue("1 dollar")).toBe(1);
    expect(capValue("5 dollars")).toBe(5);
  });

  it("maps dollars to the options", () => {
    expect(capLabel(0)).toBe("None");
    expect(capLabel(0.25)).toBe("25 cents");
    expect(capLabel(1)).toBe("1 dollar");
    expect(capLabel(5)).toBe("5 dollars");
  });

  it("lists the five options, and adds an unusual saved cap so it shows", () => {
    expect(capOptions(0.25)).toEqual(["None", "25 cents", "50 cents", "1 dollar", "5 dollars"]);
    expect(capOptions(2)).toEqual(["None", "25 cents", "50 cents", "1 dollar", "5 dollars", "2 dollars"]);
    expect(capLabel(2)).toBe("2 dollars");
    expect(capValue("2 dollars")).toBe(2);
  });

  it("changes only the cap", () => {
    expect(withCap(settings, "5 dollars")).toEqual({ ...settings, cost_cap_usd: 5 });
  });
});

describe("initial state", () => {
  it("reads a cloud engine", () => {
    expect(initialState(view)).toEqual({ kind: "key", cloudId: "claude", settings });
  });

  it("reads a local engine and remembers a cloud one for later", () => {
    const s = initialState({ settings: { ...settings, provider: "compatible", base_url: "http://localhost:1234" }, providers });
    expect(s.kind).toBe("local");
    expect(s.cloudId).toBe("claude");
  });

  it("reads timing only, preferring a provider that already has a key", () => {
    const s = initialState({ settings: { ...settings, provider: "" }, providers: [openai, { ...claude, has_key: true }, openrouter, compatible] });
    expect(s.kind).toBe("timing");
    expect(s.cloudId).toBe("claude");
  });

  it("falls back to the first cloud provider when none has a key", () => {
    expect(initialState({ settings: { ...settings, provider: "" }, providers: [openai, { ...claude, has_key: false }, compatible] }).cloudId).toBe("openai");
  });
});

describe("changing the engine", () => {
  const start = initialState(view);

  it("switching to timing only clears the provider and models and keeps the cap and the remembered provider", () => {
    const s = withKind({ ...start, settings: { ...settings, fast_model: "claude-opus-4" } }, "timing", providers);
    expect(s.kind).toBe("timing");
    expect(s.settings).toMatchObject({ provider: "", fast_model: "", cost_cap_usd: 0.25 });
    expect(s.cloudId).toBe("claude");
  });

  it("switching to local uses compatible and the Ollama address, with no model carried over", () => {
    const s = withKind({ ...start, settings: { ...settings, fast_model: "claude-opus-4" } }, "local", providers);
    expect(s.settings).toMatchObject({ provider: "compatible", base_url: "http://localhost:11434", fast_model: "", strong_model: "" });
  });

  it("switching back to your own key uses the remembered provider", () => {
    const local = withKind(start, "local", providers);
    expect(withKind(local, "key", providers).settings).toMatchObject({ provider: "claude", base_url: "" });
  });

  it("changing the cloud provider clears the models", () => {
    const s = withProvider({ ...start, settings: { ...settings, fast_model: "claude-opus-4", strong_model: "claude-opus-4" } }, "openai", providers);
    expect(s.cloudId).toBe("openai");
    expect(s.settings).toMatchObject({ provider: "openai", fast_model: "", strong_model: "" });
  });

  it("changing the local engine sets its address and clears the models", () => {
    const local = withKind(start, "local", providers);
    const s = withLocalEngine({ ...local, settings: { ...local.settings, fast_model: "llama3.2" } }, "LM Studio");
    expect(s.settings).toMatchObject({ provider: "compatible", base_url: "http://localhost:1234", fast_model: "" });
  });

  it("selects the built-in engine as provider local with no address and no model carried over", () => {
    const local = withKind(start, "local", providers);
    const s = withLocalEngine({ ...local, settings: { ...local.settings, fast_model: "llama3.2", strong_model: "x" } }, "Built-in local AI");
    expect(s.settings).toMatchObject({ provider: "local", base_url: "", fast_model: "", strong_model: "" });
    expect(s.kind).toBe("local");
    expect(localEngineOf(s.settings).name).toBe("Built-in local AI");
  });

  it("goes from the built-in engine back to Ollama or to a key", () => {
    const built = withLocalEngine(withKind(start, "local", providers), "Built-in local AI");
    expect(withLocalEngine(built, "Ollama").settings).toMatchObject({ provider: "compatible", base_url: "http://localhost:11434", fast_model: "" });
    expect(withKind({ ...built, settings: { ...built.settings, fast_model: "qwen3.5-9b" } }, "key", providers).settings).toMatchObject({ provider: "claude", base_url: "", fast_model: "" });
  });

  it("does not select an engine that is not in the list", () => {
    const local = withKind(start, "local", providers);
    expect(withLocalEngine(local, "Something else")).toBe(local);
  });

  it("only picks a built-in engine while on this computer", () => {
    expect(withLocalEngine(start, "Built-in local AI")).toBe(start);
  });
});

describe("the built-in local AI", () => {
  const model = (id: string, over: object = {}) => ({ id, name: id, maker: "m", note: "n", licence: "Apache 2.0", size_mb: 2740, recommended: false, state: "missing" as const, ...over });
  const status: LocalAiView = { models: [model("qwen3.5-4b", { name: "Qwen3.5 4B", recommended: true }), model("qwen3.5-9b", { size_mb: 5680 })], selected: "qwen3.5-4b", helper_found: true };
  const builtIn = { ...settings, provider: "local" };

  it("is read as the on this computer kind, and the settings round trip untouched", () => {
    const s = initialState({ settings: { ...builtIn, fast_model: "qwen3.5-9b" }, providers });
    expect(s.kind).toBe("local");
    expect(s.settings).toEqual({ ...builtIn, fast_model: "qwen3.5-9b" });
    expect(localEngineOf(s.settings).name).toBe("Built-in local AI");
    expect(s.cloudId).toBe("claude");
  });

  it("keeps the compatible engines on compatible", () => {
    expect(localEngineOf({ ...settings, provider: "compatible", base_url: "http://localhost:1234" }).name).toBe("LM Studio");
    expect(localEngineOf({ ...settings, provider: "compatible", base_url: "" }).name).toBe("Ollama");
  });

  it("shows the recommended model when nothing, or a model that is not local, is saved", () => {
    expect(localModelOf(status, builtIn)?.id).toBe("qwen3.5-4b");
    expect(localModelOf(status, { ...builtIn, fast_model: "claude-haiku-4" })?.id).toBe("qwen3.5-4b");
  });

  it("shows the saved local model", () => {
    expect(localModelOf(status, { ...builtIn, fast_model: "qwen3.5-9b" })?.id).toBe("qwen3.5-9b");
  });

  it("has no model to show before the list has loaded", () => {
    expect(localModelOf(null, builtIn)).toBeNull();
    expect(localModelOf({ ...status, models: [] }, builtIn)).toBeNull();
  });

  it("stores the recommended model as empty so it keeps following the recommendation", () => {
    expect(withLocalModel(status, { ...builtIn, fast_model: "qwen3.5-9b" }, "qwen3.5-4b").fast_model).toBe("");
    expect(withLocalModel(status, builtIn, "qwen3.5-9b")).toEqual({ ...builtIn, fast_model: "qwen3.5-9b" });
    expect(withLocalModel(status, builtIn, "nope")).toBe(builtIn);
  });

  it("says in plain words where a model stands", () => {
    expect(localModelLine(model("a", { state: "ready" }))).toBe("Ready");
    expect(localModelLine(model("a", { state: "on_this_computer" }))).toBe("Found on this computer");
    expect(localModelLine(model("a", { state: "missing" }))).toBe("Download the model to use it");
    expect(localModelLine(model("a", { state: "partial", fraction: 0.4 }))).toBe("Partly downloaded, 40%");
    expect(localModelLine(model("a", { state: "downloading", fraction: 0.25 }))).toBe("Downloading, 25%");
    expect(localModelLine(model("a", { state: "downloading_elsewhere" }))).toBe("Another Craft Concepts app is downloading it");
  });

  it("counts a model as here only when it is complete on this computer", () => {
    expect(localModelHere(model("a", { state: "ready" }))).toBe(true);
    expect(localModelHere(model("a", { state: "on_this_computer" }))).toBe(true);
    for (const state of ["missing", "partial", "downloading", "downloading_elsewhere"] as const) expect(localModelHere(model("a", { state }))).toBe(false);
  });

  it("says what a delete did", () => {
    expect(localDeletedLine("Qwen3.5 4B", "erased")).toBe("Qwen3.5 4B is deleted from this computer.");
    expect(localDeletedLine("Qwen3.5 4B", "kept")).toContain("stays on this computer");
    expect(localDeletedLine("Qwen3.5 4B", "not_using")).toBe("Ensayo wasn't using Qwen3.5 4B.");
  });
});

describe("what leaves this computer", () => {
  it("names the assistant for each provider", () => {
    expect(assistantName("claude")).toBe("Claude");
    expect(assistantName("openai")).toBe("GPT");
    expect(assistantName("gemini")).toBe("Gemini");
    expect(assistantName("mistral")).toBe("Mistral");
    expect(assistantName("groq")).toBe("the model you pick");
    expect(assistantName("openrouter")).toBe("the model you pick");
  });

  it("derives the setup for a cloud engine", () => {
    expect(privacySetup(view)).toEqual({ ai: "key", provider: "Claude", assistant: "Claude" });
  });

  it("derives the setup for timing only", () => {
    expect(privacySetup({ settings: { ...settings, provider: "" }, providers }).ai).toBe("timing");
  });

  it("derives the setup for a server on this computer", () => {
    expect(privacySetup({ settings: { ...settings, provider: "compatible", base_url: "http://localhost:11434" }, providers }).ai).toBe("local");
    expect(privacySetup({ settings: { ...settings, provider: "compatible", base_url: "" }, providers }).ai).toBe("local");
  });

  it("counts the built-in engine as staying on this computer, with or without its model yet", () => {
    expect(privacySetup({ settings: { ...settings, provider: "local" }, providers })).toEqual({ ai: "local", provider: "", assistant: "the local model" });
    expect(privacySetup({ settings: { ...settings, provider: "local", fast_model: "qwen3.5-9b", base_url: "https://llm.example.com" }, providers }).ai).toBe("local");
  });

  it("lists the built-in engine's transcripts and stories as staying here", () => {
    const setup = privacySetup({ settings: { ...settings, provider: "local" }, providers });
    const rows = leavesRows({ speech: "Whisper", speechLocal: true, ...setup });
    const mine = rows.filter((r) => r.title === "Transcripts of your answers" || r.title.startsWith("Stories"));
    expect(mine).toHaveLength(2);
    expect(mine.every((r) => r.stays && r.badge === "Stays here")).toBe(true);
  });

  it("does not claim a server elsewhere stays on this computer", () => {
    const s = privacySetup({ settings: { ...settings, provider: "compatible", base_url: "https://llm.example.com/v1" }, providers });
    expect(s).toEqual({ ai: "key", provider: "llm.example.com", assistant: "the model you pick" });
  });

  it("treats a server on the home network as this side of the door", () => {
    expect(privacySetup({ settings: { ...settings, provider: "compatible", base_url: "http://192.168.1.20:1234" }, providers }).ai).toBe("local");
  });
});

describe("test line", () => {
  it("says how many models were found", () => {
    expect(testedLine(1)).toBe("Works. Found 1 model.");
    expect(testedLine(12)).toBe("Works. Found 12 models.");
    expect(testedLine(0)).toBe("Works.");
  });

  it("passes a plain-words rejection through", () => {
    expect(explainTestError("That key was not accepted.")).toBe("That key was not accepted.");
    expect(explainTestError(new Error("The server did not answer."))).toBe("The server did not answer.");
  });

  it("falls back to a plain sentence for anything else", () => {
    expect(explainTestError(undefined)).toBe("That didn't work. Check it and try again.");
    expect(explainTestError("")).toBe("That didn't work. Check it and try again.");
  });
});

describe("Ollama and LM Studio found on this computer", () => {
  const ollama: DetectedServer = { kind: "ollama", base_url: "http://127.0.0.1:11434", api_base: "http://127.0.0.1:11434/v1", running: true, models: [{ id: "llama3.2:3b", context_length: 131072 }] };
  const lmStudio: DetectedServer = { kind: "lm_studio", base_url: "http://127.0.0.1:1234", api_base: "http://127.0.0.1:1234/v1", running: true, models: [{ id: "qwen3-8b", context_length: 40960 }, { id: "tiny", context_length: null }] };
  const onOllama = (base_url: string): AiScreenState => ({ kind: "local", cloudId: "claude", settings: { ...settings, provider: "compatible", base_url } });

  it("matches each engine to its own server", () => {
    expect(serverFor([ollama, lmStudio], localEngineFor("http://localhost:11434"))).toBe(ollama);
    expect(serverFor([ollama, lmStudio], localEngineFor("http://localhost:1234"))).toBe(lmStudio);
    expect(serverFor([lmStudio], localEngineFor("http://localhost:11434"))).toBeUndefined();
    expect(serverFor(null, localEngineFor(""))).toBeUndefined();
  });

  it("fills in the found address when the address is empty or still the usual one", () => {
    expect(withDetectedServer(onOllama(""), [ollama]).settings.base_url).toBe("http://127.0.0.1:11434");
    expect(withDetectedServer(onOllama("http://localhost:11434"), [ollama]).settings.base_url).toBe("http://127.0.0.1:11434");
    expect(withDetectedServer(onOllama("http://localhost:1234"), [ollama, lmStudio]).settings.base_url).toBe("http://127.0.0.1:1234");
  });

  it("leaves an address the person typed alone, and changes nothing when nothing was found or it already matches", () => {
    const typed = onOllama("http://192.168.1.20:11434");
    expect(withDetectedServer(typed, [ollama])).toBe(typed);
    const same = onOllama("http://127.0.0.1:11434/");
    expect(withDetectedServer(same, [ollama])).toBe(same);
    const plain = onOllama("");
    expect(withDetectedServer(plain, [])).toBe(plain);
    expect(withDetectedServer(plain, null)).toBe(plain);
  });

  it("does nothing for the built-in engine or a cloud key", () => {
    const builtIn: AiScreenState = { kind: "local", cloudId: "claude", settings: { ...settings, provider: "local" } };
    expect(withDetectedServer(builtIn, [ollama])).toBe(builtIn);
    const cloud: AiScreenState = { kind: "key", cloudId: "claude", settings };
    expect(withDetectedServer(cloud, [ollama])).toBe(cloud);
  });

  it("says each context size in plain words", () => {
    expect(contextLine(131072)).toBe("128K context");
    expect(contextLine(40960)).toBe("40K context");
    expect(contextLine(512)).toBe("512 context");
    expect(contextLine(null)).toBe("context size not given");
  });

  it("says what was found, or what to do when nothing was", () => {
    expect(detectedLine("Ollama", undefined, true)).toBe("Looking for Ollama on this computer…");
    expect(detectedLine("Ollama", undefined, false)).toBe("Ensayo didn't find Ollama running on this computer. Start it and press Look again, or type its address.");
    expect(detectedLine("Ollama", ollama, false)).toBe("Ollama is running. Pick one of its model:");
    expect(detectedLine("LM Studio", lmStudio, false)).toBe("LM Studio is running. Pick one of its 2 models:");
    expect(detectedLine("Ollama", { ...ollama, models: [] }, false)).toContain("has no models yet");
    expect(detectedLine("Ollama", { ...ollama, running: false }, false)).toContain("couldn't read its list of models");
  });
});
