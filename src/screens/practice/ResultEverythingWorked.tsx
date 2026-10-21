// Draft generated from Design/screens/html/3-8-result-everything-worked.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import Wordmark from "../../ui/Wordmark";

export default function ResultEverythingWorked() {
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
              <span className="e-meta">Attempt 3 of 3</span>
              <span className="e-win" style={{ fontSize: "21px" }}>that's the one</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span className="e-label">Coach's note</span>
              <p className="e-hand" style={{ margin: "0", fontSize: "31px" }}>You led with the 44 percent, said what you decided, and stopped right after the result.</p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
              <span className="e-pill" style={{ background: "var(--e-ok-tint)", color: "var(--e-ok)", fontWeight: "600" }}>Point at 0:05</span>
              <span className="e-pill" style={{ background: "var(--e-ok-tint)", color: "var(--e-ok)", fontWeight: "600" }}>"I decided" said twice</span>
              <span className="e-pill" style={{ background: "var(--e-ok-tint)", color: "var(--e-ok)", fontWeight: "600" }}>1:04 long</span>
            </div>
            <p className="e-meta" style={{ margin: "0" }}>Real interviewers usually push on an answer this clean. Want to see how you hold up?</p>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", marginTop: "auto" }}>
              <Link to="3-6-follow-up" className="e-btn e-btn-primary e-btn-big">Take a follow-up</Link>
              <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-ghost">Next question →</Link>
            </div>
          </section>
          <aside className="e-card" style={{ flex: "1 1 320px", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingBottom: "8px" }}>
              <span style={{ fontSize: "15px", fontWeight: "600" }}>
                Your answer <span style={{ color: "var(--e-muted)", fontWeight: "400" }}>· 1:04</span>
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
            <p className="e-line-p">I moved seven-day activation from 31 to 44 percent by fixing what happened after signup, not the emails.</p>
            <p className="e-line-p" style={{ color: "var(--e-muted)" }}>Activation had been flat for two quarters and everyone blamed the welcome emails.</p>
            <p className="e-line-p">I looked at the funnel and saw people stalled on bank linking, so I decided the handoff was the fix and picked seven-day activation to prove it.</p>
            <p className="e-line-p" style={{ borderBottom: "none" }}>Within a quarter it went from 31 to 44 percent.</p>
            <div style={{ marginTop: "auto", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "10px", borderTop: "1px solid var(--e-line)", paddingTop: "12px" }}>
              <Link to="3-4-result-attempt-1-details-open" className="e-btn e-btn-ghost e-btn-sm" style={{ paddingLeft: "0" }}>Details ›</Link>
              <a href="#" className="e-small">That note was wrong</a>
            </div>
          </aside>
        </div>
      </div>
    </FocusShell>
  );
}
