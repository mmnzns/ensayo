// Draft generated from Design/screens/html/8-7-settings-check-setup.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";

export default function SettingsCheckSetup() {
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
          <Link to="8-6-settings-privacy" className="e-nav">Privacy</Link>
          <Link to="8-7-settings-check-setup" className="e-nav e-nav-on" aria-current="page">Check setup</Link>
        </nav>
        <div style={{ flex: "999 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingBottom: "10px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span className="e-h2">Check setup</span>
                <span className="e-meta">Runs everything once, the way a real session would.</span>
              </div>
              <button type="button" className="e-btn e-btn-primary e-btn-sm">Run again</button>
            </div>
            <div className="e-rowline" style={{ padding: "14px 0" }}>
              <span className="e-dot" aria-hidden="true" />
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                Microphone<span className="e-small">MacBook Pro microphone · level good, no clipping</span>
              </span>
              <span className="e-meta" style={{ display: "inline-flex", gap: "6px", alignItems: "center", color: "var(--e-primary-dark)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Ready
              </span>
            </div>
            <div className="e-rowline" style={{ padding: "14px 0" }}>
              <span className="e-dot" aria-hidden="true" />
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                Speech to text<span className="e-small">Whisper Large Turbo · 3-second test heard "testing one two three"</span>
              </span>
              <span className="e-meta" style={{ display: "inline-flex", gap: "6px", alignItems: "center", color: "var(--e-primary-dark)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Ready
              </span>
            </div>
            <div className="e-rowline" style={{ padding: "14px 0" }}>
              <span className="e-dot" aria-hidden="true" />
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                Interviewer voice<span className="e-small">Samantha (natural) · played</span>
              </span>
              <span className="e-meta" style={{ display: "inline-flex", gap: "6px", alignItems: "center", color: "var(--e-primary-dark)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Ready
              </span>
            </div>
            <div className="e-rowline" style={{ padding: "14px 0" }}>
              <span className="e-dot" aria-hidden="true" />
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                Feedback engine<span className="e-small">Claude Sonnet 5.5 · answered in 1.8s</span>
              </span>
              <span className="e-meta" style={{ display: "inline-flex", gap: "6px", alignItems: "center", color: "var(--e-primary-dark)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Ready
              </span>
            </div>
            <div className="e-rowline" style={{ padding: "14px 0", borderBottom: "none" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "var(--e-win)", flex: "none" }} aria-hidden="true" />
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                Data folder<span className="e-small">Last synced copy from another computer is open there. Close Ensayo on the other machine first.</span>
              </span>
              <button type="button" className="e-btn e-btn-soft e-btn-sm">How to fix</button>
            </div>
          </section>
          <span className="e-hand" style={{ fontSize: "18px" }}>4 of 5 ready · you can still practice</span>
        </div>
      </div>
    </AppShell>
  );
}
