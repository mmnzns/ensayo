// Draft generated from Design/screens/html/8-5-settings-ai.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";

export default function SettingsAi() {
  return (
    <AppShell nav="settings">
      <h1 className="e-h1">Settings</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "28px", alignItems: "flex-start" }}>
        <nav style={{ flex: "1 1 170px", maxWidth: "200px", display: "flex", flexDirection: "column", gap: "2px" }} aria-label="Settings sections">
          <Link to="8-1-settings-profile" className="e-nav">Profile</Link>
          <Link to="8-2-settings-practice" className="e-nav">Practice</Link>
          <Link to="8-3-settings-voice" className="e-nav">Voice</Link>
          <Link to="8-4-settings-speech" className="e-nav">Speech</Link>
          <Link to="8-5-settings-ai" className="e-nav e-nav-on" aria-current="page">AI</Link>
          <Link to="8-6-settings-privacy" className="e-nav">Privacy</Link>
          <Link to="8-7-settings-check-setup" className="e-nav">Check setup</Link>
        </nav>
        <div style={{ flex: "999 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="e-h2">Feedback engine</span>
              <span className="e-meta">The AI that judges your answers and asks the follow-ups. Timing and filler words always work without one.</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px" }}>
              <label className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "16px", background: "#FFFFFF", boxShadow: "inset 0 0 0 1.5px var(--e-line)", cursor: "pointer" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input type="radio" name="kind" className="e-check" />
                  <span className="e-h3" style={{ fontSize: "15px" }}>On this computer</span>
                </span>
                <span className="e-small">Local AI, Ollama or LM Studio. Private, offline, slower.</span>
              </label>
              <label className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "16px", boxShadow: "inset 0 0 0 2px var(--e-primary)", cursor: "pointer" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input type="radio" name="kind" className="e-check" defaultChecked />
                  <span className="e-h3" style={{ fontSize: "15px" }}>Your own key</span>
                </span>
                <span className="e-small">Sharpest feedback. You pay the provider directly.</span>
              </label>
              <label className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "16px", background: "#FFFFFF", boxShadow: "inset 0 0 0 1.5px var(--e-line)", cursor: "pointer" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input type="radio" name="kind" className="e-check" />
                  <span className="e-h3" style={{ fontSize: "15px" }}>Timing only</span>
                </span>
                <span className="e-small">No AI. Speed, length and fillers.</span>
              </label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
              <div className="e-field">
                <label htmlFor="pv">Provider</label>
                <select id="pv" className="e-input" defaultValue="Anthropic (Claude)">
                  <option>Anthropic (Claude)</option>
                  <option>OpenAI</option>
                  <option>Google Gemini</option>
                  <option>OpenRouter</option>
                  <option>Groq</option>
                  <option>Cerebras</option>
                  <option>Mistral</option>
                  <option>Other (OpenAI-compatible)</option>
                </select>
              </div>
              <div className="e-field">
                <label htmlFor="md">Model</label>
                <select id="md" className="e-input" defaultValue="Claude Sonnet 5.5 (recommended)">
                  <option>Claude Sonnet 5.5 (recommended)</option>
                  <option>Claude Haiku 5.5</option>
                  <option>Claude Opus 5.5</option>
                  <option>Other model…</option>
                </select>
              </div>
            </div>
            <div className="e-field">
              <label htmlFor="ky">API key</label>
              <div style={{ display: "flex", gap: "10px" }}>
                <input id="ky" className="e-input" type="password" defaultValue="sk-ant-xxxxxxxxxxxxxxxxxxxx" style={{ flex: "1" }} />
                <button type="button" className="e-btn e-btn-soft e-btn-sm" style={{ minHeight: "48px" }}>Test</button>
              </div>
              <span className="e-meta" style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--e-primary-dark)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Works. Kept in your system's secure key storage.
              </span>
            </div>
          </section>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingBottom: "8px" }}>
              <span className="e-h3">Advanced</span>
              <span className="e-small">Most people never change these.</span>
            </div>
            <div className="e-rowline">
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                Model for scoring and follow-ups<span className="e-small">Fast and cheap; runs after every answer.</span>
              </span>
              <select className="e-input" style={{ width: "240px" }} aria-label="Scoring model" defaultValue="Automatic · Claude Haiku 5.5">
                <option>Automatic · Claude Haiku 5.5</option>
                <option>Claude Sonnet 5.5</option>
              </select>
            </div>
            <div className="e-rowline">
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                Model for coach notes and job postings<span className="e-small">Stronger; runs less often.</span>
              </span>
              <select className="e-input" style={{ width: "240px" }} aria-label="Writing model" defaultValue="Automatic · Claude Sonnet 5.5">
                <option>Automatic · Claude Sonnet 5.5</option>
                <option>Claude Opus 5.5</option>
              </select>
            </div>
            <div className="e-rowline" style={{ borderBottom: "none" }}>
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                Spending cap per session<span className="e-small">Ensayo switches to timing only if a session would go over.</span>
              </span>
              <select className="e-input" style={{ width: "240px" }} aria-label="Spending cap" defaultValue="25 cents">
                <option>None</option>
                <option>25 cents</option>
                <option>1 dollar</option>
              </select>
            </div>
          </section>
          <span className="e-small">Last 7 days: about 41 cents across 6 sessions.</span>
        </div>
      </div>
    </AppShell>
  );
}
