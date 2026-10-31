// Settings > AI in the app: plain functions between what the backend stores (provider ids, real model ids, dollars) and what the screen shows.
import type { AiKind } from "../../data/screens/settings";

/** What `ai_settings` returns and `save_ai_settings` takes. Empty `provider` is timing only; empty model means the provider's default. */
export interface AiSettings {
  provider: string;
  fast_model: string;
  strong_model: string;
  base_url: string;
  cost_cap_usd: number;
}

export interface ProviderInfo {
  id: string;
  name: string;
  models: string[];
  fast_default: string;
  strong_default: string;
  has_key: boolean;
  needs_key: boolean;
  base_default: string;
}

export interface AiView {
  settings: AiSettings;
  providers: ProviderInfo[];
}

/** The settings plus what the screen remembers for switching back and forth: which cloud provider "Your own key" meant. */
export interface AiScreenState {
  kind: AiKind;
  cloudId: string;
  settings: AiSettings;
}

/** Fired on `window` after the AI settings, a key or the local model changed, so the sidebar's engine line can read them again. */
export const AI_CHANGED = "ensayo:ai";
export const announceAiChange = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AI_CHANGED));
};

export const OTHER_MODEL = "Other model…";
const RECOMMENDED = " (recommended)";
const AUTOMATIC = "Automatic · ";
const COMPATIBLE = "compatible";
/** The provider id for the built-in local AI (Ensayo's own helper and a model on this computer). */
export const BUILT_IN = "local";

// ---------- Kinds and providers ----------

export const kindOfProvider = (id: string): AiKind => (id === "" ? "timing" : id === COMPATIBLE || id === BUILT_IN ? "local" : "key");

export function providerIdForKind(kind: AiKind, cloudId: string): string {
  return kind === "timing" ? "" : kind === "local" ? COMPATIBLE : cloudId;
}

/** Every provider that needs a key and a company behind it; the compatible one and the built-in one are the local engines. */
export const cloudProviders = (providers: ProviderInfo[]): ProviderInfo[] => providers.filter((p) => p.id !== COMPATIBLE && p.id !== BUILT_IN);

export interface LocalEngine {
  name: string;
  address: string;
  /** The provider id saved for this engine. */
  provider: string;
  available: boolean;
}

export const LOCAL_ENGINES: LocalEngine[] = [
  { name: "Built-in local AI", address: "", provider: BUILT_IN, available: true },
  { name: "Ollama", address: "http://localhost:11434", provider: COMPATIBLE, available: true },
  { name: "LM Studio", address: "http://localhost:1234", provider: COMPATIBLE, available: true },
];

const BUILT_IN_ENGINE = LOCAL_ENGINES[0];
const OLLAMA = LOCAL_ENGINES[1];
const LM_STUDIO = LOCAL_ENGINES[2];

/** Port 1234 is LM Studio's; anything else (including a typed address) is treated as Ollama. */
export function localEngineFor(baseUrl: string): LocalEngine {
  return /^https?:\/\/[^/]*:1234(\/|$)/i.test(baseUrl.trim()) ? LM_STUDIO : OLLAMA;
}

/** The engine the saved settings mean: the built-in one, or Ollama or LM Studio by address. */
export const localEngineOf = (s: AiSettings): LocalEngine => (s.provider === BUILT_IN ? BUILT_IN_ENGINE : localEngineFor(s.base_url));

const hostOf = (url: string): string => {
  const m = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^@/]*@)?(\[[^\]]*\]|[^/:?#]*)/i.exec(url.trim());
  return (m?.[1] ?? "").replace(/^\[|\]$/g, "").toLowerCase();
};

