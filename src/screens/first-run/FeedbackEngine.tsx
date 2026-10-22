// Draft generated from Design/screens/html/1-6-feedback-engine.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import { useEffect, useState } from "react";
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import { isApp } from "../../data/real";
import { useStore } from "../../data/store";
import type { EngineKind } from "../../data/screens/first-run";
import { EngineDetails, useAiEngine, useAiView } from "../settings/AiEngine";
import type { AiView } from "../settings/aiSettings";
import StepHeader from "./StepHeader";
import { useStepSave } from "./useStepSave";

const cardStyle = { display: "flex", flexDirection: "column", gap: "10px", padding: "22px", cursor: "pointer" } as const;
const onStyle = { boxShadow: "inset 0 0 0 2px var(--e-primary)", background: "var(--e-tint)" } as const;

/** In the app the choices are the real ones from Settings > AI; in the browser preview the step stays the sample below. */
export default function FeedbackEngine() {
  return isApp() ? <FeedbackEngineLive /> : <FeedbackEngineMock />;
}

function FeedbackEngineLive() {
  const { view, failed } = useAiView();
  if (!view) {
    return (
      <FocusShell>
        <div className="e-wrap" style={{ width: "100%", gap: "28px" }}>
          <StepHeader step={6} skipTo="1-7-your-first-story" />
          <span className="e-meta" role="status">
            {failed ? "Ensayo couldn't read its AI settings. You can press Skip and set this up later in Settings, under AI." : "Loading your settings…"}
          </span>
        </div>
      </FocusShell>
    );
  }
  return <FeedbackEngineChoice view={view} />;
}

