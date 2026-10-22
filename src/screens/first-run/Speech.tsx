// Draft generated from Design/screens/html/1-5-speech.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import { useEffect, useState } from "react";
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import { isApp } from "../../data/real";
import { useStore } from "../../data/store";
import StepHeader from "./StepHeader";
import { useSpeech } from "./useSpeech";

type Choice = "local" | "download";
type Download = "idle" | "downloading" | "ready";

const cardStyle = { display: "flex", gap: "16px", alignItems: "flex-start", padding: "22px", cursor: "pointer" } as const;
const onStyle = { boxShadow: "inset 0 0 0 2px var(--e-primary)", background: "var(--e-tint)" } as const;

/** In the app the step reads and downloads the real speech model; in the browser preview it stays the sample below. */
export default function Speech() {
  return isApp() ? <SpeechLive /> : <SpeechMock />;
}

const percentOf = (fraction: number) => Math.round(Math.min(1, Math.max(0, fraction || 0)) * 100);

function SpeechLive() {
  const { plan, downloading, fraction, error, download } = useSpeech();
  const pct = percentOf(fraction);
  const ready = plan?.kind === "ready";

  return (
    <FocusShell>
      <div className="e-wrap" style={{ width: "100%", gap: "32px" }}>
        <StepHeader step={5} skipTo="1-6-feedback-engine" />
        <div className="e-narrow" style={{ gap: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span className="e-label">Step 5 of 7</span>
            <h1 className="e-h1">Turning your voice into text</h1>
            <p className="e-meta" style={{ margin: "0" }}>A speech model runs on this computer, so your answers never leave it. It works offline.</p>
          </div>
          {!plan ? (
            <span className="e-meta" role="status">{error || "Looking at what is on this computer…"}</span>
          ) : plan.kind === "ready" ? (
            <div className="e-card" style={{ ...cardStyle, ...onStyle, cursor: "default" }}>
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
                  <span className="e-h3">{plan.fromOtherApp ? "Use the one already on this computer" : "Ready on this computer"}</span>
                  <span className="e-badge e-badge-ok">{plan.fromOtherApp ? "Found" : "Ready"}</span>
                </span>
                <span className="e-meta">{plan.name} · {plan.fromOtherApp ? "found from another app, nothing to download" : "nothing more to download"}</span>
              </span>
            </div>
          ) : (
            <div className="e-card" style={{ ...cardStyle, ...onStyle, cursor: "default" }}>
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "10px" }}>
                <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
                  <span className="e-h3">{plan.onlyVoiceDetection ? "One small piece is missing" : "Download the recommended model"}</span>
                  <span className="e-pill" style={{ background: "var(--e-ground)" }}>{plan.sizeMb} MB</span>
                </span>
                <span className="e-meta">
                  {plan.onlyVoiceDetection ? "The part that tells your voice from silence. It is tiny." : `${plan.name}. Accurate, and keeps the "um"s Ensayo needs to count.`}
                </span>
                {downloading ? (
                  <>
                    <span className="e-bar" style={{ maxWidth: "420px" }} role="progressbar" aria-label="Download progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                      <span style={{ width: `${pct}%` }} />
                    </span>
                    <span className="e-small" role="status">Downloading, {pct}% of {plan.sizeMb} MB. You can leave this open and keep reading.</span>
                  </>
                ) : (
                  <button type="button" className="e-btn e-btn-soft e-btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => void download()}>
                    {error ? "Try again" : "Download"}
                  </button>
                )}
                {error ? <span className="e-meta" role="alert" style={{ color: "var(--e-warn-ink)" }}>{error}</span> : null}
              </span>
            </div>
          )}
          {plan && !ready ? <p className="e-meta" style={{ margin: "0" }}>You can skip this for now. Until a speech model is here, Ensayo can't hear your answers.</p> : null}
          <p className="e-meta" style={{ margin: "0" }}>Want something faster or online? More speech options are in Settings, under Speech.</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <Link to="1-4-microphone" className="e-btn e-btn-ghost">← Back</Link>
            <Link to="1-6-feedback-engine" className="e-btn e-btn-primary">Continue</Link>
          </div>
        </div>
      </div>
    </FocusShell>
  );
}

function SpeechMock() {
  const { screens } = useStore();
  const { local, download } = screens.firstRun.speech;
  const [choice, setChoice] = useState<Choice>("local");
  const [status, setStatus] = useState<Download>("idle");
  const [pct, setPct] = useState(0);

  // A short fake download: about two and a half seconds, then "Ready".
  useEffect(() => {
    if (status !== "downloading") return;
    const tick = window.setInterval(() => {
      setPct((p) => Math.min(100, p + 8));
    }, 200);
    return () => window.clearInterval(tick);
  }, [status]);
  useEffect(() => {
    if (status === "downloading" && pct >= 100) setStatus("ready");
  }, [status, pct]);

  const startDownload = () => {
    setChoice("download");
    setPct(0);
    setStatus("downloading");
  };

  return (
    <FocusShell>
      <div className="e-wrap" style={{ width: "100%", gap: "32px" }}>
        <StepHeader step={5} skipTo="1-6-feedback-engine" />
        <div className="e-narrow" style={{ gap: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span className="e-label">Step 5 of 7</span>
            <h1 className="e-h1">Turning your voice into text</h1>
            <p className="e-meta" style={{ margin: "0" }}>A speech model runs on this computer, so your answers never leave it. It works offline.</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <label className="e-card" style={{ ...cardStyle, ...(choice === "local" ? onStyle : {}) }}>
              <input type="radio" name="speech" className="e-check" checked={choice === "local"} onChange={() => setChoice("local")} style={{ marginTop: "3px" }} />
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
                  <span className="e-h3">Use the one already on this computer</span>
                  <span className="e-badge e-badge-ok">Found</span>
                </span>
                <span className="e-meta">{local.model} · {local.note}</span>
              </span>
            </label>
            <label className="e-card" style={{ ...cardStyle, ...(choice === "download" ? onStyle : {}) }}>
              <input type="radio" name="speech" className="e-check" checked={choice === "download"} onChange={() => setChoice("download")} style={{ marginTop: "3px" }} />
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "10px" }}>
                <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
                  <span className="e-h3">Download the recommended model</span>
                  <span className="e-pill" style={{ background: "var(--e-ground)" }}>{download.sizeMb} MB</span>
                  {status === "ready" ? <span className="e-badge e-badge-ok">Ready</span> : null}
                </span>
                <span className="e-meta">{download.model}. {download.blurb}</span>
                <span className="e-bar" style={{ maxWidth: "420px" }} aria-label={`Download ${pct} percent`}>
                  <span style={{ width: `${pct}%` }} />
                </span>
                {status === "idle" ? (
                  <button type="button" className="e-btn e-btn-soft e-btn-sm" style={{ alignSelf: "flex-start" }} onClick={startDownload}>
                    Download
                  </button>
                ) : status === "downloading" ? (
                  <span className="e-small" aria-live="polite">Downloading, {pct}% of {download.sizeMb} MB</span>
                ) : (
                  <span className="e-small" aria-live="polite">Ready. Nothing more to do here.</span>
                )}
              </span>
            </label>
          </div>
          <p className="e-meta" style={{ margin: "0" }}>Want something faster or online? More speech options are in Settings, under Speech.</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <Link to="1-4-microphone" className="e-btn e-btn-ghost">← Back</Link>
            <Link to="1-6-feedback-engine" className="e-btn e-btn-primary">Continue</Link>
          </div>
        </div>
      </div>
    </FocusShell>
  );
}
