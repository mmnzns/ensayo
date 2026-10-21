// Draft generated from Design/screens/html/4-2-mock-your-questions.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import Wordmark from "../../ui/Wordmark";

export default function MockYourQuestions() {
  return (
    <FocusShell>
      <div className="e-wrap" style={{ width: "100%" }}>
        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <span className="e-brand" style={{ padding: "0" }} aria-label="Ensayo">
              <Wordmark size={24} />
            </span>
            <span className="e-pill" style={{ background: "var(--e-ink)", color: "#FFFFFF", fontWeight: "600" }} title="A whole stage straight through, notes at the end">Mock</span>
            <span className="e-pill">Kestrel Pay · Leadership, startup</span>
          </div>
          <div className="e-steps" aria-label="Last part">
            <span className="on" />
            <span className="on" />
            <span className="on" />
            <span className="on" />
            <span className="on" />
            <span className="on" />
          </div>
          <Link to="4-4-session-results-mock-debrief" className="e-btn e-btn-white e-btn-sm">End mock</Link>
        </header>
      </div>
      <div style={{ flex: "1", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: "40px", padding: "32px 0" }}>
        <div style={{ flex: "1 1 420px", maxWidth: "520px", display: "flex", flexDirection: "column", gap: "28px", alignItems: "center", textAlign: "center" }}>
          <div aria-hidden="true" style={{ width: "120px", height: "120px", borderRadius: "50%", background: "rgba(184,67,44,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: "54px", height: "54px", borderRadius: "50%", background: "var(--e-primary)" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <span className="e-label">Founder</span>
            <h1 className="e-h1" style={{ fontSize: "32px", fontWeight: "600" }}>That's everything from me. What questions do you have for me?</h1>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
            <Link to="4-4-session-results-mock-debrief" aria-label="Ask your question" style={{ width: "96px", height: "96px", borderRadius: "50%", background: "var(--e-primary)", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(184,67,44,0.28)" }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0" />
                <path d="M12 18v3" />
              </svg>
            </Link>
            <span className="e-meta">
              Ask one or two, out loud · <span className="e-kbd">Space</span>
            </span>
          </div>
        </div>
        <aside className="e-card" style={{ flex: "1 1 340px", maxWidth: "440px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <span className="e-label">Your locked questions</span>
          <p className="e-meta" style={{ margin: "0" }}>From your night-before set. Say them in your own words.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "14px 0", borderBottom: "1px solid var(--e-line)" }}>
            <span className="e-small">1</span>
            <span style={{ fontSize: "15px", lineHeight: "1.55" }}>For a lifecycle role at your stage I'd expect activation and first-month retention to be under the most pressure. Beyond those, how will you judge this hire?</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "14px 0" }}>
            <span className="e-small">2</span>
            <span style={{ fontSize: "15px", lineHeight: "1.55" }}>What's the single biggest thing standing in the way of that right now?</span>
          </div>
          <span className="e-small">Strong questions open with what you already expect, then ask what's specific to them.</span>
        </aside>
      </div>
    </FocusShell>
  );
}
