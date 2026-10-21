// Draft generated from Design/screens/html/6-6-application-stages-and-night-before.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";

export default function ApplicationStagesAndNightBefore() {
  return (
    <AppShell nav="applications">
      <header style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <Link to="6-1-applications" className="e-small" style={{ textDecoration: "none" }}>‹ Applications</Link>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <h1 className="e-h1">Kestrel Pay</h1>
          <span className="e-pill">Startup</span>
        </div>
      </header>
      <nav style={{ display: "flex", flexWrap: "wrap", gap: "6px", background: "var(--e-surface)", borderRadius: "14px", padding: "4px", boxShadow: "var(--e-shadow)", alignSelf: "flex-start" }} aria-label="Application sections">
        <Link to="6-3-application-overview" className="e-btn e-btn-sm e-btn-ghost">Overview</Link>
        <Link to="6-5-application-the-resume-you-sent" className="e-btn e-btn-sm e-btn-ghost">Resume</Link>
        <Link to="6-6-application-stages-and-night-before" aria-current="page" className="e-btn e-btn-sm" style={{ background: "var(--e-tint)", color: "var(--e-ink)" }}>Stages and night before</Link>
        <Link to="6-8-application-what-you-ve-said" className="e-btn e-btn-sm e-btn-ghost">What you've said</Link>
        <Link to="6-7-cue-sheet" className="e-btn e-btn-sm e-btn-ghost">Cue sheet</Link>
      </nav>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>
        <section className="e-card" style={{ flex: "1 1 380px", minWidth: "0", display: "flex", flexDirection: "column", gap: "0" }}>
          <span className="e-h2" style={{ paddingBottom: "12px" }}>Stages</span>
          <div style={{ display: "flex", gap: "16px", padding: "16px 0", borderBottom: "1px solid var(--e-line)" }}>
            <span style={{ width: "28px", height: "28px", borderRadius: "50%", background: "var(--e-primary)", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </span>
            <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="e-h3">Recruiter</span>
              <span className="e-small">Fit and logistics: can they move you forward. Short answers.</span>
              <span className="e-meta">Oct 14 · done · 2 sessions practiced</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "16px", padding: "16px 0", borderBottom: "1px solid var(--e-line)", background: "var(--e-ground)", margin: "0 -28px", paddingLeft: "28px", paddingRight: "28px" }}>
            <span style={{ width: "28px", height: "28px", borderRadius: "50%", boxShadow: "inset 0 0 0 3px var(--e-win)", flex: "none" }} />
            <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                <span className="e-h3">Hiring manager</span>
                <span className="e-badge">Friday 2:00 PM</span>
                <Link to="6-4-application-edit-details" className="e-small">Change</Link>
              </div>
              <span className="e-small">Can you do this job, and how do you work. Follow-ups on ownership and numbers.</span>
              <span className="e-meta">3 sessions · last one: 3 fixes stuck</span>
              <div style={{ display: "flex", gap: "8px" }}>
                <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-primary e-btn-sm">Drill</Link>
                <Link to="4-1-mock-in-progress" className="e-btn e-btn-white e-btn-sm">Mock</Link>
              </div>
              <span className="e-small">Drill: a note after each answer, try again. Mock: the whole stage straight through, notes at the end.</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "16px", padding: "16px 0", borderBottom: "1px solid var(--e-line)" }}>
            <span style={{ width: "28px", height: "28px", borderRadius: "50%", boxShadow: "inset 0 0 0 2px var(--e-line)", flex: "none" }} />
            <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="e-h3">Panel</span>
              <span className="e-small">Can people across teams work with you. Follow-ups on disagreement.</span>
              <span className="e-meta">
                No date yet · <Link to="6-4-application-edit-details" className="e-small">Add date</Link> · not practiced
              </span>
            </div>
            <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-ghost e-btn-sm">Practice</Link>
          </div>
          <div style={{ display: "flex", gap: "16px", padding: "16px 0" }}>
            <span style={{ width: "28px", height: "28px", borderRadius: "50%", boxShadow: "inset 0 0 0 2px var(--e-line)", flex: "none" }} />
            <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="e-h3">
                Leadership <span className="e-small" style={{ fontWeight: "400" }}>· founder</span>
              </span>
              <span className="e-small">Founder call: judgment, commitment, will you run it yourself. Short, skeptical follow-ups.</span>
              <span className="e-meta">No date yet · 1 Mock done</span>
            </div>
            <Link to="4-1-mock-in-progress" className="e-btn e-btn-ghost e-btn-sm">Practice</Link>
          </div>
        </section>
        <section className="e-card" style={{ flex: "1 1 440px", minWidth: "0", display: "flex", flexDirection: "column", gap: "16px", boxShadow: "inset 0 0 0 2px var(--e-primary)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span className="e-label" style={{ color: "var(--e-primary-dark)" }}>Night before · Hiring manager</span>
            <span className="e-h2">Lock three things, then change nothing.</span>
            <span className="e-meta">More prep the night before makes delivery worse. Rehearse these out loud and stop.</span>
          </div>
          <div className="e-soft" style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B8432C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", marginTop: "2px" }}>
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="e-h3">Your opener</span>
              <span className="e-meta">Tell me about yourself: lifecycle marketer, finds where activation breaks, then builds the fix. Fernhill now, Brightwave before.</span>
            </div>
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" style={{ minHeight: "36px" }}>Change</button>
          </div>
          <div className="e-soft" style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B8432C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", marginTop: "2px" }}>
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="e-h3">One power story</span>
              <span className="e-meta">Onboarding drop-off · 31% → 44%</span>
            </div>
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" style={{ minHeight: "36px" }}>Change</button>
          </div>
          <div className="e-soft" style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B8432C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", marginTop: "2px" }}>
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="e-h3">Two questions to ask</span>
              <span className="e-meta">
                1. Beyond activation and first-month retention, how will you judge this hire?<br />2. What's the biggest thing in the way of that?
              </span>
            </div>
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" style={{ minHeight: "36px" }}>Change</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-primary">Rehearse just these · 6 min</Link>
            <Link to="6-7-cue-sheet" className="e-btn e-btn-white">Open cue sheet</Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
