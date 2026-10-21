// Draft generated from Design/screens/html/3-7-clarifying-question.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import Wordmark from "../../ui/Wordmark";

export default function ClarifyingQuestion() {
  return (
    <FocusShell>
      <div className="e-wrap" style={{ width: "100%" }}>
        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <span className="e-brand" style={{ padding: "0" }} aria-label="Ensayo">
              <Wordmark size={24} />
            </span>
            <span className="e-pill" style={{ background: "var(--e-tint)", color: "var(--e-primary-dark)", fontWeight: "600" }} title="A note after every answer, then try again">Drill</span>
            <span className="e-pill">Hiring manager · 3 of 5</span>
          </div>
          <div className="e-bar" style={{ flex: "1 1 200px", maxWidth: "280px" }} aria-label="Session progress, 3 of 5">
            <span style={{ width: "60%" }} />
          </div>
          <Link to="4-3-session-results-drill" className="e-btn e-btn-white e-btn-sm">End session</Link>
        </header>
      </div>
      <div style={{ flex: "1", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 0" }}>
        <div style={{ width: "100%", maxWidth: "760px", display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
            <div className="e-presence" style={{ width: "44px", height: "44px" }} aria-hidden="true">
              <span style={{ width: "18px", height: "18px" }} />
            </div>
            <div className="e-card" style={{ padding: "20px 24px", borderTopLeftRadius: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
              <span className="e-small">Interviewer</span>
              <span style={{ fontSize: "20px", fontWeight: "600", lineHeight: "1.4" }}>How would you approach our churn problem in your first 90 days?</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "14px", alignItems: "flex-start", justifyContent: "flex-end" }}>
            <div className="e-soft" style={{ padding: "18px 22px", borderTopRightRadius: "8px", display: "flex", flexDirection: "column", gap: "6px", maxWidth: "520px" }}>
              <span className="e-small">You</span>
              <span style={{ fontSize: "18px", lineHeight: "1.5" }}>Do you mean the strategy, or how I'd roll it out?</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
            <div className="e-presence" style={{ width: "44px", height: "44px" }} aria-hidden="true">
              <span style={{ width: "18px", height: "18px" }} />
            </div>
            <div className="e-card" style={{ padding: "20px 24px", borderTopLeftRadius: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
              <span className="e-small">Interviewer</span>
              <span style={{ fontSize: "20px", fontWeight: "600", lineHeight: "1.4" }}>Mostly the rollout. That's where our team keeps getting stuck.</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", paddingTop: "18px" }}>
            <Link to="3-2-practice-recording" aria-label="Start answering" style={{ width: "88px", height: "88px", borderRadius: "50%", background: "var(--e-primary)", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(184,67,44,0.28)" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0" />
                <path d="M12 18v3" />
              </svg>
            </Link>
            <span className="e-meta">
              Answer when you're ready · <span className="e-kbd">Space</span>
            </span>
            <span className="e-small">Asking to clarify is a good move. It isn't judged.</span>
          </div>
        </div>
      </div>
    </FocusShell>
  );
}
