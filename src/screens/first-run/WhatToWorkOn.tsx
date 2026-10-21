// Draft generated from Design/screens/html/1-3-what-to-work-on.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import Wordmark from "../../ui/Wordmark";

export default function WhatToWorkOn() {
  return (
    <FocusShell>
      <div className="e-wrap" style={{ gap: "32px" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <span className="e-brand" style={{ padding: "0" }} aria-label="Ensayo">
            <Wordmark size={24} />
          </span>
          <div className="e-steps" aria-label="Step 3 of 7">
            <span className="on" />
            <span className="on" />
            <span className="on" />
            <span />
            <span />
            <span />
            <span />
          </div>
          <Link to="1-4-microphone" className="e-btn e-btn-ghost e-btn-sm">Skip</Link>
        </header>
        <div style={{ maxWidth: "860px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span className="e-label">Step 3 of 7</span>
            <h1 className="e-h1">What do you want to work on?</h1>
            <p className="e-meta" style={{ margin: "0" }}>Pick one or two. Ensayo keeps an eye on them every session and tells you when one sticks.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
            <label className="e-card" style={{ display: "flex", gap: "14px", alignItems: "flex-start", padding: "20px", cursor: "pointer", boxShadow: "inset 0 0 0 2px var(--e-primary)", background: "var(--e-tint)" }}>
              <input type="checkbox" className="e-check" defaultChecked style={{ marginTop: "2px" }} />
              <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span className="e-h3">I take too long to get to the point</span>
                <span className="e-meta">The answer comes after the backstory.</span>
              </span>
            </label>
            <label className="e-card" style={{ display: "flex", gap: "14px", alignItems: "flex-start", padding: "20px", cursor: "pointer", boxShadow: "inset 0 0 0 2px var(--e-primary)", background: "var(--e-tint)" }}>
              <input type="checkbox" className="e-check" defaultChecked style={{ marginTop: "2px" }} />
              <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span className="e-h3">I keep going after I've made my point</span>
                <span className="e-meta">A strong answer, then two more minutes.</span>
              </span>
            </label>
            <label className="e-card" style={{ display: "flex", gap: "14px", alignItems: "flex-start", padding: "20px", cursor: "pointer" }}>
              <input type="checkbox" className="e-check" style={{ marginTop: "2px" }} />
              <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span className="e-h3">I forget to say my numbers</span>
                <span className="e-meta">The result is there, the proof isn't.</span>
              </span>
            </label>
            <label className="e-card" style={{ display: "flex", gap: "14px", alignItems: "flex-start", padding: "20px", cursor: "pointer" }}>
              <input type="checkbox" className="e-check" style={{ marginTop: "2px" }} />
              <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span className="e-h3">I say "we" when I mean "I"</span>
                <span className="e-meta">Nobody can tell what you decided.</span>
              </span>
            </label>
            <label className="e-card" style={{ display: "flex", gap: "14px", alignItems: "flex-start", padding: "20px", cursor: "pointer" }}>
              <input type="checkbox" className="e-check" style={{ marginTop: "2px" }} />
              <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span className="e-h3">I talk about what I built before why</span>
                <span className="e-meta">The thinking stays hidden behind the work.</span>
              </span>
            </label>
            <label className="e-card" style={{ display: "flex", gap: "14px", alignItems: "flex-start", padding: "20px", cursor: "pointer" }}>
              <input type="checkbox" className="e-check" style={{ marginTop: "2px" }} />
              <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span className="e-h3">I hedge or apologise</span>
                <span className="e-meta">"Sorry, this might not be the best example..."</span>
              </span>
            </label>
            <label className="e-card" style={{ display: "flex", gap: "14px", alignItems: "flex-start", padding: "20px", cursor: "pointer" }}>
              <input type="checkbox" className="e-check" style={{ marginTop: "2px" }} />
              <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span className="e-h3">I say "um" and "like" a lot</span>
                <span className="e-meta">Fillers instead of a clean pause.</span>
              </span>
            </label>
            <label className="e-card" style={{ display: "flex", gap: "14px", alignItems: "flex-start", padding: "20px", cursor: "pointer" }}>
              <input type="checkbox" className="e-check" style={{ marginTop: "2px" }} />
              <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span className="e-h3">Not sure yet</span>
                <span className="e-meta">Ensayo picks one after your first few answers.</span>
              </span>
            </label>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <Link to="1-2-about-you" className="e-btn e-btn-ghost">← Back</Link>
            <span className="e-meta">2 of 2 picked</span>
            <Link to="1-4-microphone" className="e-btn e-btn-primary">Continue</Link>
          </div>
        </div>
      </div>
    </FocusShell>
  );
}
