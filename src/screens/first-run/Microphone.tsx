// Draft generated from Design/screens/html/1-4-microphone.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import { useEffect, useState } from "react";
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import { useStore } from "../../data/store";
import StepHeader from "./StepHeader";

/** How long the mock level test runs, like the real three-second check. */
const TEST_MS = 3000;

export default function Microphone() {
  const { screens } = useStore();
  const { microphones, levelBars } = screens.firstRun;
  const [device, setDevice] = useState(microphones[0] ?? "");
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState<number[]>([]);

  // While listening, the bars move on a timer; then they settle on the sample reading.
  useEffect(() => {
    if (!listening) return;
    const tick = window.setInterval(() => setLive(levelBars.heights.map(() => 8 + Math.round(Math.random() * 84))), 140);
    const stop = window.setTimeout(() => setListening(false), TEST_MS);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(stop);
    };
  }, [listening, levelBars.heights]);

  const startTest = () => {
    setLive(levelBars.heights);
    setListening(true);
  };

  return (
    <FocusShell>
      <div className="e-wrap" style={{ width: "100%", gap: "32px" }}>
        <StepHeader step={4} />
        <div className="e-narrow" style={{ gap: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span className="e-label">Step 4 of 7</span>
            <h1 className="e-h1">Let's hear you</h1>
            <p className="e-meta" style={{ margin: "0" }}>Ensayo needs your microphone to hear your answers. Your voice is processed on this computer.</p>
          </div>
          <div className="e-card" style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
            <div className="e-rowline" style={{ paddingTop: "0" }}>
              <span className="e-dot" aria-hidden="true" />{" "}<span style={{ flex: "1", fontSize: "15px" }}>Microphone access</span>{" "}<span className="e-badge e-badge-ok">Allowed</span>
            </div>
            <div className="e-field">
              <label htmlFor="mic">Microphone</label>
              <select id="mic" className="e-input" value={device} onChange={(e) => setDevice(e.target.value)}>
                {microphones.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <span style={{ fontSize: "14px", fontWeight: "600" }}>Say a few words</span>
              <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "64px", padding: "0 4px" }} aria-label={listening ? "Input level, listening" : "Input level, good"}>
                {levelBars.heights.map((h, i) => (
                  <span
                    key={i}
                    style={{
                      flex: "1",
                      height: `${listening ? (live[i] ?? h) : h}%`,
                      borderRadius: "4px",
                      background: listening || i < levelBars.lit ? "var(--e-primary)" : "var(--e-line)",
                      transition: "height 120ms ease",
                    }}
                  />
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <span className="e-meta" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }} aria-live="polite">
                  {listening ? (
                    "Listening"
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ stroke: "var(--e-primary)" }} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      {" "}Sounds clear.
                    </>
                  )}
                </span>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={startTest} disabled={listening}>
                  {listening ? "Testing" : "Test again"}
                </button>
              </div>
            </div>
          </div>
          <div className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span className="e-h3">For the best results</span>
            <span className="e-meta">A quiet room and a headset or earbuds. Ensayo listens for one voice, yours.</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <Link to="1-3-what-to-work-on" className="e-btn e-btn-ghost">← Back</Link>
            <Link to="1-5-speech" className="e-btn e-btn-primary">Continue</Link>
          </div>
        </div>
      </div>
    </FocusShell>
  );
}
