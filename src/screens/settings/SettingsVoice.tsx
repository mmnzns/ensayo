// Draft generated from Design/screens/html/8-3-settings-voice.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";

export default function SettingsVoice() {
  return (
    <AppShell nav="settings">
      <h1 className="e-h1">Settings</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "28px", alignItems: "flex-start" }}>
        <nav style={{ flex: "1 1 170px", maxWidth: "200px", display: "flex", flexDirection: "column", gap: "2px" }} aria-label="Settings sections">
          <Link to="8-1-settings-profile" className="e-nav">Profile</Link>
          <Link to="8-2-settings-practice" className="e-nav">Practice</Link>
          <Link to="8-3-settings-voice" className="e-nav e-nav-on" aria-current="page">Voice</Link>
          <Link to="8-4-settings-speech" className="e-nav">Speech</Link>
          <Link to="8-5-settings-ai" className="e-nav">AI</Link>
          <Link to="8-6-settings-privacy" className="e-nav">Privacy</Link>
          <Link to="8-7-settings-check-setup" className="e-nav">Check setup</Link>
        </nav>
        <section className="e-card" style={{ flex: "999 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingBottom: "10px" }}>
            <span className="e-h2">Interviewer voice</span>
            <span className="e-meta">Questions are read aloud by a voice on this computer. The text always stays on screen.</span>
          </div>
          <label className="e-rowline" style={{ cursor: "pointer" }}>
            <span style={{ flex: "1" }}>Read questions aloud</span>
            <input type="checkbox" className="e-check" defaultChecked />
          </label>
          <div className="e-rowline">
            <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
              Voice<span className="e-small">{"Natural voices sound best. On Windows, install them under Settings › Time & language › Speech."}</span>
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <select className="e-input" style={{ width: "220px" }} aria-label="Voice" defaultValue="Samantha (natural)">
                <option>Samantha (natural)</option>
                <option>Daniel (natural)</option>
                <option>Karen</option>
                <option>Alex</option>
              </select>
              <button type="button" className="e-btn e-btn-soft e-btn-sm" style={{ minHeight: "48px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M7 4l13 8-13 8z" />
                </svg>
                Preview
              </button>
            </div>
          </div>
          <div className="e-rowline">
            <span style={{ flex: "1" }}>Speed</span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button type="button" className="e-chip">Slower</button>
              <button type="button" className="e-chip e-chip-on" aria-pressed="true">Normal</button>
              <button type="button" className="e-chip">Faster</button>
            </div>
          </div>
          <label className="e-rowline" style={{ cursor: "pointer", borderBottom: "none" }}>
            <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
              Read the "Try saying" line aloud too<span className="e-small">Hearing the better line helps it stick.</span>
            </span>
            <input type="checkbox" className="e-check" defaultChecked />
          </label>
        </section>
      </div>
    </AppShell>
  );
}
