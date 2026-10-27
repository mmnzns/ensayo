// Draft generated from Design/screens/html/8-5-settings-ai.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import { useState } from "react";
import { isApp } from "../../data/real";
import { useStore } from "../../data/store";
import type { AiKind } from "../../data/screens/settings";
import { EngineDetails, useAiEngine, useAiView } from "./AiEngine";
import { BUILT_IN, advancedChoices, advancedValue, capLabel, capOptions, withCap, withKind, withScoring, withWriting, type AiView } from "./aiSettings";
import { formatCents } from "./format";
import { KeyResult, SettingsLayout, useKeyTests } from "./parts";

const KINDS: { id: AiKind; title: string; blurb: string }[] = [
  { id: "local", title: "On this computer", blurb: "Local AI, Ollama or LM Studio. Private, offline, slower." },
  { id: "key", title: "Your own key", blurb: "Sharpest feedback. You pay the provider directly." },
  { id: "timing", title: "Timing only", blurb: "No AI. Speed, length and fillers." },
];

const OTHER = "Other model…";
/** A choice that is no longer in the list (the provider changed) falls back to the first one. */
const pick = (options: string[], value: string | undefined) => (value && options.includes(value) ? value : options[0]);

/** In the app the screen is driven by the real settings; in the browser preview it stays the mock below. */
/** What a session loses when it reaches the cap and switches to timing only. */
export const CAP_HINT = "If a session would go over, the rest of it is timing only: no coach note, no Try saying line, and no check of answering first or saying what you decided. Length, fillers, the number and the stop are still checked.";

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
                  Spending cap per session<span className="e-small">{CAP_HINT}</span>
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

function SettingsAiLive() {
  const { view, failed } = useAiView();
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

function SettingsAiBody({ view }: { view: AiView }) {
  const ai = useAiEngine(view);
  const { st, kind, settings, provider, change } = ai;
  const builtIn = settings.provider === BUILT_IN;

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
                  <input type="radio" name="kind" className="e-check" checked={kind === k.id} onChange={() => ai.moved(withKind(st, k.id, ai.providers))} />
                  <span className="e-h3" style={{ fontSize: "15px" }}>{k.title}</span>
                </span>
                <span className="e-small">{k.blurb}</span>
              </label>
            ))}
          </div>
          <EngineDetails ai={ai} />
        </section>
        {kind !== "timing" && !builtIn && (
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
                  Spending cap per session<span className="e-small">{CAP_HINT}</span>
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
