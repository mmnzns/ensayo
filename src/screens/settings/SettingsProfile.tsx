// Draft generated from Design/screens/html/8-1-settings-profile.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";

export default function SettingsProfile() {
  return (
    <AppShell nav="settings">
      <h1 className="e-h1">Settings</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "28px", alignItems: "flex-start" }}>
        <nav style={{ flex: "1 1 170px", maxWidth: "200px", display: "flex", flexDirection: "column", gap: "2px" }} aria-label="Settings sections">
          <Link to="8-1-settings-profile" className="e-nav e-nav-on" aria-current="page">Profile</Link>
          <Link to="8-2-settings-practice" className="e-nav">Practice</Link>
          <Link to="8-3-settings-voice" className="e-nav">Voice</Link>
          <Link to="8-4-settings-speech" className="e-nav">Speech</Link>
          <Link to="8-5-settings-ai" className="e-nav">AI</Link>
          <Link to="8-6-settings-privacy" className="e-nav">Privacy</Link>
          <Link to="8-7-settings-check-setup" className="e-nav">Check setup</Link>
        </nav>
        <section className="e-card" style={{ flex: "999 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "22px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span className="e-h2">Profile</span>
            <span className="e-meta">Shapes the questions and what Ensayo listens for.</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
            <div className="e-field">
              <label htmlFor="nm">Your name</label>
              <input id="nm" className="e-input" defaultValue="Dana" />
            </div>
            <div className="e-field">
              <label htmlFor="sn">Seniority</label>
              <select id="sn" className="e-input" defaultValue="Senior">
                <option>Early career</option>
                <option>Mid-level</option>
                <option>Senior</option>
                <option>Lead or manager</option>
                <option>Director and up</option>
              </select>
            </div>
            <div className="e-field">
              <label htmlFor="rl">Role you're going for</label>
              <input id="rl" className="e-input" defaultValue="Senior Lifecycle Marketing Manager" />
            </div>
            <div className="e-field">
              <label htmlFor="in">Industry</label>
              <input id="in" className="e-input" defaultValue="Fintech" />
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
            <label htmlFor="id">Who you are at work, in one sentence</label>
            <textarea id="id" className="e-input" rows={2} defaultValue={"I'm a lifecycle marketer who finds where activation and retention actually break, then builds the journeys that fix them."} />
            <span className="e-small">Checked against your "Tell me about yourself" answers.</span>
          </div>
          <div className="e-field">
            <span style={{ fontSize: "14px", fontWeight: "600" }}>
              Focus habits <span style={{ fontWeight: "400", color: "var(--e-muted)" }}>· up to two</span>
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <button type="button" className="e-chip e-chip-on" aria-pressed="true">Getting to the point</button>
              <button type="button" className="e-chip e-chip-on" aria-pressed="true">Stopping once the point lands</button>
              <button type="button" className="e-chip">Saying my numbers</button>
              <button type="button" className="e-chip">Saying what I decided</button>
              <button type="button" className="e-chip">Why before what</button>
              <button type="button" className="e-chip">Opening with how I work</button>
              <button type="button" className="e-chip">No hedging</button>
              <button type="button" className="e-chip">Fewer filler words</button>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
