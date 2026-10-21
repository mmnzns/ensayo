// Draft generated from Design/screens/html/3-1-practice-interviewer-asking.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import Wordmark from "../../ui/Wordmark";

export default function PracticeInterviewerAsking() {
  return (
    <FocusShell>
      <div className="e-wrap" style={{ width: "100%" }}>
        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <span className="e-brand" style={{ padding: "0" }} aria-label="Ensayo">
              <Wordmark size={24} />
            </span>
            <span className="e-pill" style={{ background: "var(--e-tint)", color: "var(--e-primary-dark)", fontWeight: "600" }} title="A note after every answer, then try again">Drill</span>
            <span className="e-small">note after each answer</span>
            <span className="e-pill">Hiring manager · 2 of 5</span>
          </div>
          <div className="e-bar" style={{ flex: "1 1 200px", maxWidth: "280px" }} aria-label="Session progress, 2 of 5">
            <span style={{ width: "40%" }} />
          </div>
          <Link to="4-3-session-results-drill" className="e-btn e-btn-white e-btn-sm">End session</Link>
        </header>
      </div>
      <div style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "36px", textAlign: "center", padding: "32px 0" }}>
        <div aria-hidden="true" style={{ width: "140px", height: "140px", borderRadius: "50%", background: "rgba(184,67,44,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: "104px", height: "104px", borderRadius: "50%", background: "rgba(184,67,44,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "var(--e-primary)" }} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", alignItems: "center", maxWidth: "860px" }}>
          <span className="e-label">Interviewer is asking</span>
          <h1 className="e-h1" style={{ fontSize: "34px", fontWeight: "600" }}>Tell me about a time you improved a metric that really mattered to the business.</h1>
          <button type="button" className="e-btn e-btn-ghost e-btn-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            </svg>
            Hear it again
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <Link to="3-2-practice-recording" aria-label="Start answering" style={{ width: "96px", height: "96px", borderRadius: "50%", background: "var(--e-primary)", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(184,67,44,0.28)" }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0" />
              <path d="M12 18v3" />
            </svg>
          </Link>
          <span className="e-meta">
            Press <span className="e-kbd">Space</span> to start answering
          </span>
        </div>
      </div>
      <div className="e-wrap" style={{ width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span className="e-small">Aim for 60 to 90 seconds</span>
          <button type="button" className="e-btn e-btn-ghost e-btn-sm">Skip question</button>
        </div>
      </div>
    </FocusShell>
  );
}
