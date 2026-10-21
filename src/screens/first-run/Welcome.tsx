// Draft generated from Design/screens/html/1-1-welcome.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import Wordmark from "../../ui/Wordmark";

export default function Welcome() {
  return (
    <FocusShell>
      <div style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "40px", textAlign: "center", padding: "40px 0" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
          <Wordmark size={84} />
          <p style={{ margin: "0", fontSize: "15px", color: "var(--e-muted)" }}>Rehearsal, in Tagalog and Spanish.</p>
        </div>
        <h1 className="e-h1" style={{ fontSize: "44px", maxWidth: "760px" }}>Walk in ready.</h1>
        <p className="e-meta" style={{ margin: "-8px 0 0", fontSize: "18px", maxWidth: "640px" }}>Practice answering out loud. Get one fix. Answer again.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "16px", width: "100%", maxWidth: "860px" }}>
          <div className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start", textAlign: "left" }}>
            <span className="e-presence" style={{ width: "44px", height: "44px" }} aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B8432C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0" />
                <path d="M12 18v3" />
              </svg>
            </span>
            <span className="e-h3">Answer out loud</span>
            <span className="e-meta">A real interview question, spoken. You answer the way you would on the call.</span>
          </div>
          <div className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start", textAlign: "left" }}>
            <span className="e-presence" style={{ width: "44px", height: "44px" }} aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B8432C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
            </span>
            <span className="e-h3">Get one fix</span>
            <span className="e-meta">Not a scorecard. The one thing that would make the biggest difference, and a line to say instead.</span>
          </div>
          <div className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start", textAlign: "left" }}>
            <span className="e-presence" style={{ width: "44px", height: "44px" }} aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B8432C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 3-6.7" />
                <path d="M3 4v5h5" />
              </svg>
            </span>
            <span className="e-h3">Say it again</span>
            <span className="e-meta">Same question, second try. You see what changed, and the habit starts to stick.</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
          <Link to="1-2-about-you" className="e-btn e-btn-primary e-btn-big">Get started</Link>
          <span className="e-meta" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
             Everything stays on this computer. No account.
          </span>
        </div>
      </div>
      <p className="e-small" style={{ margin: "0", textAlign: "center" }}>by craft concepts digital</p>
    </FocusShell>
  );
}
