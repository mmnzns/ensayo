// Draft generated from Design/screens/html/3-4-result-attempt-1-details-open.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import Wordmark from "../../ui/Wordmark";

export default function ResultAttempt1DetailsOpen() {
  return (
    <FocusShell>
      <div className="e-wrap">
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
          <Link to="4-3-session-results-drill" className="e-btn e-btn-white e-btn-sm">End session</Link>
        </header>
        <section style={{ display: "flex", gap: "18px", alignItems: "center" }}>
          <div className="e-presence" aria-hidden="true">
            <span />
          </div>
          <h1 className="e-h1" style={{ fontSize: "28px", fontWeight: "600", maxWidth: "860px" }}>Tell me about a time you improved a metric that really mattered to the business.</h1>
        </section>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "stretch" }}>
          <section className="e-card" style={{ flex: "999 1 560px", minWidth: "0", padding: "36px", display: "flex", flexDirection: "column", gap: "24px" }}>
            <span className="e-meta">Attempt 1 of 3</span>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span className="e-label">Coach's note</span>
              <p className="e-hand" style={{ margin: "0", fontSize: "29px" }}>Your result came 41 seconds in, after the whole backstory. Say it first, then tell the story.</p>
            </div>
            <div className="e-soft" style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
              <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "8px" }}>
                <span className="e-label">Try saying</span>
                <p style={{ margin: "0", fontSize: "20px", lineHeight: "1.5" }}>"I moved seven-day activation from 31 to 44 percent by firing the email when people stalled on bank linking."</p>
              </div>
              <button type="button" aria-label="Hear this line" style={{ flex: "none", width: "48px", height: "48px", borderRadius: "50%", border: "none", background: "#FFFFFF", color: "var(--e-pen)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M7 4l13 8-13 8z" />
                </svg>
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", marginTop: "auto" }}>
              <Link to="3-5-result-attempt-2" className="e-btn e-btn-primary e-btn-big">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 3-6.7" />
                  <path d="M3 4v5h5" />
                </svg>
                Again
              </Link>
              <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-ghost">Next question →</Link>
            </div>
          </section>
          <aside className="e-card" style={{ flex: "1 1 320px", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingBottom: "8px" }}>
              <span style={{ fontSize: "15px", fontWeight: "600" }}>
                Your answer <span style={{ color: "var(--e-muted)", fontWeight: "400" }}>· 0:58</span>
              </span>
              <button type="button" className="e-btn e-btn-soft e-btn-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
                  <path d="M21 15a2 2 0 0 1-2 2h-1v-5h3z" />
                  <path d="M3 15a2 2 0 0 0 2 2h1v-5H3z" />
                </svg>
                Listen
              </button>
            </div>
            <p className="e-line-p" style={{ color: "var(--e-muted)" }}>So, um, at Fernhill I was on the lifecycle team, and we owned all the onboarding emails.</p>
            <p className="e-line-p" style={{ color: "var(--e-muted)" }}>And basically activation was kind of flat, like for a long time...</p>
            <p className="e-line-p" style={{ color: "var(--e-muted)" }}>So we looked at the data and, you know, people weren't linking their bank.</p>
            <p className="e-line-p e-hl">And activation went up to about 44 percent, which was a big deal for us.</p>
            <p className="e-small" style={{ margin: "8px 0 0" }}>Highlighted: where your point finally landed, at 0:41.</p>
            <a href="#" className="e-small" style={{ marginTop: "auto", paddingTop: "12px" }}>That note was wrong</a>
          </aside>
        </div>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingBottom: "8px" }}>
            <span className="e-h3">Details</span>
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-expanded="true">Hide</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: "40px" }}>
            <div className="e-rowline" style={{ padding: "12px 0" }}>
              <span style={{ color: "var(--e-muted)", width: "18px", textAlign: "center" }} aria-label="Not yet">●</span>
              <span style={{ flex: "1" }}>Answered the question first</span>
              <span className="e-small">point at 0:41</span>
            </div>
            <div className="e-rowline" style={{ padding: "12px 0" }}>
              <span style={{ color: "var(--e-primary)", width: "18px", textAlign: "center" }} aria-label="Yes">✓</span>
              <span style={{ flex: "1" }}>Said your number</span>
              <span className="e-small">44%</span>
            </div>
            <div className="e-rowline" style={{ padding: "12px 0" }}>
              <span style={{ color: "var(--e-primary)", width: "18px", textAlign: "center" }} aria-label="Yes">✓</span>
              <span style={{ flex: "1" }}>Picked a story that fits</span>
              <span className="e-small">Onboarding drop-off</span>
            </div>
            <div className="e-rowline" style={{ padding: "12px 0" }}>
              <span style={{ color: "var(--e-primary)", width: "18px", textAlign: "center" }} aria-label="Yes">✓</span>
              <span style={{ flex: "1" }}>Kept the setup short</span>
              <span className="e-small">3 sentences</span>
            </div>
            <div className="e-rowline" style={{ padding: "12px 0" }}>
              <span style={{ color: "var(--e-muted)", width: "18px", textAlign: "center" }} aria-label="Not yet">●</span>
              <span style={{ flex: "1" }}>Stopped once the point landed</span>
              <span className="e-small">16 s after</span>
            </div>
            <div className="e-rowline" style={{ padding: "12px 0" }}>
              <span style={{ color: "var(--e-muted)", width: "18px", textAlign: "center" }} aria-label="Not yet">●</span>
              <span style={{ flex: "1" }}>Said what you decided</span>
              <span className="e-small">"we" throughout</span>
            </div>
            <div className="e-rowline" style={{ padding: "12px 0" }}>
              <span style={{ color: "var(--e-muted)", width: "18px", textAlign: "center" }} aria-label="Not yet">●</span>
              <span style={{ flex: "1" }}>Opened with how you work</span>
              <span className="e-small">no method line</span>
            </div>
            <div className="e-rowline" style={{ padding: "12px 0" }}>
              <span style={{ color: "var(--e-primary)", width: "18px", textAlign: "center" }} aria-label="Yes">✓</span>
              <span style={{ flex: "1" }}>No knocks on past teams</span>
              <span className="e-small" />
            </div>
            <div className="e-rowline" style={{ padding: "12px 0" }}>
              <span style={{ color: "var(--e-muted)", width: "18px", textAlign: "center" }} aria-label="Not yet">●</span>
              <span style={{ flex: "1" }}>Filler words</span>
              <span className="e-small">4 a minute · um, like, you know, basically</span>
            </div>
            <div className="e-rowline" style={{ padding: "12px 0" }}>
              <span style={{ color: "var(--e-muted)", width: "18px", textAlign: "center" }} aria-hidden="true">·</span>
              <span style={{ flex: "1" }}>Pace and length</span>
              <span className="e-small">148 words a minute · 0:58</span>
            </div>
          </div>
          <p className="e-small" style={{ margin: "8px 0 0" }}>Two sentences trailed off at the end. Finish them with breath to spare.</p>
        </section>
      </div>
    </FocusShell>
  );
}
