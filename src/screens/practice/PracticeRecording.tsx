// Draft generated from Design/screens/html/3-2-practice-recording.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import Wordmark from "../../ui/Wordmark";

export default function PracticeRecording() {
  return (
    <FocusShell>
      <div className="e-wrap" style={{ width: "100%" }}>
        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <span className="e-brand" style={{ padding: "0" }} aria-label="Ensayo">
              <Wordmark size={24} />
            </span>
            <span className="e-pill" style={{ background: "var(--e-tint)", color: "var(--e-primary-dark)", fontWeight: "600" }} title="A note after every answer, then try again">Drill</span>
            <span className="e-pill">Hiring manager · 2 of 5</span>
          </div>
          <div className="e-bar" style={{ flex: "1 1 200px", maxWidth: "280px" }} aria-label="Session progress, 2 of 5">
            <span style={{ width: "40%" }} />
          </div>
          <span className="e-pill" style={{ gap: "8px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#C2412D" }} />Recording
          </span>
        </header>
      </div>
      <div style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "40px", textAlign: "center", padding: "32px 0" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center", maxWidth: "820px" }}>
          <span className="e-label">You're answering</span>
          <p style={{ margin: "0", fontSize: "22px", fontWeight: "600", lineHeight: "1.35", color: "var(--e-muted)" }}>Tell me about a time you improved a metric that really mattered to the business.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "5px", height: "96px" }} aria-label="Your voice level">
          <span style={{ width: "6px", height: "18%", borderRadius: "3px", background: "var(--e-primary)", opacity: "0.5" }} />
          <span style={{ width: "6px", height: "34%", borderRadius: "3px", background: "var(--e-primary)", opacity: "0.6" }} />
          <span style={{ width: "6px", height: "56%", borderRadius: "3px", background: "var(--e-primary)", opacity: "0.7" }} />
          <span style={{ width: "6px", height: "80%", borderRadius: "3px", background: "var(--e-primary)" }} />
          <span style={{ width: "6px", height: "64%", borderRadius: "3px", background: "var(--e-primary)" }} />
          <span style={{ width: "6px", height: "92%", borderRadius: "3px", background: "var(--e-primary)" }} />
          <span style={{ width: "6px", height: "70%", borderRadius: "3px", background: "var(--e-primary)" }} />
          <span style={{ width: "6px", height: "48%", borderRadius: "3px", background: "var(--e-primary)" }} />
          <span style={{ width: "6px", height: "76%", borderRadius: "3px", background: "var(--e-primary)" }} />
          <span style={{ width: "6px", height: "100%", borderRadius: "3px", background: "var(--e-primary)" }} />
          <span style={{ width: "6px", height: "66%", borderRadius: "3px", background: "var(--e-primary)" }} />
          <span style={{ width: "6px", height: "40%", borderRadius: "3px", background: "var(--e-primary)" }} />
          <span style={{ width: "6px", height: "72%", borderRadius: "3px", background: "var(--e-primary)" }} />
          <span style={{ width: "6px", height: "54%", borderRadius: "3px", background: "var(--e-primary)", opacity: "0.8" }} />
          <span style={{ width: "6px", height: "30%", borderRadius: "3px", background: "var(--e-primary)", opacity: "0.6" }} />
          <span style={{ width: "6px", height: "16%", borderRadius: "3px", background: "var(--e-primary)", opacity: "0.5" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", width: "100%", maxWidth: "420px" }}>
          <span style={{ fontSize: "44px", fontWeight: "600", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>0:41</span>
          <div style={{ position: "relative", width: "100%", height: "8px", borderRadius: "999px", background: "var(--e-line)" }} aria-label="41 seconds, target 60 to 90">
            <span style={{ position: "absolute", left: "0", top: "0", height: "8px", width: "34%", borderRadius: "999px", background: "var(--e-primary)" }} />{" "}<span style={{ position: "absolute", left: "50%", top: "-4px", width: "25%", height: "16px", borderRadius: "6px", boxShadow: "inset 0 0 0 2px var(--e-win)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
            <span className="e-small">0:00</span>
            <span className="e-small">target 1:00 to 1:30</span>
            <span className="e-small">2:00</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <Link to="3-3-practice-thinking" aria-label="Stop answering" style={{ width: "96px", height: "96px", borderRadius: "50%", background: "var(--e-ink)", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(43,39,34,0.22)" }}>
            <span style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#FFFFFF" }} />
          </Link>
          <span className="e-meta">
            Press <span className="e-kbd">Space</span> when you're done
          </span>
        </div>
      </div>
      <div className="e-wrap" style={{ width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span className="e-small">Pauses are fine. Take a second to find the word.</span>
          <button type="button" className="e-btn e-btn-ghost e-btn-sm">Start over</button>
        </div>
      </div>
    </FocusShell>
  );
}
