// Draft generated from Design/screens/html/1-4-microphone.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import Wordmark from "../../ui/Wordmark";

export default function Microphone() {
  return (
    <FocusShell>
      <div className="e-wrap" style={{ gap: "32px" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <span className="e-brand" style={{ padding: "0" }} aria-label="Ensayo">
            <Wordmark size={24} />
          </span>
          <div className="e-steps" aria-label="Step 4 of 7">
            <span className="on" />
            <span className="on" />
            <span className="on" />
            <span className="on" />
            <span />
            <span />
            <span />
          </div>
          <span style={{ width: "64px" }} />
        </header>
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
              <select id="mic" className="e-input">
                <option>AirPods Pro</option>
                <option>MacBook Pro Microphone</option>
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <span style={{ fontSize: "14px", fontWeight: "600" }}>Say a few words</span>
              <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "64px", padding: "0 4px" }} aria-label="Input level, good">
                <span style={{ flex: "1", height: "18%", borderRadius: "4px", background: "var(--e-primary)" }} />
                <span style={{ flex: "1", height: "34%", borderRadius: "4px", background: "var(--e-primary)" }} />
                <span style={{ flex: "1", height: "62%", borderRadius: "4px", background: "var(--e-primary)" }} />
                <span style={{ flex: "1", height: "88%", borderRadius: "4px", background: "var(--e-primary)" }} />
                <span style={{ flex: "1", height: "70%", borderRadius: "4px", background: "var(--e-primary)" }} />
                <span style={{ flex: "1", height: "46%", borderRadius: "4px", background: "var(--e-primary)" }} />
                <span style={{ flex: "1", height: "80%", borderRadius: "4px", background: "var(--e-primary)" }} />
                <span style={{ flex: "1", height: "58%", borderRadius: "4px", background: "var(--e-primary)" }} />
                <span style={{ flex: "1", height: "30%", borderRadius: "4px", background: "var(--e-primary)" }} />
                <span style={{ flex: "1", height: "50%", borderRadius: "4px", background: "var(--e-primary)" }} />
                <span style={{ flex: "1", height: "22%", borderRadius: "4px", background: "var(--e-line)" }} />
                <span style={{ flex: "1", height: "12%", borderRadius: "4px", background: "var(--e-line)" }} />
                <span style={{ flex: "1", height: "8%", borderRadius: "4px", background: "var(--e-line)" }} />
                <span style={{ flex: "1", height: "6%", borderRadius: "4px", background: "var(--e-line)" }} />
              </div>
              <span className="e-meta" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B8432C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                 Sounds clear.
              </span>
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
