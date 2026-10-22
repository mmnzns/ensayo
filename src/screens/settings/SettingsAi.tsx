// Draft generated from Design/screens/html/8-5-settings-ai.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isApp } from "../../data/real";
import { useStore } from "../../data/store";
import type { AiKind } from "../../data/screens/settings";
import {
  LOCAL_ENGINES,
  OTHER_MODEL,
  advancedChoices,
  advancedValue,
  capLabel,
  capOptions,
  cloudProviders,
  explainTestError,
  initialState,
  isLocalAddress,
  localEngineFor,
  modelChoices,
  shownModel,
  testedLine,
  withCap,
  withKind,
  withLocalEngine,
  withModelChoice,
  withProvider,
  withScoring,
  withTypedModel,
  withWriting,
  type AiScreenState,
  type AiView,
  type ProviderInfo,
} from "./aiSettings";
import { formatCents } from "./format";
import { CheckIcon, KeyResult, SettingsLayout, useKeyTests } from "./parts";

const KINDS: { id: AiKind; title: string; blurb: string }[] = [
  { id: "local", title: "On this computer", blurb: "Local AI, Ollama or LM Studio. Private, offline, slower." },
  { id: "key", title: "Your own key", blurb: "Sharpest feedback. You pay the provider directly." },
  { id: "timing", title: "Timing only", blurb: "No AI. Speed, length and fillers." },
];

const OTHER = "Other model…";
/** A choice that is no longer in the list (the provider changed) falls back to the first one. */
const pick = (options: string[], value: string | undefined) => (value && options.includes(value) ? value : options[0]);

/** In the app the screen is driven by the real settings; in the browser preview it stays the mock below. */
export default function SettingsAi() {
  return isApp() ? <SettingsAiLive /> : <SettingsAiMock />;
}

