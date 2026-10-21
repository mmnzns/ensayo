// Draft generated from Design/screens/html/1-5-speech.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import Wordmark from "../../ui/Wordmark";

export default function Speech() {
  return (
    <FocusShell>
      <div className="e-wrap" style={{ gap: "32px" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <span className="e-brand" style={{ padding: "0" }} aria-label="Ensayo">
            <Wordmark size={24} />
          </span>
          <div className="e-steps" aria-label="Step 5 of 7">
            <span className="on" />
            <span className="on" />
            <span className="on" />
            <span className="on" />
            <span className="on" />
            <span />
            <span />
          </div>
          <span style={{ width: "64px" }} />
        </header>
        <div className="e-narrow" style={{ gap: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span className="e-label">Step 5 of 7</span>
            <h1 className="e-h1">Turning your voice into text</h1>
            <p className="e-meta" style={{ margin: "0" }}>A speech model runs on this computer, so your answers never leave it. It works offline.</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <label className="e-card" style={{ display: "flex", gap: "16px", alignItems: "flex-start", padding: "22px", cursor: "pointer", boxShadow: "inset 0 0 0 2px var(--e-primary)", background: "var(--e-tint)" }}>
              <input type="radio" name="speech" className="e-check" defaultChecked style={{ marginTop: "3px" }} />
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
                  <span className="e-h3">Use the one already on this computer</span>
                  <span className="e-badge e-badge-ok">Found</span>
                </span>
                <span className="e-meta">Whisper Large Turbo · nothing to download</span>
              </span>
            </label>
            <label className="e-card" style={{ display: "flex", gap: "16px", alignItems: "flex-start", padding: "22px", cursor: "pointer" }}>
              <input type="radio" name="speech" className="e-check" style={{ marginTop: "3px" }} />
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "10px" }}>
                <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
                  <span className="e-h3">Download the recommended model</span>
                  <span className="e-pill" style={{ background: "var(--e-ground)" }}>575 MB</span>
                </span>
                <span className="e-meta">Whisper Large Turbo. Accurate, and keeps the "um"s Ensayo needs to count.</span>
                <span className="e-bar" style={{ maxWidth: "420px" }} aria-label="Download 0 percent">
                  <span style={{ width: "0%" }} />
                </span>
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
