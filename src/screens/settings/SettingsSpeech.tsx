// Draft generated from Design/screens/html/8-4-settings-speech.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";

export default function SettingsSpeech() {
  return (
    <AppShell nav="settings">
      <h1 className="e-h1">Settings</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "28px", alignItems: "flex-start" }}>
        <nav style={{ flex: "1 1 170px", maxWidth: "200px", display: "flex", flexDirection: "column", gap: "2px" }} aria-label="Settings sections">
          <Link to="8-1-settings-profile" className="e-nav">Profile</Link>
          <Link to="8-2-settings-practice" className="e-nav">Practice</Link>
          <Link to="8-3-settings-voice" className="e-nav">Voice</Link>
          <Link to="8-4-settings-speech" className="e-nav e-nav-on" aria-current="page">Speech</Link>
          <Link to="8-5-settings-ai" className="e-nav">AI</Link>
          <Link to="8-6-settings-privacy" className="e-nav">Privacy</Link>
          <Link to="8-7-settings-check-setup" className="e-nav">Check setup</Link>
        </nav>
        <div style={{ flex: "999 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingBottom: "10px" }}>
              <span className="e-h2">Speech to text</span>
              <span className="e-meta">How your answers become words. Local models work offline and keep everything here.</span>
            </div>
            <div className="e-rowline">
              <span style={{ flex: "1" }}>Engine</span>
              <select className="e-input" style={{ width: "260px" }} aria-label="Speech engine">
                <optgroup label="On this computer">
                  <option>Whisper</option>
                  <option>Parakeet</option>
                  <option>Nemotron</option>
                </optgroup>
                <optgroup label="Online, with your key">
                  <option>AssemblyAI</option>
                  <option>ElevenLabs Scribe</option>
                  <option>Gemini</option>
                  <option>Speechmatics</option>
                  <option>xAI</option>
                </optgroup>
              </select>
            </div>
            <div className="e-rowline">
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                Model<span className="e-small">Large Turbo is the most accurate and keeps the "um"s. Small is faster on older machines.</span>
              </span>
              <select className="e-input" style={{ width: "260px" }} aria-label="Model" defaultValue="Whisper Large Turbo · 575 MB">
                <option>Whisper Large Turbo · 575 MB</option>
                <option>Whisper Small · 244 MB</option>
              </select>
            </div>
            <div className="e-rowline" style={{ borderBottom: "none" }}>
              <span style={{ flex: "1" }}>Processor use</span>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <button type="button" className="e-chip e-chip-on" aria-pressed="true">Automatic</button>
                <button type="button" className="e-chip">Lower</button>
                <span className="e-small">uses the graphics chip when it helps</span>
              </div>
            </div>
          </section>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingBottom: "10px" }}>
              <span className="e-h3">Models on this computer</span>
              <span className="e-small">1.4 GB</span>
            </div>
            <div className="e-rowline" style={{ padding: "12px 0" }}>
              <span className="e-dot" aria-hidden="true" />
              <span style={{ flex: "1" }}>Whisper Large Turbo</span>
              <span className="e-small">575 MB · in use</span>
              <button type="button" className="e-btn e-btn-ghost e-btn-sm">Remove</button>
            </div>
            <div className="e-rowline" style={{ padding: "12px 0" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", boxShadow: "inset 0 0 0 1.5px var(--e-muted)", flex: "none" }} />
              <span style={{ flex: "1" }}>
                Parakeet v3 <span className="e-small">· found, from another app on this computer</span>
              </span>
              <span className="e-small">600 MB</span>
              <button type="button" className="e-btn e-btn-ghost e-btn-sm">Use</button>
            </div>
            <div className="e-rowline" style={{ padding: "12px 0" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", boxShadow: "inset 0 0 0 1.5px var(--e-line)", flex: "none" }} />
              <span style={{ flex: "1", color: "var(--e-muted)" }}>Whisper Small</span>
              <span className="e-small">244 MB</span>
              <button type="button" className="e-btn e-btn-line e-btn-sm">Download</button>
            </div>
            <div className="e-rowline" style={{ padding: "12px 0", borderBottom: "none" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", boxShadow: "inset 0 0 0 1.5px var(--e-line)", flex: "none" }} />
              <span style={{ flex: "1", color: "var(--e-muted)" }}>Nemotron</span>
              <span className="e-small">2.4 GB</span>
              <button type="button" className="e-btn e-btn-line e-btn-sm">Download</button>
            </div>
          </section>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <span className="e-h3">Online speech keys</span>
            <span className="e-meta">Only used when an online engine is selected. Your audio is sent to that service for transcription.</span>
            <div className="e-rowline" style={{ padding: "12px 0" }}>
              <span style={{ flex: "1" }}>AssemblyAI</span>
              <input className="e-input" type="password" style={{ width: "260px" }} placeholder="Paste key" aria-label="AssemblyAI key" />
              <button type="button" className="e-btn e-btn-soft e-btn-sm">Test</button>
            </div>
            <div className="e-rowline" style={{ padding: "12px 0", borderBottom: "none" }}>
              <span style={{ flex: "1" }}>ElevenLabs</span>
              <input className="e-input" type="password" style={{ width: "260px" }} placeholder="Paste key" aria-label="ElevenLabs key" />
              <button type="button" className="e-btn e-btn-soft e-btn-sm">Test</button>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
