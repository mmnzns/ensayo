// Draft generated from Design/screens/html/4-3-session-results-drill.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import Wordmark from "../../ui/Wordmark";

export default function SessionResultsDrill() {
  return (
    <FocusShell>
      <div className="e-wrap">
        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <span className="e-brand" style={{ padding: "0" }} aria-label="Ensayo">
              <Wordmark size={24} />
            </span>
            <span className="e-pill">Drill · Hiring manager · Kestrel Pay</span>
          </div>
          <Link to="2-1-home" className="e-btn e-btn-white e-btn-sm">Done</Link>
        </header>
        <Link to="4-5-habit-graduation" className="e-soft" style={{ display: "flex", alignItems: "center", gap: "14px", textDecoration: "none", color: "var(--e-ink)", background: "var(--e-glow)", padding: "16px 22px" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B86A0C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 15l-4 6 1-5-4-3 5-1 2-5 2 5 5 1-4 3 1 5z" />
          </svg>
          <span style={{ flex: "1", fontSize: "16px" }}>
            <strong>A habit just stuck.</strong> Getting to the point passed 8 of your last 10.
          </span>
          <span style={{ fontWeight: "600", color: "var(--e-win)" }}>See it ›</span>
        </Link>
        <section className="e-card" style={{ padding: "40px", display: "flex", flexWrap: "wrap", gap: "40px", alignItems: "center" }}>
          <div style={{ flex: "1 1 340px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <span className="e-label">Your focus this session</span>
            <span className="e-h2">Time to your point</span>
            <span className="e-hand" style={{ fontSize: "53px", color: "var(--e-win)" }}>38s → 9s</span>
            <span className="e-meta">Average first try against your best try, across 5 questions.</span>
          </div>
          <div style={{ flex: "1 1 420px", display: "flex", flexDirection: "column", gap: "12px" }} role="img" aria-label="Seconds to your point per question, first try then best try: Q1 44 to 7, Q2 41 to 6, Q3 36 to 12, Q4 31 to 9, Q5 38 to 11. Target under 10 seconds.">
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="e-small">first try ○ · best try ●</span>
              <span className="e-small">target under 10s</span>
            </div>
            <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: "14px", padding: "6px 0" }}>
              <span style={{ position: "absolute", left: "32px", top: "0", bottom: "0", width: "calc((100% - 32px) * 0.1667)", background: "var(--e-tint)", borderRadius: "6px" }} />
              <div style={{ position: "relative", display: "flex", alignItems: "center", height: "18px" }}>
                <span className="e-small" style={{ width: "32px" }}>Q1</span>
                <span style={{ position: "relative", flex: "1", height: "18px" }}>
                  <span style={{ position: "absolute", left: "11.7%", width: "61.6%", top: "8px", height: "2px", background: "var(--e-line)" }} />
                  <span style={{ position: "absolute", left: "calc(73.3% - 7px)", top: "2px", width: "14px", height: "14px", borderRadius: "50%", boxShadow: "inset 0 0 0 2px var(--e-muted)", background: "#FFFFFF" }} />
                  <span style={{ position: "absolute", left: "calc(11.7% - 7px)", top: "2px", width: "14px", height: "14px", borderRadius: "50%", background: "var(--e-primary)" }} />
                </span>
              </div>
              <div style={{ position: "relative", display: "flex", alignItems: "center", height: "18px" }}>
                <span className="e-small" style={{ width: "32px" }}>Q2</span>
                <span style={{ position: "relative", flex: "1", height: "18px" }}>
                  <span style={{ position: "absolute", left: "10%", width: "58.3%", top: "8px", height: "2px", background: "var(--e-line)" }} />
                  <span style={{ position: "absolute", left: "calc(68.3% - 7px)", top: "2px", width: "14px", height: "14px", borderRadius: "50%", boxShadow: "inset 0 0 0 2px var(--e-muted)", background: "#FFFFFF" }} />
                  <span style={{ position: "absolute", left: "calc(10% - 7px)", top: "2px", width: "14px", height: "14px", borderRadius: "50%", background: "var(--e-primary)" }} />
                </span>
              </div>
              <div style={{ position: "relative", display: "flex", alignItems: "center", height: "18px" }}>
                <span className="e-small" style={{ width: "32px" }}>Q3</span>
                <span style={{ position: "relative", flex: "1", height: "18px" }}>
                  <span style={{ position: "absolute", left: "20%", width: "40%", top: "8px", height: "2px", background: "var(--e-line)" }} />
                  <span style={{ position: "absolute", left: "calc(60% - 7px)", top: "2px", width: "14px", height: "14px", borderRadius: "50%", boxShadow: "inset 0 0 0 2px var(--e-muted)", background: "#FFFFFF" }} />
                  <span style={{ position: "absolute", left: "calc(20% - 7px)", top: "2px", width: "14px", height: "14px", borderRadius: "50%", background: "var(--e-primary)" }} />
                </span>
              </div>
              <div style={{ position: "relative", display: "flex", alignItems: "center", height: "18px" }}>
                <span className="e-small" style={{ width: "32px" }}>Q4</span>
                <span style={{ position: "relative", flex: "1", height: "18px" }}>
                  <span style={{ position: "absolute", left: "15%", width: "36.7%", top: "8px", height: "2px", background: "var(--e-line)" }} />
                  <span style={{ position: "absolute", left: "calc(51.7% - 7px)", top: "2px", width: "14px", height: "14px", borderRadius: "50%", boxShadow: "inset 0 0 0 2px var(--e-muted)", background: "#FFFFFF" }} />
                  <span style={{ position: "absolute", left: "calc(15% - 7px)", top: "2px", width: "14px", height: "14px", borderRadius: "50%", background: "var(--e-primary)" }} />
                </span>
              </div>
              <div style={{ position: "relative", display: "flex", alignItems: "center", height: "18px" }}>
                <span className="e-small" style={{ width: "32px" }}>Q5</span>
                <span style={{ position: "relative", flex: "1", height: "18px" }}>
                  <span style={{ position: "absolute", left: "18.3%", width: "45%", top: "8px", height: "2px", background: "var(--e-line)" }} />
                  <span style={{ position: "absolute", left: "calc(63.3% - 7px)", top: "2px", width: "14px", height: "14px", borderRadius: "50%", boxShadow: "inset 0 0 0 2px var(--e-muted)", background: "#FFFFFF" }} />
                  <span style={{ position: "absolute", left: "calc(18.3% - 7px)", top: "2px", width: "14px", height: "14px", borderRadius: "50%", background: "var(--e-primary)" }} />
                </span>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: "32px" }}>
              <span className="e-small">0s</span>
              <span className="e-small">30s</span>
              <span className="e-small">60s</span>
            </div>
          </div>
        </section>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "20px" }}>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span className="e-label">Fixes that stuck</span>
            <span className="e-hand" style={{ fontSize: "39px" }}>3 of 4</span>
            <span className="e-meta">When you tried again, the fix held three times out of four.</span>
          </section>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <span className="e-label">Best answer</span>
            <span className="e-h3">"Tell me about a time you improved a metric..."</span>
            <span className="e-meta">Attempt 3. Point at 0:05, stopped right after the result.</span>
            <button type="button" className="e-btn e-btn-soft e-btn-sm" style={{ alignSelf: "flex-start", marginTop: "auto" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 4l13 8-13 8z" />
              </svg>
              Listen
            </button>
          </section>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <span className="e-label">Next time</span>
            <span className="e-h3">Stopping once the point lands</span>
            <span className="e-meta">You kept going 14 seconds on average after your result. Try ending on the number.</span>
            <Link to="3-1-practice-interviewer-asking" className="e-small" style={{ marginTop: "auto" }}>Practice just this</Link>
          </section>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <p className="e-small" style={{ margin: "0" }}>5 questions · 12 answers · 2 follow-ups handled · 5 days in a row · about 6 cents with Claude Sonnet</p>
          <div style={{ display: "flex", gap: "12px" }}>
            <Link to="2-1-home" className="e-btn e-btn-ghost">Back home</Link>
            <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-primary e-btn-big">Practice again</Link>
          </div>
        </div>
      </div>
    </FocusShell>
  );
}
