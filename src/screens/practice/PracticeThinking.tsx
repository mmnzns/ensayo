// Draft generated from Design/screens/html/3-3-practice-thinking.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import Wordmark from "../../ui/Wordmark";

export default function PracticeThinking() {
  return (
    <FocusShell>
      <div className="e-wrap" style={{ width: "100%" }}>
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
      </div>
      <div style={{ flex: "1", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 0" }}>
        <div className="e-card" style={{ width: "100%", maxWidth: "520px", padding: "40px", display: "flex", flexDirection: "column", gap: "26px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span className="e-hand" style={{ fontSize: "28px" }}>Listening back...</span>
            <span className="e-meta">Your answer: 0:48. About 8 more seconds.</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            <div className="e-rowline">
              <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: "var(--e-primary)", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
              {" "}<span style={{ flex: "1", fontSize: "16px" }}>Turning your answer into text</span>{" "}<span className="e-small">On this computer</span>
            </div>
            <div className="e-rowline">
              <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: "var(--e-primary)", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
              {" "}<span style={{ flex: "1", fontSize: "16px" }}>Timing and filler words</span>{" "}<span className="e-small">Done</span>
            </div>
            <div className="e-rowline" style={{ borderBottom: "none" }}>
              <span style={{ width: "24px", height: "24px", borderRadius: "50%", boxShadow: "inset 0 0 0 3px var(--e-tint)", borderTop: "3px solid var(--e-primary)", boxSizing: "border-box", flex: "none" }} aria-hidden="true" />{" "}<span style={{ flex: "1", fontSize: "16px", fontWeight: "600" }}>Picking the one thing to fix</span>{" "}<span className="e-small">Claude Sonnet</span>
            </div>
          </div>
        </div>
      </div>
      <div className="e-wrap" style={{ width: "100%" }}>
        <span className="e-small" style={{ textAlign: "center" }}>Your audio stays on this computer. Only the text is checked.</span>
      </div>
    </FocusShell>
  );
}
