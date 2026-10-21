// Draft generated from Design/screens/html/6-3-application-overview.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";

export default function ApplicationOverview() {
  return (
    <AppShell nav="applications">
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <Link to="6-1-applications" className="e-small" style={{ textDecoration: "none" }}>‹ Applications</Link>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h1 className="e-h1">Kestrel Pay</h1>
            <span className="e-pill">Startup</span>
            <button type="button" className="e-pill" style={{ border: "none", font: "inherit", fontSize: "13px", fontWeight: "600", background: "var(--e-tint)", color: "var(--e-primary-dark)", cursor: "pointer" }} aria-haspopup="menu">
              Interviewing 
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>
          <span className="e-meta">Senior Lifecycle Marketing Manager · applied Oct 6 · next: Hiring manager, Friday 2:00 PM</span>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link to="6-4-application-edit-details" className="e-btn e-btn-line">Edit details</Link>
          <Link to="2-3-start-a-session" className="e-btn e-btn-primary">Practice the next stage</Link>
        </div>
      </header>
      <nav style={{ display: "flex", flexWrap: "wrap", gap: "6px", background: "var(--e-surface)", borderRadius: "14px", padding: "4px", boxShadow: "var(--e-shadow)", alignSelf: "flex-start" }} aria-label="Application sections">
        <Link to="6-3-application-overview" aria-current="page" className="e-btn e-btn-sm" style={{ background: "var(--e-tint)", color: "var(--e-ink)" }}>Overview</Link>
        <Link to="6-5-application-the-resume-you-sent" className="e-btn e-btn-sm e-btn-ghost">Resume</Link>
        <Link to="6-6-application-stages-and-night-before" className="e-btn e-btn-sm e-btn-ghost">Stages and night before</Link>
        <Link to="6-8-application-what-you-ve-said" className="e-btn e-btn-sm e-btn-ghost">What you've said</Link>
        <Link to="6-7-cue-sheet" className="e-btn e-btn-sm e-btn-ghost">Cue sheet</Link>
      </nav>
      <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "12px" }}>
          <span className="e-h2">What they likely need</span>
          <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="e-small">Early startup, founder-led · 40 people, from the posting</span>
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label="Edit">Edit</button>
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
          <div className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span className="e-h3">Keep new customers</span>
            <span className="e-meta">Activation and early retention, reported to the founders weekly.</span>
          </div>
          <div className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span className="e-h3">Do more with less</span>
            <span className="e-meta">"No ops team behind you": you build and run it alone.</span>
          </div>
          <div className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span className="e-h3">Win customers</span>
            <span className="e-meta">From first signup to the tenth payment.</span>
          </div>
        </div>
      </section>
      <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingBottom: "8px" }}>
          <span className="e-h2">Three things they need to believe about you</span>
          <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label="Edit">Edit</button>
        </div>
        <div className="e-rowline" style={{ alignItems: "flex-start" }}>
          <span className="e-h2" style={{ width: "28px", color: "var(--e-muted)" }}>1</span>
          <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "6px" }}>
            <span className="e-h3">You can own lifecycle end to end, with no ops team.</span>
            <span className="e-meta">None of your stories shows this yet. A story where you did the data, the build and the reporting yourself would.</span>
          </div>
          <span className="e-badge">No story yet</span>{" "}<Link to="5-2-add-a-story-paste" className="e-btn e-btn-line e-btn-sm">Add one</Link>
        </div>
        <div className="e-rowline" style={{ alignItems: "flex-start" }}>
          <span className="e-h2" style={{ width: "28px", color: "var(--e-muted)" }}>2</span>
          <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "6px" }}>
            <span className="e-h3">You move activation, not just send messages.</span>
            <span className="e-meta">Onboarding drop-off · 7-day activation 31% → 44%</span>
          </div>
          <span className="e-badge e-badge-ok">Covered</span>{" "}<Link to="5-4-story" className="e-btn e-btn-ghost e-btn-sm">Open</Link>
        </div>
        <div className="e-rowline" style={{ alignItems: "flex-start", borderBottom: "none" }}>
          <span className="e-h2" style={{ width: "28px", color: "var(--e-muted)" }}>3</span>
          <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "6px" }}>
            <span className="e-h3">You'll run it week to week until the number moves.</span>
            <span className="e-meta">Reactivation program · iterated from 2.1% to 4.8%</span>
          </div>
          <span className="e-badge e-badge-ok">Covered</span>{" "}<Link to="5-4-story" className="e-btn e-btn-ghost e-btn-sm">Open</Link>
        </div>
      </section>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px" }}>
        <section className="e-card" style={{ flex: "1 1 380px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <span className="e-h3">They ask for, and your stories don't mention</span>
          <div className="e-rowline" style={{ padding: "10px 0" }}>
            <span style={{ flex: "1" }}>Hands-on SQL for cohort analysis</span>
            <span className="e-small">practice the gap question</span>
          </div>
          <div className="e-rowline" style={{ padding: "10px 0", borderBottom: "none" }}>
            <span style={{ flex: "1" }}>Push notifications at scale</span>
            <span className="e-small">practice the gap question</span>
          </div>
        </section>
        <section className="e-card" style={{ flex: "1 1 380px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <span className="e-h3">Their words, worth echoing</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <span className="e-pill" style={{ background: "var(--e-ground)", color: "var(--e-ink)" }}>"first signup to the tenth payment"</span>
            <span className="e-pill" style={{ background: "var(--e-ground)", color: "var(--e-ink)" }}>"no ops team behind you"</span>
            <span className="e-pill" style={{ background: "var(--e-ground)", color: "var(--e-ink)" }}>"report to the founders every week"</span>
            <span className="e-pill" style={{ background: "var(--e-ground)", color: "var(--e-ink)" }}>"run the experiments"</span>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
