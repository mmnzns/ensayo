// Draft generated from Design/screens/html/2-1-home.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";

export default function Home() {
  return (
    <AppShell nav="home">
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span className="e-meta">Wednesday, October 21</span>
          <h1 className="e-h1">Good evening, Dana</h1>
        </div>
        <span className="e-pill" style={{ fontSize: "14px", padding: "8px 14px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B86A0C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3c2 4 6 5 6 10a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-5 1-7z" />
          </svg>
          4 days in a row
        </span>
      </header>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "stretch" }}>
        <section className="e-card e-glow" style={{ flex: "999 1 480px", minWidth: "0", padding: "36px", display: "flex", flexDirection: "column", gap: "18px" }}>
          <span className="e-label">Next up</span>
          <h2 className="e-h1" style={{ fontSize: "28px" }}>Practice getting to the point</h2>
          <p className="e-meta" style={{ margin: "0" }}>A 5-question Drill, about 12 minutes. Kestrel Pay's hiring manager questions first, since that interview is Friday.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "8px" }}>
            <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-primary e-btn-big">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0" />
                <path d="M12 18v3" />
              </svg>
              Practice
            </Link>
            <Link to="2-3-start-a-session" className="e-btn e-btn-white">Start a Mock</Link>
            <Link to="2-3-start-a-session" className="e-btn e-btn-ghost">More options</Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px", borderTop: "1px solid var(--e-line)", paddingTop: "16px" }}>
            <span className="e-small">
              <strong style={{ color: "var(--e-ink)" }}>Drill</strong> · a note after every answer, then try it again. For building the habit.
            </span>
            <span className="e-small">
              <strong style={{ color: "var(--e-ink)" }}>Mock</strong> · a whole interview stage straight through, notes at the end. For testing it under pressure.
            </span>
          </div>
        </section>
        <section className="e-card" style={{ flex: "1 1 300px", minWidth: "0", display: "flex", flexDirection: "column", gap: "14px" }}>
          <span className="e-label">Next interview</span>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span className="e-h2">Kestrel Pay</span>
            <span className="e-meta">Hiring manager · Friday, 2:00 PM</span>
          </div>
          <span className="e-badge" style={{ alignSelf: "flex-start" }}>In 2 days</span>
          <p className="e-meta" style={{ margin: "0" }}>Tomorrow evening, lock your opener, one story and two questions.</p>
          <Link to="6-6-application-stages-and-night-before" className="e-btn e-btn-line e-btn-sm" style={{ alignSelf: "flex-start", marginTop: "auto" }}>Practice this stage</Link>
        </section>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "stretch" }}>
        <section className="e-card" style={{ flex: "999 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <span className="e-label">Your focus</span>
            <Link to="7-1-progress-habits" className="e-small">All habits</Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
              <span className="e-h3">Getting to the point</span>
              <span className="e-meta">7 of your last 10</span>
            </div>
            <div className="e-bar" aria-label="7 of 10">
              <span style={{ width: "70%" }} />
            </div>
            <span className="e-small">One more good one and it graduates.</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
              <span className="e-h3">Stopping once the point lands</span>
              <span className="e-meta">4 of your last 10</span>
            </div>
            <div className="e-bar" aria-label="4 of 10">
              <span style={{ width: "40%" }} />
            </div>
            <span className="e-small">Fixes stick on the second try 3 out of 4 times.</span>
          </div>
        </section>
        <section className="e-card" style={{ flex: "1 1 300px", minWidth: "0", display: "flex", flexDirection: "column", gap: "10px" }}>
          <span className="e-label">Quick practice</span>
          <Link to="5-1-stories" className="e-nav" style={{ padding: "12px 0", borderBottom: "1px solid var(--e-line)", borderRadius: "0" }}>
            Practice a story <span style={{ marginLeft: "auto" }}>›</span>
          </Link>
          <Link to="2-3-start-a-session" className="e-nav" style={{ padding: "12px 0", borderBottom: "1px solid var(--e-line)", borderRadius: "0" }}>
            Practice a stage <span style={{ marginLeft: "auto" }}>›</span>
          </Link>
          <Link to="2-3-start-a-session" className="e-nav" style={{ padding: "12px 0", borderRadius: "0" }}>
            Type your own question <span style={{ marginLeft: "auto" }}>›</span>
          </Link>
        </section>
      </div>
      <section className="e-card" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "20px" }}>
        <span className="e-label" style={{ flex: "none" }}>Last session</span>
        <span className="e-h3" style={{ flex: "1 1 260px" }}>Yesterday · Drill · Recruiter stage</span>
        <span className="e-win" style={{ fontSize: "18px" }}>3 fixes stuck</span>
        <Link to="4-3-session-results-drill" className="e-btn e-btn-ghost e-btn-sm">See results ›</Link>
      </section>
      <p className="e-small" style={{ margin: "0" }}>46 answers practiced · 18 questions faced · 9 follow-ups handled</p>
    </AppShell>
  );
}
