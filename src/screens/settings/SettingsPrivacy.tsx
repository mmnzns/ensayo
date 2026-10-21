// Draft generated from Design/screens/html/8-6-settings-privacy.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";

export default function SettingsPrivacy() {
  return (
    <AppShell nav="settings">
      <h1 className="e-h1">Settings</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "28px", alignItems: "flex-start" }}>
        <nav style={{ flex: "1 1 170px", maxWidth: "200px", display: "flex", flexDirection: "column", gap: "2px" }} aria-label="Settings sections">
          <Link to="8-1-settings-profile" className="e-nav">Profile</Link>
          <Link to="8-2-settings-practice" className="e-nav">Practice</Link>
          <Link to="8-3-settings-voice" className="e-nav">Voice</Link>
          <Link to="8-4-settings-speech" className="e-nav">Speech</Link>
          <Link to="8-5-settings-ai" className="e-nav">AI</Link>
          <Link to="8-6-settings-privacy" className="e-nav e-nav-on" aria-current="page">Privacy</Link>
          <Link to="8-7-settings-check-setup" className="e-nav">Check setup</Link>
        </nav>
        <div style={{ flex: "999 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingBottom: "10px" }}>
              <span className="e-h2">What leaves this computer</span>
              <span className="e-meta">Based on your current setup. Change engines to change this list.</span>
            </div>
            <div className="e-rowline">
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                Your recordings<span className="e-small">Whisper runs here. Audio never leaves.</span>
              </span>
              <span className="e-badge e-badge-ok">Stays here</span>
            </div>
            <div className="e-rowline">
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                Transcripts of your answers<span className="e-small">Sent to Anthropic so Claude can give feedback. Not used for training.</span>
              </span>
              <span className="e-badge">Sent to Anthropic</span>
            </div>
            <div className="e-rowline">
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                Stories, job postings and resumes<span className="e-small">Sent only when a question needs them.</span>
              </span>
              <span className="e-badge">Sent when needed</span>
            </div>
            <div className="e-rowline">
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                Feedback you send<span className="e-small">Only the message, your email if you add it, and app version if you tick it. Sent when you press Send.</span>
              </span>
              <span className="e-badge">Sent when you choose</span>
            </div>
            <div className="e-rowline" style={{ borderBottom: "none" }}>
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                Usage data about Ensayo<span className="e-small">There is none. Ensayo has no analytics.</span>
              </span>
              <span className="e-badge e-badge-ok">Nothing sent</span>
            </div>
          </section>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span className="e-h3" style={{ paddingBottom: "8px" }}>Keep</span>
            <div className="e-rowline">
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                Recordings<span className="e-small">Transcripts and scores stay after audio is removed.</span>
              </span>
              <select className="e-input" style={{ width: "220px" }} aria-label="Keep recordings" defaultValue="30 days">
                <option>7 days</option>
                <option>30 days</option>
                <option>90 days</option>
                <option>Forever</option>
                <option>Don't keep</option>
              </select>
            </div>
            <div className="e-rowline" style={{ borderBottom: "none" }}>
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                Data folder<span className="e-small">Ensayo's app folder on this computer · stories, applications, sessions as plain files</span>
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm">Show</button>
                <button type="button" className="e-btn e-btn-line e-btn-sm">Move…</button>
              </div>
            </div>
          </section>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <span className="e-h3">Delete</span>
            <div className="e-rowline">
              <span style={{ flex: "1" }}>
                Delete all recordings now <span className="e-small">· 412 MB</span>
              </span>
              <button type="button" className="e-btn e-btn-line e-btn-sm">Delete recordings</button>
            </div>
            <div className="e-rowline" style={{ borderBottom: "none" }}>
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                Delete everything<span className="e-small">Stories, applications, resumes, sessions and keys. You'll type DELETE to confirm.</span>
              </span>
              <button type="button" className="e-btn e-btn-danger e-btn-sm">Delete all Ensayo data</button>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