function SettingsAiMock() {
  const { ai } = useStore().screens.settings;
  const [kind, setKind] = useState<AiKind>(ai.kind);
  const [cloudName, setCloudName] = useState(ai.provider);
  const [localName, setLocalName] = useState(ai.local[0].name);
  const [models, setModels] = useState<Record<string, string>>({});
  const [otherModel, setOtherModel] = useState("");
  const [address, setAddress] = useState("");
  const [keys, setKeys] = useState<Record<string, string>>({ [ai.provider]: ai.sampleKey });
  const [scoring, setScoring] = useState<string>();
  const [writing, setWriting] = useState<string>();
  const [cap, setCap] = useState(ai.cap);
  // The sample provider's key already works, as in the design.
  const tests = useKeyTests({ [ai.provider]: "ok" });

  const providers = kind === "local" ? ai.local : ai.cloud;
  const providerName = kind === "local" ? localName : cloudName;
  const provider = providers.find((p) => p.name === providerName) ?? providers[0];
  const model = pick(provider.models, models[provider.name]);
  const key = keys[provider.name] ?? "";

  const setProvider = (name: string) => (kind === "local" ? setLocalName(name) : setCloudName(name));
  const scoringOptions = provider.scoring;
  const writingOptions = provider.writing;

  return (
    <SettingsLayout active="8-5-settings-ai">
      <div style={{ flex: "999 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span className="e-h2">Feedback engine</span>
            <span className="e-meta">The AI that judges your answers and asks the follow-ups. Timing and filler words always work without one.</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px" }} role="radiogroup" aria-label="Feedback engine">
            {KINDS.map((k) => (
              <label key={k.id} className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "16px", boxShadow: kind === k.id ? "inset 0 0 0 2px var(--e-primary)" : "inset 0 0 0 1.5px var(--e-line)", cursor: "pointer", ...(kind === k.id ? {} : { background: "var(--e-surface)" }) }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input type="radio" name="kind" className="e-check" checked={kind === k.id} onChange={() => setKind(k.id)} />
                  <span className="e-h3" style={{ fontSize: "15px" }}>{k.title}</span>
                </span>
                <span className="e-small">{k.blurb}</span>
              </label>
            ))}
          </div>
          {kind === "timing" ? (
            <span className="e-meta">Ensayo will tell you how fast you got to the point, how long you ran and how many filler words you used. Notes on what you said need an AI engine; you can add one any time.</span>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
                <div className="e-field">
                  <label htmlFor="pv">{kind === "local" ? "Engine" : "Provider"}</label>
                  <select id="pv" className="e-input" value={provider.name} onChange={(e) => setProvider(e.target.value)}>
                    {providers.map((p) => (
                      <option key={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="e-field">
                  <label htmlFor="md">Model</label>
                  <select id="md" className="e-input" value={model} onChange={(e) => setModels((m) => ({ ...m, [provider.name]: e.target.value }))}>
                    {provider.models.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
              {(model === OTHER || provider.asksForAddress) && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
                  {provider.asksForAddress && (
                    <div className="e-field">
                      <label htmlFor="ad">Server address</label>
                      <input id="ad" className="e-input" placeholder="https://" value={address} onChange={(e) => setAddress(e.target.value)} />
                    </div>
                  )}
                  {model === OTHER && (
                    <div className="e-field">
                      <label htmlFor="om">Model name</label>
                      <input id="om" className="e-input" placeholder="Exactly as the provider spells it" value={otherModel} onChange={(e) => setOtherModel(e.target.value)} />
                    </div>
                  )}
                </div>
              )}
              {provider.needsKey ? (
                <div className="e-field">
                  <label htmlFor="ky">API key</label>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <input
                      id="ky"
                      className="e-input"
                      type="password"
                      placeholder="Paste key"
                      value={key}
                      onChange={(e) => {
                        setKeys((s) => ({ ...s, [provider.name]: e.target.value }));
                        tests.clear(provider.name);
                      }}
                      style={{ flex: "1" }}
                    />
                    <button type="button" className="e-btn e-btn-soft e-btn-sm" style={{ minHeight: "48px" }} disabled={tests.status[provider.name] === "testing"} onClick={() => tests.test(provider.name, key)}>Test</button>
                  </div>
                  <KeyResult status={tests.status[provider.name]} empty={!key.trim()} />
                </div>
              ) : (
                <span className="e-meta">No key needed. Ensayo looks for {provider.name === "Built-in local AI" ? "the model it downloads for you" : provider.name} on this computer, and nothing you say leaves it.</span>
              )}
            </>
          )}
        </section>
        {kind !== "timing" && (
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingBottom: "8px" }}>
              <span className="e-h3">Advanced</span>
              <span className="e-small">Most people never change these.</span>
            </div>
            <div className="e-rowline">
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                Model for scoring and follow-ups<span className="e-small">Fast and cheap; runs after every answer.</span>
              </span>
              <select className="e-input" style={{ width: "240px" }} aria-label="Scoring model" value={pick(scoringOptions, scoring)} onChange={(e) => setScoring(e.target.value)}>
                {scoringOptions.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>
            <div className="e-rowline" style={kind === "local" ? { borderBottom: "none" } : undefined}>
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                Model for coach notes and job postings<span className="e-small">Stronger; runs less often.</span>
              </span>
              <select className="e-input" style={{ width: "240px" }} aria-label="Writing model" value={pick(writingOptions, writing)} onChange={(e) => setWriting(e.target.value)}>
                {writingOptions.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>
            {kind === "key" && (
              <div className="e-rowline" style={{ borderBottom: "none" }}>
                <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                  Spending cap per session<span className="e-small">Ensayo switches to timing only if a session would go over.</span>
                </span>
                <select className="e-input" style={{ width: "240px" }} aria-label="Spending cap" value={cap} onChange={(e) => setCap(e.target.value)}>
                  {ai.spendingCaps.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}
          </section>
        )}
        {kind === "key" && <span className="e-small">Last 7 days: about {formatCents(ai.usage.cents)} across {ai.usage.sessions} sessions.</span>}
      </div>
    </SettingsLayout>
  );
}

// ---------- In the app ----------

type TestState = { sig: string; status: "testing" | "ok" | "bad" | "empty"; line: string };

function SettingsAiLive() {
  const [view, setView] = useState<AiView | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    invoke<AiView>("ai_settings").then(setView, () => setFailed(true));
  }, []);
  if (!view) {
    return (
      <SettingsLayout active="8-5-settings-ai">
        <span className="e-meta" role="status">
          {failed ? "Ensayo couldn't read its AI settings. Close it and open it again, and if this keeps happening, tell us in Feedback." : "Loading your settings…"}
        </span>
      </SettingsLayout>
    );
  }
  return <SettingsAiBody view={view} />;
}

const fallbackProvider = (id: string): ProviderInfo => ({ id, name: id, models: [], fast_default: "", strong_default: "", has_key: false, needs_key: id !== "compatible", base_default: "" });

function SettingsAiBody({ view }: { view: AiView }) {
  const { providers } = view;
  const [st, setSt] = useState<AiScreenState>(() => initialState(view));
  const [hasKey, setHasKey] = useState<Record<string, boolean>>(() => Object.fromEntries(providers.map((p) => [p.id, p.has_key])));
  const [typedKey, setTypedKey] = useState("");
  const [otherOpen, setOtherOpen] = useState(false);
  const [test, setTest] = useState<TestState | null>(null);
  const [found, setFound] = useState<string[]>([]);
  const [problem, setProblem] = useState("");

  // Settings save a moment after the last change, and straight away if the screen is left first. The key is never kept here: it goes to the key store and the box empties.
  const latest = useRef(st.settings);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flush = useRef(() => {});
  flush.current = () => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    invoke("save_ai_settings", { ai: latest.current }).then(
      () => setProblem(""),
      (e) => setProblem(explainTestError(e)),
    );
  };
  useEffect(() => () => flush.current(), []);

  const typedRef = useRef("");
  const hasKeyRef = useRef(hasKey);
  const keySave = useRef<Promise<string | null>>(Promise.resolve(null));
  const markKey = (id: string, has: boolean) => {
    hasKeyRef.current = { ...hasKeyRef.current, [id]: has };
    setHasKey(hasKeyRef.current);
  };
  const typeKey = (value: string) => {
    typedRef.current = value;
    setTypedKey(value);
  };

  const { kind, settings } = st;
  const cloud = cloudProviders(providers);
  const provider = providers.find((p) => p.id === (kind === "local" ? "compatible" : st.cloudId)) ?? fallbackProvider(kind === "local" ? "compatible" : st.cloudId);
  const sig = `${settings.provider}|${settings.base_url}`;
  const result = test && test.sig === sig ? test : null;

  const change = (next: AiScreenState) => {
    setSt(next);
    latest.current = next.settings;
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush.current(), 350);
  };
  const moved = (next: AiScreenState) => {
    setOtherOpen(false);
    setFound([]);
    setTest(null);
    change(next);
  };

  /** Saves what is typed in the key box to the system key store (the key never goes into the settings file). Resolves to a plain-words problem, or null. */
  const storeKey = (): Promise<string | null> => {
    const key = typedRef.current.trim();
    if (!key) return keySave.current;
    const id = st.cloudId;
    typeKey("");
    keySave.current = invoke("save_api_key", { provider: id, key }).then(
      () => {
        markKey(id, true);
        return null;
      },
      (e) => {
        typeKey(key);
        return explainTestError(e);
      },
    );
    return keySave.current;
  };
  const removeKey = () => {
    const id = st.cloudId;
    invoke("clear_api_key", { provider: id }).then(
      () => {
        markKey(id, false);
        setTest(null);
      },
      (e) => setProblem(explainTestError(e)),
    );
  };

  const runTest = async () => {
    if (kind === "key") {
      const trouble = await storeKey();
      if (trouble) return setTest({ sig, status: "bad", line: trouble });
      if (!hasKeyRef.current[st.cloudId]) return setTest({ sig, status: "empty", line: "" });
    }
    setTest({ sig, status: "testing", line: "" });
    try {
      // With no key given, the saved one is tested.
      const r = await invoke<{ models: string[]; recommended: string | null }>("test_ai", { provider: settings.provider, baseUrl: kind === "local" ? settings.base_url : undefined });
      setFound(r.models);
      setTest({ sig, status: "ok", line: testedLine(r.models.length) });
    } catch (e) {
      setTest({ sig, status: "bad", line: explainTestError(e) });
    }
  };

  const shown = shownModel(provider, settings);
  const choice = otherOpen ? OTHER_MODEL : shown.choice;
  const showTyped = choice === OTHER_MODEL;
  const engine = localEngineFor(settings.base_url);
  const keyed = !!typedKey || hasKey[st.cloudId];

  const testLine =
    result && (
      <span className="e-meta" role="status" style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: result.status === "ok" ? "var(--e-primary-dark)" : result.status === "testing" ? undefined : "var(--e-ink)" }}>
        {result.status === "ok" && <CheckIcon />}
        {result.status === "testing" ? "Testing…" : result.status === "empty" ? "Paste a key first." : result.line}
        {result.status === "ok" && kind === "key" && " Your key is kept in your system's secure key storage."}
      </span>
    );

  return (
    <SettingsLayout active="8-5-settings-ai">
      <div style={{ flex: "999 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span className="e-h2">Feedback engine</span>
            <span className="e-meta">The AI that judges your answers and asks the follow-ups. Timing and filler words always work without one.</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px" }} role="radiogroup" aria-label="Feedback engine">
            {KINDS.map((k) => (
              <label key={k.id} className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "16px", boxShadow: kind === k.id ? "inset 0 0 0 2px var(--e-primary)" : "inset 0 0 0 1.5px var(--e-line)", cursor: "pointer", ...(kind === k.id ? {} : { background: "var(--e-surface)" }) }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input type="radio" name="kind" className="e-check" checked={kind === k.id} onChange={() => moved(withKind(st, k.id, providers))} />
                  <span className="e-h3" style={{ fontSize: "15px" }}>{k.title}</span>
                </span>
                <span className="e-small">{k.blurb}</span>
              </label>
            ))}
          </div>
          {kind === "timing" ? (
            <span className="e-meta">Ensayo will tell you how fast you got to the point, how long you ran and how many filler words you used. Notes on what you said need an AI engine; you can add one any time.</span>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
                <div className="e-field">
                  <label htmlFor="pv">{kind === "local" ? "Engine" : "Provider"}</label>
                  {kind === "local" ? (
                    <select id="pv" className="e-input" value={engine.name} onChange={(e) => moved(withLocalEngine(st, e.target.value))}>
                      {LOCAL_ENGINES.map((e) => (
                        <option key={e.name} value={e.name} disabled={!e.available}>
                          {e.available ? e.name : `${e.name} · Not installed yet`}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select id="pv" className="e-input" value={st.cloudId} onChange={(e) => moved(withProvider(st, e.target.value, providers))}>
                      {cloud.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="e-field">
                  <label htmlFor="md">Model</label>
                  <select
                    id="md"
                    className="e-input"
                    value={choice}
                    onChange={(e) => {
                      setOtherOpen(e.target.value === OTHER_MODEL);
                      change({ ...st, settings: withModelChoice(provider, settings, e.target.value) });
                    }}
                  >
                    {modelChoices(provider).map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
              {(showTyped || kind === "local") && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
                  {kind === "local" && (
                    <div className="e-field">
                      <label htmlFor="ad">Server address</label>
                      <input id="ad" className="e-input" placeholder="http://localhost:11434" value={settings.base_url} onChange={(e) => change({ ...st, settings: { ...settings, base_url: e.target.value.trim() } })} />
                    </div>
                  )}
                  {showTyped && (
                    <div className="e-field">
                      <label htmlFor="om">Model name</label>
                      <input
                        id="om"
                        className="e-input"
                        list="found-models"
                        placeholder={kind === "local" ? "The name of a model you have installed" : "Exactly as the provider spells it"}
                        value={shown.typed}
                        onChange={(e) => change({ ...st, settings: withTypedModel(settings, e.target.value) })}
                      />
                      <datalist id="found-models">
                        {found.map((m) => (
                          <option key={m} value={m} />
                        ))}
                      </datalist>
                    </div>
                  )}
                </div>
              )}
              {kind === "key" ? (
                <div className="e-field">
                  <label htmlFor="ky">API key</label>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <input
                      id="ky"
                      className="e-input"
                      type="password"
                      autoComplete="off"
                      placeholder={hasKey[st.cloudId] ? "Saved. Paste a new key to replace it." : "Paste key"}
                      value={typedKey}
                      onChange={(e) => {
                        typeKey(e.target.value);
                        setTest(null);
                      }}
                      onBlur={() => void storeKey()}
                      style={{ flex: "1" }}
                    />
                    <button type="button" className="e-btn e-btn-soft e-btn-sm" style={{ minHeight: "48px" }} disabled={result?.status === "testing"} onClick={() => void runTest()}>Test</button>
                  </div>
                  {testLine}
                  {!result && hasKey[st.cloudId] && !typedKey && (
                    <span className="e-meta" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                      A key is saved in your system's secure key storage.
                      <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={removeKey}>Remove it</button>
                    </span>
                  )}
                  {!keyed && !result && <span className="e-meta">Ensayo needs a key from {provider.name} to give notes on your answers.</span>}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <span className="e-meta">
                    {isLocalAddress(settings.base_url)
                      ? `No key needed. Ensayo looks for ${engine.name} on this computer, and nothing you say leaves it.`
                      : "No key needed. That address is not on this computer, so what you say is sent there. Check that you trust it."}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                    <button type="button" className="e-btn e-btn-soft e-btn-sm" disabled={result?.status === "testing"} onClick={() => void runTest()}>Test</button>
                    {testLine}
                  </div>
                </div>
              )}
            </>
          )}
          {problem && (
            <span className="e-meta" role="status" style={{ color: "var(--e-ink)" }}>
              Ensayo couldn't save that change. {problem}
            </span>
          )}
        </section>
        {kind !== "timing" && (
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingBottom: "8px" }}>
              <span className="e-h3">Advanced</span>
              <span className="e-small">Most people never change these.</span>
            </div>
            <div className="e-rowline">
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                Model for judging answers and follow-ups<span className="e-small">Fast and cheap; runs after every answer.</span>
              </span>
              <select className="e-input" style={{ width: "240px" }} aria-label="Answer model" value={advancedValue(provider, "fast", settings.fast_model)} onChange={(e) => change({ ...st, settings: withScoring(settings, e.target.value) })}>
                {advancedChoices(provider, "fast", settings.fast_model).map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>
            <div className="e-rowline" style={kind === "local" ? { borderBottom: "none" } : undefined}>
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                Model for coach notes and job postings<span className="e-small">Stronger; runs less often.</span>
              </span>
              <select className="e-input" style={{ width: "240px" }} aria-label="Writing model" value={advancedValue(provider, "strong", settings.strong_model)} onChange={(e) => change({ ...st, settings: withWriting(settings, e.target.value) })}>
                {advancedChoices(provider, "strong", settings.strong_model).map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>
            {kind === "key" && (
              <div className="e-rowline" style={{ borderBottom: "none" }}>
                <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                  Spending cap per session<span className="e-small">Ensayo switches to timing only if a session would go over.</span>
                </span>
                <select className="e-input" style={{ width: "240px" }} aria-label="Spending cap" value={capLabel(settings.cost_cap_usd)} onChange={(e) => change({ ...st, settings: withCap(settings, e.target.value) })}>
                  {capOptions(settings.cost_cap_usd).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}
          </section>
        )}
      </div>
    </SettingsLayout>
  );
}