function FeedbackEngineChoice({ view }: { view: AiView }) {
  const { screens } = useStore();
  const ai = useAiEngine(view);
  const { kind } = ai;
  const { saving, problem, onContinue } = useStepSave("1-7-your-first-story");
  const [trouble, setTrouble] = useState("");
  const save = onContinue(async () => {
    // A key still sitting in the box goes to the key store first; if that fails, stay and say why.
    const t = await ai.saveNow();
    if (t) {
      setTrouble(t);
      throw new Error(t);
    }
  });
  const needsKey = kind === "key" && !ai.typedKey && !ai.hasKey[ai.st.cloudId];

  return (
    <FocusShell>
      <div className="e-wrap" style={{ width: "100%", gap: "28px" }}>
        <StepHeader step={6} skipTo="1-7-your-first-story" />
        <div style={{ maxWidth: "900px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "22px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span className="e-label">Step 6 of 7</span>
            <h1 className="e-h1">Who gives the feedback?</h1>
            <p className="e-meta" style={{ margin: "0" }}>Timing and filler words work with no setup. An AI engine adds the judgment: did you answer the question, say your numbers, own your decisions.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" }} role="radiogroup" aria-label="Feedback engine">
            {screens.firstRun.engines.map((e) => (
              <label key={e.kind} className="e-card" style={{ ...cardStyle, ...(kind === e.kind ? onStyle : {}) }}>
                <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <input type="radio" name="eng" className="e-check" checked={kind === e.kind} onChange={() => ai.chooseKind(e.kind)} />
                  <span className="e-h3">{e.title}</span>
                </span>
                <span className="e-meta">{e.blurb}</span>
                {e.kind === "key" && e.pill ? <span className="e-pill" style={{ alignSelf: "flex-start" }}>{e.pill}</span> : null}
              </label>
            ))}
          </div>
          {kind !== "timing" ? (
            <div className="e-card" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <EngineDetails ai={ai} guided />
              {kind === "key" ? <p className="e-small" style={{ margin: "0" }}>Only the text each check needs goes to the provider, never your audio or files. Settings › Privacy lists exactly what is sent.</p> : null}
            </div>
          ) : null}
          {needsKey ? <span className="e-meta">No key yet, so until you add one you will get timing notes only. You can add it any time in Settings, under AI.</span> : null}
          {ai.local.busy ? <span className="e-meta" role="status">The download keeps going while you set up the rest.</span> : null}
          {trouble || problem ? <span className="e-meta" role="alert" style={{ color: "var(--e-warn-ink)" }}>{trouble || problem}</span> : null}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <Link to="1-5-speech" className="e-btn e-btn-ghost">← Back</Link>
            <Link to="1-7-your-first-story" className="e-btn e-btn-primary" onClick={save} aria-disabled={saving || undefined}>Continue</Link>
          </div>
        </div>
      </div>
    </FocusShell>
  );
}

function FeedbackEngineMock() {
  const { engine, screens } = useStore();
  const { engines, providers, sampleKey } = screens.firstRun;
  const [kind, setKind] = useState<EngineKind>(engine.kind);
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
  const [model, setModel] = useState(providers[0]?.models[0] ?? "");
  const [apiKey, setApiKey] = useState(sampleKey);
  const [testing, setTesting] = useState(false);
  const [works, setWorks] = useState(false);

  const provider = providers.find((p) => p.id === providerId) ?? providers[0];

  // The fake key check takes a moment, then shows the success line.
  useEffect(() => {
    if (!testing) return;
    const t = window.setTimeout(() => {
      setTesting(false);
      setWorks(true);
    }, 700);
    return () => window.clearTimeout(t);
  }, [testing]);

  const changeProvider = (id: string) => {
    setProviderId(id);
    setModel(providers.find((p) => p.id === id)?.models[0] ?? "");
    setWorks(false);
  };

  return (
    <FocusShell>
      <div className="e-wrap" style={{ width: "100%", gap: "28px" }}>
        <StepHeader step={6} skipTo="1-7-your-first-story" />
        <div style={{ maxWidth: "900px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "22px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span className="e-label">Step 6 of 7</span>
            <h1 className="e-h1">Who gives the feedback?</h1>
            <p className="e-meta" style={{ margin: "0" }}>Timing and filler words work with no setup. An AI engine adds the judgment: did you answer the question, say your numbers, own your decisions.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
            {engines.map((e) => (
              <label key={e.kind} className="e-card" style={{ ...cardStyle, ...(kind === e.kind ? onStyle : {}) }}>
                <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <input type="radio" name="eng" className="e-check" checked={kind === e.kind} onChange={() => setKind(e.kind)} />
                  <span className="e-h3">{e.title}</span>
                </span>
                <span className="e-meta">{e.blurb}</span>
                {e.pill ? (
                  <span className="e-pill" style={{ alignSelf: "flex-start", ...(e.pillTone === "ground" ? { background: "var(--e-ground)" } : {}) }}>{e.pill}</span>
                ) : null}
              </label>
            ))}
          </div>
          {kind === "key" ? (
            <div className="e-card" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
                <div className="e-field">
                  <label htmlFor="prov">Provider</label>
                  <select id="prov" className="e-input" value={providerId} onChange={(e) => changeProvider(e.target.value)}>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div className="e-field">
                  <label htmlFor="model">Model</label>
                  <select id="model" className="e-input" value={model} onChange={(e) => setModel(e.target.value)}>
                    {(provider?.models ?? []).map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="e-field">
                <label htmlFor="key">API key</label>
                <div style={{ display: "flex", gap: "10px" }}>
                  <input
                    id="key"
                    className="e-input"
                    type="password"
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setWorks(false);
                    }}
                    style={{ flex: "1" }}
                  />
                  <button type="button" className="e-btn e-btn-soft e-btn-sm" style={{ minHeight: "48px" }} onClick={() => setTesting(true)} disabled={testing}>
                    {testing ? "Testing" : "Test"}
                  </button>
                </div>
                {works ? (
                  <span className="e-meta" style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--e-primary-dark)" }} aria-live="polite">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    {" "}Works. Saved in your system's secure key storage.
                  </span>
                ) : null}
              </div>
              <p className="e-small" style={{ margin: "0" }}>Only the text each check needs goes to the provider, never your audio or files. Settings › Privacy lists exactly what is sent.</p>
            </div>
          ) : null}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <Link to="1-5-speech" className="e-btn e-btn-ghost">← Back</Link>
            <Link to="1-7-your-first-story" className="e-btn e-btn-primary">Continue</Link>
          </div>
        </div>
      </div>
    </FocusShell>
  );
}
