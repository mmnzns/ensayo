// Draft generated from Design/screens/html/1-2-about-you.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import Wordmark from "../../ui/Wordmark";

export default function AboutYou() {
  return (
    <FocusShell>
      <div className="e-wrap" style={{ gap: "32px" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <span className="e-brand" style={{ padding: "0" }} aria-label="Ensayo">
            <Wordmark size={24} />
          </span>
          <div className="e-steps" aria-label="Step 2 of 7">
            <span className="on" />
            <span className="on" />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <Link to="1-3-what-to-work-on" className="e-btn e-btn-ghost e-btn-sm">Skip</Link>
        </header>
        <div className="e-narrow" style={{ gap: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span className="e-label">Step 2 of 7</span>
            <h1 className="e-h1">About you</h1>
            <p className="e-meta" style={{ margin: "0" }}>This tailors the questions and the feedback. You can change it any time in Settings.</p>
          </div>
          <div className="e-card" style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
              <div className="e-field">
                <label htmlFor="role">Role you're going for</label>
                <input id="role" className="e-input" defaultValue="Senior Lifecycle Marketing Manager" />
              </div>
              <div className="e-field">
                <label htmlFor="ind">Industry</label>
                <input id="ind" className="e-input" defaultValue="Fintech" />
              </div>
            </div>
            <div className="e-field">
              <span style={{ fontSize: "14px", fontWeight: "600" }}>Seniority</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                <button type="button" className="e-chip">Early career</button>
                <button type="button" className="e-chip">Mid-level</button>
                <button type="button" className="e-chip e-chip-on" aria-pressed="true">Senior</button>
                <button type="button" className="e-chip">Lead or manager</button>
                <button type="button" className="e-chip">Director and up</button>
              </div>
            </div>
            <div className="e-field">
              <span style={{ fontSize: "14px", fontWeight: "600" }}>You sell to</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                <button type="button" className="e-chip">Businesses (B2B)</button>
                <button type="button" className="e-chip e-chip-on" aria-pressed="true">Consumers (B2C)</button>
                <button type="button" className="e-chip">Both</button>
              </div>
            </div>
            <div className="e-field">
              <label htmlFor="who">
                Who you are at work, in one sentence <span style={{ fontWeight: "400", color: "var(--e-muted)" }}>(optional)</span>
              </label>
              <textarea id="who" className="e-input" rows={3} defaultValue={"I'm a lifecycle marketer who finds where activation and retention actually break, then builds the journeys that fix them."} />
              <span className="e-small">Ensayo checks that this comes through early when you answer "Tell me about yourself".</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <Link to="1-1-welcome" className="e-btn e-btn-ghost">← Back</Link>
            <Link to="1-3-what-to-work-on" className="e-btn e-btn-primary">Continue</Link>
          </div>
        </div>
      </div>
    </FocusShell>
  );
}
