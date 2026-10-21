// Draft generated from Design/screens/html/9-1-feedback.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";

export default function Feedback() {
  return (
    <AppShell nav="feedback">
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <h1 className="e-h1">Feedback</h1>
        <span className="e-meta">Ensayo is a free prototype. Tell me what broke, what helped, or what you wish it did. I read every message.</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>
        <section className="e-card" style={{ flex: "999 1 520px", minWidth: "0", display: "flex", flexDirection: "column", gap: "18px" }}>
          <div className="e-field">
            <span style={{ fontSize: "14px", fontWeight: "600" }}>What's this about?</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <button type="button" className="e-chip">Something broke</button>
              <button type="button" className="e-chip e-chip-on" aria-pressed="true">An idea</button>
              <button type="button" className="e-chip">A note felt wrong</button>
              <button type="button" className="e-chip">Something else</button>
            </div>
          </div>
          <div className="e-field">
            <label htmlFor="msg">Your message</label>
            <textarea id="msg" className="e-input" rows={7} defaultValue={"It would help to practice a single follow-up on its own, without answering the main question first."} />
          </div>
          <div className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "16px 18px", background: "#F6F6F7" }}>
            <span style={{ fontSize: "14px", fontWeight: "600" }}>
              Would you pay for Ensayo? <span style={{ fontWeight: "400", color: "var(--e-muted)" }}>· optional, it's free and staying free for now</span>
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <button type="button" className="e-chip" style={{ minHeight: "38px", padding: "6px 14px", fontSize: "14px" }}>No</button>
              <button type="button" className="e-chip e-chip-on" aria-pressed="true" style={{ minHeight: "38px", padding: "6px 14px", fontSize: "14px" }}>Maybe</button>
              <button type="button" className="e-chip" style={{ minHeight: "38px", padding: "6px 14px", fontSize: "14px" }}>Yes</button>
            </div>
            <span className="e-small">What feels fair, one time?</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <button type="button" className="e-chip" style={{ minHeight: "34px", padding: "5px 12px", fontSize: "13px" }}>Free only</button>
              <button type="button" className="e-chip" style={{ minHeight: "34px", padding: "5px 12px", fontSize: "13px" }}>Under $10</button>
              <button type="button" className="e-chip e-chip-on" aria-pressed="true" style={{ minHeight: "34px", padding: "5px 12px", fontSize: "13px" }}>$10 to $25</button>
              <button type="button" className="e-chip" style={{ minHeight: "34px", padding: "5px 12px", fontSize: "13px" }}>$25 to $50</button>
              <button type="button" className="e-chip" style={{ minHeight: "34px", padding: "5px 12px", fontSize: "13px" }}>More</button>
            </div>
          </div>
          <div className="e-field">
            <label htmlFor="em">
              Your email <span style={{ fontWeight: "400", color: "var(--e-muted)" }}>· optional, only if you'd like a reply</span>
            </label>
            <input id="em" className="e-input" placeholder="you@example.com" />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
            <input type="checkbox" className="e-check" defaultChecked />
            <span className="e-meta">Include the app version and system (Ensayo 0.1.0 · macOS 15)</span>
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px", borderTop: "1px solid var(--e-line)", paddingTop: "16px" }}>
            <span className="e-small" style={{ maxWidth: "380px" }}>Only what you type here is sent. Never your recordings, answers, stories or applications.</span>
            <div style={{ display: "flex", gap: "10px" }}>
              <button type="button" className="e-btn e-btn-ghost">Copy message</button>
              <button type="button" className="e-btn e-btn-primary">Send by email</button>
            </div>
          </div>
          <span className="e-small">Send by email opens your email app with the message ready to go to miguel@mnmonzones.com. No email app? Copy message, then paste it into an email to that address.</span>
        </section>
        <div style={{ flex: "1 1 340px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <span className="e-h3">A Craft Concepts Digital app</span>
            <span className="e-meta">Ensayo is a free app from Craft Concepts Digital, the studio behind Talaan and Parlato. Built by Miguel Monzones.</span>
            <Link to="https://craftconceptsdigital.com" className="e-rowline" style={{ padding: "12px 0", textDecoration: "none", color: "var(--e-ink)" }}>
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontWeight: "600" }}>Craft Concepts Digital</span>
                <span className="e-small">craftconceptsdigital.com</span>
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 4h6v6" />
                <path d="M20 4l-9 9" />
                <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
              </svg>
            </Link>
            <Link to="https://mnmonzones.com" className="e-rowline" style={{ padding: "12px 0", textDecoration: "none", color: "var(--e-ink)", borderBottom: "none" }}>
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontWeight: "600" }}>Miguel Monzones</span>
                <span className="e-small">mnmonzones.com</span>
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 4h6v6" />
                <path d="M20 4l-9 9" />
                <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
              </svg>
            </Link>
          </section>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "14px", alignItems: "flex-start" }}>
            <span className="e-h3">Like it?</span>
            <span className="e-meta">Ensayo stays free. If it helped you walk in ready, a coffee keeps it going.</span>
            <Link to="https://www.buymeacoffee.com/mnmnzns" style={{ display: "inline-flex", alignItems: "center", gap: "10px", background: "#FFDD00", color: "#000000", border: "1.5px solid #000000", borderRadius: "12px", padding: "10px 18px", fontFamily: "'Poppins', sans-serif", fontWeight: "500", fontSize: "16px", textDecoration: "none" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" fill="#FFFFFF" />
                <path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17" />
              </svg>
              Buy me a coffee
            </Link>
            <span className="e-small">Opens in your browser.</span>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
