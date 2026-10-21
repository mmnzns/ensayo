// Draft generated from Design/screens/html/3-5-result-attempt-2.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import Wordmark from "../../ui/Wordmark";

export default function ResultAttempt2() {
  return (
    <FocusShell>
      <div className="e-wrap">
        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <span className="e-brand" style={{ padding: "0" }} aria-label="Ensayo">
              <Wordmark size={24} />
            </span>
            <span className="e-pill" style={{ background: "var(--e-tint)", color: "var(--e-primary-dark)", fontWeight: "600" }} title="A note after every answer, then try again">Drill</span>
            <span className="e-pill">Hiring manager · 2 of 5</span>
          </div>
          <div className="e-bar" style={{ flex: "1 1 200px", maxWidth: "280px" }} aria-label="Session progress, 2 of 5">
            <span style={{ width: "40%" }} />
          </div>
          <Link to="4-3-session-results-drill" className="e-btn e-btn-white e-btn-sm">End session</Link>
        </header>
        <section style={{ display: "flex", gap: "18px", alignItems: "center" }}>
          <div className="e-presence" aria-hidden="true">
            <span />
          </div>
          <h1 className="e-h1" style={{ fontSize: "28px", fontWeight: "600", maxWidth: "860px" }}>Tell me about a time you improved a metric that really mattered to the business.</h1>
        </section>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "stretch" }}>
          <section className="e-card" style={{ flex: "999 1 560px", minWidth: "0", padding: "36px", display: "flex", flexDirection: "column", gap: "24px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <span className="e-meta">Attempt 2 of 3</span>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
                <span className="e-win" style={{ fontSize: "21px" }}>fixed · 41s → 6s</span>
                <span className="e-small">point landed</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span className="e-label">Coach's note</span>
              <p className="e-hand" style={{ margin: "0", fontSize: "31px" }}>Every decision was "we". Say what you decided.</p>
            </div>
            <div className="e-soft" style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
              <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "8px" }}>
                <span className="e-label">Try saying</span>
                <p style={{ margin: "0", fontSize: "20px", lineHeight: "1.5" }}>"I decided the fix was the handoff from email to the bank-linking screen, and I picked seven-day activation to prove it."</p>
              </div>
              <button type="button" aria-label="Hear this line" style={{ flex: "none", width: "48px", height: "48px", borderRadius: "50%", border: "none", background: "#FFFFFF", color: "var(--e-pen)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M7 4l13 8-13 8z" />
                </svg>
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", marginTop: "auto" }}>
              <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-primary e-btn-big">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 3-6.7" />
                  <path d="M3 4v5h5" />
                </svg>
                Again
              </Link>
              <Link to="3-6-follow-up" className="e-btn e-btn-soft">They have a follow-up</Link>
              <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-ghost">Next question →</Link>
            </div>
          </section>
          <aside className="e-card" style={{ flex: "1 1 320px", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingBottom: "8px" }}>
              <span style={{ fontSize: "15px", fontWeight: "600" }}>
                Your answer <span style={{ color: "var(--e-muted)", fontWeight: "400" }}>· 0:48</span>
              </span>
              <button type="button" className="e-btn e-btn-soft e-btn-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
                  <path d="M21 15a2 2 0 0 1-2 2h-1v-5h3z" />
                  <path d="M3 15a2 2 0 0 0 2 2h1v-5H3z" />
                </svg>
                Listen
              </button>
            </div>
            <p className="e-line-p">I moved seven-day activation from 31 to 44 percent by fixing what happened after signup.</p>
            <p className="e-line-p" style={{ color: "var(--e-muted)" }}>Activation had been flat for two quarters and everyone blamed the welcome emails.</p>
            <p className="e-line-p" style={{ lineHeight: "1.8" }}>
              So <span className="e-circle">we</span> looked at the funnel and <span className="e-circle">we</span> decided to change the trigger to fire when people stalled.
            </p>
            <p className="e-line-p" style={{ color: "var(--e-muted)", borderBottom: "none" }}>Within a quarter, activation went from 31 to 44 percent.</p>
            <div style={{ marginTop: "auto", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "10px", borderTop: "1px solid var(--e-line)", paddingTop: "12px" }}>
              <Link to="3-4-result-attempt-1-details-open" className="e-btn e-btn-ghost e-btn-sm" style={{ paddingLeft: "0" }}>Details ›</Link>
              <a href="#" className="e-small">That note was wrong</a>
            </div>
          </aside>
        </div>
        <p className="e-small" style={{ margin: "0" }}>
          <span className="e-kbd">Enter</span> again · <span className="e-kbd">N</span> next · <span className="e-kbd">L</span> listen · <span className="e-kbd">Esc</span> end
        </p>
      </div>
    </FocusShell>
  );
}
