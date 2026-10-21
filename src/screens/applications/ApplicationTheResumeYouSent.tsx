// Draft generated from Design/screens/html/6-5-application-the-resume-you-sent.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";

export default function ApplicationTheResumeYouSent() {
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
        <Link to="2-3-start-a-session" className="e-btn e-btn-primary">Practice the next stage</Link>
      </header>
      <nav style={{ display: "flex", flexWrap: "wrap", gap: "6px", background: "var(--e-surface)", borderRadius: "14px", padding: "4px", boxShadow: "var(--e-shadow)", alignSelf: "flex-start" }} aria-label="Application sections">
        <Link to="6-3-application-overview" className="e-btn e-btn-sm e-btn-ghost">Overview</Link>
        <Link to="6-5-application-the-resume-you-sent" aria-current="page" className="e-btn e-btn-sm" style={{ background: "var(--e-tint)", color: "var(--e-ink)" }}>Resume</Link>
        <Link to="6-6-application-stages-and-night-before" className="e-btn e-btn-sm e-btn-ghost">Stages and night before</Link>
        <Link to="6-8-application-what-you-ve-said" className="e-btn e-btn-sm e-btn-ghost">What you've said</Link>
        <Link to="6-7-cue-sheet" className="e-btn e-btn-sm e-btn-ghost">Cue sheet</Link>
      </nav>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>
        <section className="e-card" style={{ flex: "1 1 300px", minWidth: "0", display: "flex", flexDirection: "column", gap: "16px" }}>
          <span className="e-h3">The resume you sent</span>
          <div style={{ aspectRatio: "8.5 / 11", borderRadius: "12px", background: "var(--e-ground)", boxShadow: "inset 0 0 0 1.5px var(--e-line)", padding: "22px", display: "flex", flexDirection: "column", gap: "10px", boxSizing: "border-box" }} aria-label="Resume preview">
            <span style={{ height: "12px", width: "55%", borderRadius: "4px", background: "var(--e-ink)", opacity: ".75" }} />
            <span style={{ height: "6px", width: "40%", borderRadius: "3px", background: "var(--e-line)" }} />
            <span style={{ height: "8px", width: "35%", borderRadius: "3px", background: "var(--e-primary)", opacity: ".6", marginTop: "10px" }} />
            <span style={{ height: "6px", width: "92%", borderRadius: "3px", background: "var(--e-line)" }} />
            <span style={{ height: "6px", width: "86%", borderRadius: "3px", background: "var(--e-line)" }} />
            <span style={{ height: "6px", width: "90%", borderRadius: "3px", background: "var(--e-line)" }} />
            <span style={{ height: "8px", width: "30%", borderRadius: "3px", background: "var(--e-primary)", opacity: ".6", marginTop: "10px" }} />
            <span style={{ height: "6px", width: "88%", borderRadius: "3px", background: "var(--e-line)" }} />
            <span style={{ height: "6px", width: "80%", borderRadius: "3px", background: "var(--e-line)" }} />
            <span style={{ height: "6px", width: "84%", borderRadius: "3px", background: "var(--e-line)" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ fontWeight: "600" }}>Dana Ortiz, Resume, Kestrel.pdf</span>
            <span className="e-small">Sent Oct 6 · read Oct 6 · 2 pages</span>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" className="e-btn e-btn-line e-btn-sm">Open</button>
            <button type="button" className="e-btn e-btn-ghost e-btn-sm">Replace</button>
          </div>
          <span className="e-small">This is the version Kestrel Pay has. Ensayo reads it; it never changes it.</span>
        </section>
        <div style={{ flex: "999 1 560px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="e-h2">Say these out loud</span>
              <span className="e-meta">What Kestrel Pay needs most, and your resume already shows. Don't assume they read it.</span>
            </div>
            <div className="e-soft" style={{ display: "flex", alignItems: "flex-start", gap: "14px", padding: "16px 20px" }}>
              <span className="e-h3" style={{ color: "var(--e-primary-dark)" }}>1</span>
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                <span className="e-h3" style={{ fontSize: "16px" }}>You ran lifecycle with no ops team</span>
                <span className="e-small">Resume: "Sole lifecycle owner at Fernhill"</span>
              </span>
              <span className="e-badge e-badge-ok">Said in 2 of 3 mocks</span>
            </div>
            <div className="e-soft" style={{ display: "flex", alignItems: "flex-start", gap: "14px", padding: "16px 20px" }}>
              <span className="e-h3" style={{ color: "var(--e-primary-dark)" }}>2</span>
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                <span className="e-h3" style={{ fontSize: "16px" }}>Activation 31% to 44%</span>
                <span className="e-small">Resume: "Lifted 7-day activation from 31% to 44%"</span>
              </span>
              <span className="e-badge e-badge-ok">Said in 3 of 3</span>
            </div>
            <div className="e-soft" style={{ display: "flex", alignItems: "flex-start", gap: "14px", padding: "16px 20px", background: "var(--e-highlight)" }}>
              <span className="e-h3" style={{ color: "var(--e-warn-ink)" }}>3</span>
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                <span className="e-h3" style={{ fontSize: "16px" }}>Weekly reporting to leadership</span>
                <span className="e-small">Resume: "Weekly retention readout to the exec team"</span>
              </span>
              <span className="e-badge">Not said yet</span>
            </div>
          </section>
          <section className="e-card" style={{ padding: "20px 28px 8px", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "8px", paddingBottom: "6px" }}>
              <span className="e-h2">What your resume says</span>
              <span className="e-small">Checked against your stories and everything you say. Read wrong? Edit or remove it.</span>
            </div>
            <div className="e-rowline" style={{ padding: "14px 0", alignItems: "flex-start" }}>
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "15px" }}>Senior Lifecycle Manager, Fernhill · 2022 to now</span>
                <span className="e-small">Title and dates</span>
              </span>
              <span className="e-badge e-badge-ok">Matches your stories</span>
              <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label="Edit">Edit</button>
            </div>
            <div className="e-rowline" style={{ padding: "14px 0", alignItems: "flex-start" }}>
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "15px" }}>Lifted 7-day activation from 31% to 44%</span>
                <span className="e-small">Number</span>
              </span>
              <span className="e-badge e-badge-ok">Matches your stories</span>
              <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label="Edit">Edit</button>
            </div>
            <div className="e-rowline" style={{ padding: "14px 0", alignItems: "flex-start", background: "var(--e-highlight)", margin: "0 -28px", paddingLeft: "28px", paddingRight: "28px" }}>
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "15px" }}>Cut onboarding from 5 steps to 1</span>
                <span className="e-small">Number</span>
              </span>
              <span className="e-badge">Your story says 3 steps to 1</span>
              <button type="button" className="e-btn e-btn-white e-btn-sm">Which is right?</button>
              <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label="Edit">Edit</button>
            </div>
            <div className="e-rowline" style={{ padding: "14px 0", alignItems: "flex-start", borderBottom: "none" }}>
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "15px" }}>Managed a 1.2M subscriber base</span>
                <span className="e-small">Number</span>
              </span>
              <span className="e-pill">Not in your stories</span>
              <Link to="5-2-add-a-story-paste" className="e-btn e-btn-ghost e-btn-sm">Add</Link>
              <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label="Edit">Edit</button>
            </div>
            <span className="e-small" style={{ padding: "10px 0 14px" }}>The resume can't be changed now, so if a story number is the right one, say why it moved when it comes up.</span>
          </section>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "8px" }}>
              <span className="e-h3">Stories from your resume</span>
              <span className="e-small">Bullets with a result, ready to turn into stories</span>
            </div>
            <div className="e-rowline" style={{ padding: "12px 0" }}>
              <span style={{ flex: "1" }}>Win-back series, 18% of lapsed customers came back</span>
              <span className="e-badge">Strategy missing</span>
              <Link to="5-3-add-a-story-review" className="e-btn e-btn-line e-btn-sm">Review</Link>
            </div>
            <div className="e-rowline" style={{ padding: "12px 0", borderBottom: "none" }}>
              <span style={{ flex: "1" }}>Deliverability rebuild at Brightwave, inbox rate 82% to 97%</span>
              <span className="e-badge">Strategy missing</span>
              <Link to="5-3-add-a-story-review" className="e-btn e-btn-line e-btn-sm">Review</Link>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
