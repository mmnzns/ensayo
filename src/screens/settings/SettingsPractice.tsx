// Draft generated from Design/screens/html/8-2-settings-practice.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";

export default function SettingsPractice() {
  return (
    <AppShell nav="settings">
      <h1 className="e-h1">Settings</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "28px", alignItems: "flex-start" }}>
        <nav style={{ flex: "1 1 170px", maxWidth: "200px", display: "flex", flexDirection: "column", gap: "2px" }} aria-label="Settings sections">
          <Link to="8-1-settings-profile" className="e-nav">Profile</Link>
          <Link to="8-2-settings-practice" className="e-nav e-nav-on" aria-current="page">Practice</Link>
          <Link to="8-3-settings-voice" className="e-nav">Voice</Link>
          <Link to="8-4-settings-speech" className="e-nav">Speech</Link>
          <Link to="8-5-settings-ai" className="e-nav">AI</Link>
          <Link to="8-6-settings-privacy" className="e-nav">Privacy</Link>
          <Link to="8-7-settings-check-setup" className="e-nav">Check setup</Link>
        </nav>
        <section className="e-card" style={{ flex: "999 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px" }}>
          <span className="e-h2" style={{ paddingBottom: "10px" }}>Practice</span>
          <div className="e-rowline">
            <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
              Default stage<span className="e-small">Which interviewer you practice with when no application is picked.</span>
            </span>
            <select className="e-input" style={{ width: "200px" }} aria-label="Default stage" defaultValue="Hiring manager">
              <option>Recruiter</option>
              <option>Hiring manager</option>
              <option>Panel</option>
              <option>Leadership</option>
              <option>Technical</option>
            </select>
          </div>
          <div className="e-rowline">
            <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
              Questions per Drill<span className="e-small">Mock always runs the stage's natural length.</span>
            </span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button type="button" className="e-chip">3</button>
              <button type="button" className="e-chip e-chip-on" aria-pressed="true">5</button>
              <button type="button" className="e-chip">10</button>
            </div>
          </div>
          <div className="e-rowline">
            <span style={{ flex: "1" }}>Tries per question</span>
            <select className="e-input" style={{ width: "200px" }} aria-label="Tries per question" defaultValue="3">
              <option>2</option>
              <option>3</option>
            </select>
          </div>
          <label className="e-rowline" style={{ cursor: "pointer" }}>
            <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
              Show the timer in Drill<span className="e-small">Hidden in Mock, like a real call.</span>
            </span>
            <input type="checkbox" className="e-check" defaultChecked />
          </label>
          <label className="e-rowline" style={{ cursor: "pointer" }}>
            <span style={{ flex: "1" }}>Follow-up questions</span>
            <input type="checkbox" className="e-check" defaultChecked />
          </label>
          <label className="e-rowline" style={{ cursor: "pointer" }}>
            <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
              Stop recording after 8 seconds of silence<span className="e-small">Off by default. Pausing to find a word shouldn't cut you off.</span>
            </span>
            <input type="checkbox" className="e-check" />
          </label>
          <div className="e-rowline">
            <span style={{ flex: "1" }}>Appearance</span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button type="button" className="e-chip e-chip-on" aria-pressed="true">Auto</button>
              <button type="button" className="e-chip">Light</button>
              <button type="button" className="e-chip">Dark</button>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", paddingTop: "14px" }}>
            <span style={{ fontSize: "14px", fontWeight: "600" }}>Shortcuts while practicing</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px 24px" }} className="e-meta">
              <span>
                <span className="e-kbd">Space</span> start and stop
              </span>
              <span>
                <span className="e-kbd">Enter</span> again
              </span>
              <span>
                <span className="e-kbd">N</span> next question
              </span>
              <span>
                <span className="e-kbd">L</span> listen back
              </span>
              <span>
                <span className="e-kbd">R</span> hear the question again
              </span>
              <span>
                <span className="e-kbd">Esc</span> end session
              </span>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