/** True for this computer and the home or office network; false for anything out on the internet. */
export function isLocalAddress(url: string): boolean {
  if (!url.trim()) return true;
  const h = hostOf(url);
  if (h === "" || h === "localhost" || h === "::1" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(h);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

// ---------- Model dropdown ----------

const labelFor = (p: ProviderInfo, id: string) => (id === p.fast_default ? `${id}${RECOMMENDED}` : id);

/** The real ids, the scoring default marked, and "Other model…" last. */
export const modelChoices = (p: ProviderInfo): string[] => [...p.models.map((id) => labelFor(p, id)), OTHER_MODEL];

/** The model id behind a dropdown choice; null for "Other model…". */
export const modelFromChoice = (choice: string): string | null => (choice === OTHER_MODEL ? null : choice.endsWith(RECOMMENDED) ? choice.slice(0, -RECOMMENDED.length) : choice);

/** What the Model dropdown shows now, and what the typed box holds when it is "Other model…". */
export function shownModel(p: ProviderInfo, s: AiSettings): { choice: string; typed: string } {
  const id = s.fast_model || p.fast_default;
  if (id && p.models.includes(id)) return { choice: labelFor(p, id), typed: "" };
  return { choice: OTHER_MODEL, typed: s.fast_model };
}

export function withModelChoice(p: ProviderInfo, s: AiSettings, choice: string): AiSettings {
  const id = modelFromChoice(choice);
  if (id === null) return { ...s, fast_model: p.models.includes(s.fast_model) ? "" : s.fast_model };
  // The provider's own default is stored as empty, so it keeps following the provider.
  return { ...s, fast_model: id === p.fast_default ? "" : id };
}

export const withTypedModel = (s: AiSettings, typed: string): AiSettings => ({ ...s, fast_model: typed.trim() });

// ---------- Advanced: scoring and writing models ----------

export type ModelRole = "fast" | "strong";

const defaultFor = (p: ProviderInfo, role: ModelRole) => (role === "fast" ? p.fast_default : p.strong_default);
const automatic = (p: ProviderInfo, role: ModelRole) => `${AUTOMATIC}${defaultFor(p, role) || "the model above"}`;

/** "Automatic · <default>" first, then the real ids; a saved id that is not listed (typed under Other model) is added so it shows. */
export function advancedChoices(p: ProviderInfo, role: ModelRole, current: string): string[] {
  const extra = current && !p.models.includes(current) ? [current] : [];
  return [automatic(p, role), ...p.models, ...extra];
}

export const advancedValue = (p: ProviderInfo, role: ModelRole, stored: string): string => (stored ? stored : automatic(p, role));
export const fromAdvanced = (option: string): string => (option.startsWith(AUTOMATIC) ? "" : option);
export const withScoring = (s: AiSettings, option: string): AiSettings => ({ ...s, fast_model: fromAdvanced(option) });
export const withWriting = (s: AiSettings, option: string): AiSettings => ({ ...s, strong_model: fromAdvanced(option) });

// ---------- Spending cap ----------

const CAPS: [string, number][] = [
  ["None", 0],
  ["25 cents", 0.25],
  ["50 cents", 0.5],
  ["1 dollar", 1],
  ["5 dollars", 5],
];

export function capLabel(usd: number): string {
  if (!(usd > 0)) return "None";
  if (usd < 1) return `${Math.round(usd * 100)} cents`;
  const text = String(Math.round(usd * 100) / 100);
  return `${text} ${usd === 1 ? "dollar" : "dollars"}`;
}

export function capValue(label: string): number {
  const known = CAPS.find(([l]) => l === label);
  if (known) return known[1];
  const m = /^([\d.]+)\s*(cents?|dollars?)$/.exec(label);
  if (!m) return 0;
  return m[2].startsWith("cent") ? Number(m[1]) / 100 : Number(m[1]);
}

/** The four options, plus a saved cap that is none of them so the list can still show it. */
export function capOptions(usd: number): string[] {
  const labels = CAPS.map(([l]) => l);
  const own = capLabel(usd);
  return labels.includes(own) ? labels : [...labels, own];
}

export const withCap = (s: AiSettings, label: string): AiSettings => ({ ...s, cost_cap_usd: capValue(label) });

// ---------- Whole-screen state ----------

export function initialState(view: AiView): AiScreenState {
  const { settings, providers } = view;
  const cloud = cloudProviders(providers);
  const kind = kindOfProvider(settings.provider);
  const cloudId = kind === "key" ? settings.provider : (cloud.find((p) => p.has_key) ?? cloud[0])?.id ?? "claude";
  return { kind, cloudId, settings };
}

const noModels = (s: AiSettings): AiSettings => ({ ...s, fast_model: "", strong_model: "" });

/** Moving to a different engine drops the model choices, which belong to the old one. */
export function withKind(state: AiScreenState, kind: AiKind, providers: ProviderInfo[]): AiScreenState {
  if (kind === state.kind) return state;
  const provider = providerIdForKind(kind, state.cloudId);
  const base = kind === "local" ? (providers.find((p) => p.id === COMPATIBLE)?.base_default || OLLAMA.address) : "";
  return { ...state, kind, settings: { ...noModels(state.settings), provider, base_url: kind === "timing" ? state.settings.base_url : base } };
}

export function withProvider(state: AiScreenState, id: string, providers: ProviderInfo[]): AiScreenState {
  if (state.kind !== "key" || !providers.some((p) => p.id === id) || id === state.cloudId) return state;
  return { ...state, cloudId: id, settings: { ...noModels(state.settings), provider: id, base_url: "" } };
}

export function withLocalEngine(state: AiScreenState, name: string): AiScreenState {
  const engine = LOCAL_ENGINES.find((e) => e.name === name);
  if (state.kind !== "local" || !engine || !engine.available) return state;
  return { ...state, settings: { ...noModels(state.settings), provider: engine.provider, base_url: engine.address } };
}

// ---------- The built-in local AI ----------

export interface LocalModel {
  id: string;
  name: string;
  maker: string;
  note: string;
  licence: string;
  size_mb: number;
  recommended: boolean;
  /** "ready" (Ensayo uses it), "on_this_computer" (a copy another app downloaded, used where it is), "missing", "partial" (an interrupted download), "downloading" (here) or "downloading_elsewhere" (another app is fetching it). */
  state: "ready" | "on_this_computer" | "missing" | "partial" | "downloading" | "downloading_elsewhere";
  fraction?: number;
}

/** What `local_ai_status` returns. */
export interface LocalAiView {
  models: LocalModel[];
  selected: string;
  helper_found: boolean;
}

/** The model the settings mean: the saved one, or the recommended one when none (or one that is not a local model) is saved. Null before the list is known. */
export function localModelOf(status: LocalAiView | null, s: AiSettings): LocalModel | null {
  const models = status?.models ?? [];
  return models.find((m) => m.id === s.fast_model) ?? models.find((m) => m.recommended) ?? models[0] ?? null;
}

/** The recommended model is stored as empty, so it keeps following the recommendation. */
export function withLocalModel(status: LocalAiView, s: AiSettings, id: string): AiSettings {
  const m = status.models.find((x) => x.id === id);
  if (!m) return s;
  return { ...s, fast_model: m.recommended ? "" : m.id };
}

export function localModelLine(m: LocalModel): string {
  const percent = Math.round(Math.min(1, Math.max(0, m.fraction ?? 0)) * 100);
  switch (m.state) {
    case "ready":
      return "Ready";
    case "on_this_computer":
      return "Found on this computer";
    case "partial":
      return `Partly downloaded, ${percent}%`;
    case "downloading":
      return `Downloading, ${percent}%`;
    case "downloading_elsewhere":
      return "Another Craft Concepts app is downloading it";
    default:
      return "Download the model to use it";
  }
}

/** On this computer completely, so it can be used and deleted. */
export const localModelHere = (m: LocalModel): boolean => m.state === "ready" || m.state === "on_this_computer";

/** The button that fetches a model: "Download" for nothing on disk, "Resume" for an interrupted download, none when it is here or being fetched. */
export const localFetchLabel = (m: LocalModel): "Download" | "Resume" | null => (m.state === "missing" ? "Download" : m.state === "partial" ? "Resume" : null);

/** What the person is told after Delete: "erased", "kept" (another app still uses it) or "not_using". */
export function localDeletedLine(name: string, result: string): string {
  return result === "kept"
    ? `${name} is no longer used by Ensayo. Another Craft Concepts app still uses it, so it stays on this computer.`
    : result === "erased"
      ? `${name} is deleted from this computer.`
      : `Ensayo wasn't using ${name}.`;
}

export function localProgressLine(fraction: number): string {
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  return `Downloading… ${Math.round(f * 100)}%`;
}

// ---------- What leaves this computer ----------

/** What the assistant is called in "Sent to X so Y can give feedback". */
export function assistantName(id: string): string {
  switch (id) {
    case "claude":
      return "Claude";
    case "openai":
      return "GPT";
    case "gemini":
      return "Gemini";
    case "mistral":
      return "Mistral";
    default:
      return "the model you pick";
  }
}

/** The `ai`, `provider` and `assistant` that `leavesRows` needs. A server out on the internet counts as sending, not as local. */
export function privacySetup(view: AiView): { ai: AiKind; provider: string; assistant: string } {
  const { settings, providers } = view;
  const id = settings.provider;
  if (id === "") return { ai: "timing", provider: "", assistant: "" };
  if (id === BUILT_IN) return { ai: "local", provider: "", assistant: "the local model" };
  if (id === COMPATIBLE) {
    if (isLocalAddress(settings.base_url)) return { ai: "local", provider: "", assistant: "the local model" };
    return { ai: "key", provider: hostOf(settings.base_url), assistant: "the model you pick" };
  }
  return { ai: "key", provider: providers.find((p) => p.id === id)?.name ?? id, assistant: assistantName(id) };
}

// ---------- The Test line ----------

export function testedLine(count: number): string {
  return count > 0 ? `Works. Found ${count} ${count === 1 ? "model" : "models"}.` : "Works.";
}

/** The backend rejects with a plain sentence; show it as given. */
export function explainTestError(e: unknown): string {
  const text = typeof e === "string" ? e : e instanceof Error ? e.message : "";
  return text.trim() || "That didn't work. Check it and try again.";
}
