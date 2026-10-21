// Draft generated from Design/screens/html/1-6-feedback-engine.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import Wordmark from "../../ui/Wordmark";

export default function FeedbackEngine() {
  return (
    <FocusShell>
      <div className="e-wrap" style={{ gap: "28px" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <span className="e-brand" style={{ padding: "0" }} aria-label="Ensayo">
            <Wordmark size={24} />
          </span>
          <div className="e-steps" aria-label="Step 6 of 7">
            <span className="on" />
            <span className="on" />
            <span className="on" />
            <span className="on" />
            <span className="on" />
            <span className="on" />
            <span />
          </div>
          <Link to="1-7-your-first-story" className="e-btn e-btn-ghost e-btn-sm">Skip</Link>
        </header>
        <div style={{ maxWidth: "900px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "22px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span className="e-label">Step 6 of 7</span>
            <h1 className="e-h1">Who gives the feedback?</h1>
            <p className="e-meta" style={{ margin: "0" }}>Timing and filler words work with no setup. An AI engine adds the judgment: did you answer the question, say your numbers, own your decisions.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
            <label className="e-card" style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "22px", cursor: "pointer" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <input type="radio" name="eng" className="e-check" />
                <span className="e-h3">Local AI</span>
              </span>
              <span className="e-meta">Runs on this computer. Private and offline. Slower, and lighter on follow-up questions.</span>
              <span className="e-pill" style={{ alignSelf: "flex-start", background: "var(--e-ground)" }}>2.7 GB download</span>
            </label>
            <label className="e-card" style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "22px", cursor: "pointer", boxShadow: "inset 0 0 0 2px var(--e-primary)", background: "var(--e-tint)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <input type="radio" name="eng" className="e-check" defaultChecked />
                <span className="e-h3">Your own key</span>
              </span>
              <span className="e-meta">Claude, OpenAI, Gemini and others. The sharpest feedback. You pay the provider directly, usually cents a session.</span>
              <span className="e-pill" style={{ alignSelf: "flex-start" }}>Recommended</span>
            </label>
            <label className="e-card" style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "22px", cursor: "pointer" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <input type="radio" name="eng" className="e-check" />
                <span className="e-h3">Timing only</span>
              </span>
              <span className="e-meta">Speed, length and filler words. Add an engine any time in Settings.</span>
            </label>
          </div>
          <div className="e-card" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
              <div className="e-field">
                <label htmlFor="prov">Provider</label>
                <select id="prov" className="e-input">
                  <option>Anthropic (Claude)</option>
                  <option>OpenAI</option>
                  <option>Google Gemini</option>
                  <option>OpenRouter</option>
                  <option>Groq</option>
                  <option>Mistral</option>
                  <option>Cerebras</option>
                  <option>Ollama</option>
                  <option>LM Studio</option>
                  <option>Other (OpenAI-compatible)</option>
                </select>
              </div>
              <div className="e-field">
                <label htmlFor="model">Model</label>
                <select id="model" className="e-input">
                  <option>Claude Sonnet 5.5 (recommended)</option>
                  <option>Claude Haiku 5.5</option>
                  <option>Claude Opus 5.5</option>
                  <option>Other model…</option>
                </select>
              </div>
            </div>
            <div className="e-field">
              <label htmlFor="key">API key</label>
              <div style={{ display: "flex", gap: "10px" }}>
                <input id="key" className="e-input" type="password" defaultValue="sk-ant-xxxxxxxxxxxxxxxxxxxx" style={{ flex: "1" }} />
                <button type="button" className="e-btn e-btn-soft e-btn-sm" style={{ minHeight: "48px" }}>Test</button>
              </div>
              <span className="e-meta" style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--e-primary-dark)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                 Works. Saved in your system's secure key storage.
              </span>
            </div>
            <p className="e-small" style={{ margin: "0" }}>Only the text each check needs goes to the provider, never your audio or files. Settings › Privacy lists exactly what is sent.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <Link to="1-5-speech" className="e-btn e-btn-ghost">← Back</Link>
            <Link to="1-7-your-first-story" className="e-btn e-btn-primary">Continue</Link>
          </div>
        </div>
      </div>
    </FocusShell>
  );
}
