// Draft generated from Design/screens/html/1-1-welcome.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import Wordmark from "../../ui/Wordmark";
import LoopSteps from "./LoopSteps";

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
        <LoopSteps />
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
