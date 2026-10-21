// Draft generated from Design/screens/html/6-8-application-what-you-ve-said.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";

export default function ApplicationWhatYouVeSaid() {
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
        <Link to="6-6-application-stages-and-night-before" className="e-btn e-btn-sm e-btn-ghost">Stages and night before</Link>
        <Link to="6-8-application-what-you-ve-said" aria-current="page" className="e-btn e-btn-sm" style={{ background: "var(--e-tint)", color: "var(--e-ink)" }}>What you've said</Link>
        <Link to="6-7-cue-sheet" className="e-btn e-btn-sm e-btn-ghost">Cue sheet</Link>
      </nav>
      <p className="e-meta" style={{ margin: "0" }}>Everything Kestrel Pay has heard from you: first your resume, then every stage you've practiced. The same facts should come out the same way every time. If a line was heard wrong, edit or remove it.</p>
      <section className="e-card" style={{ padding: "8px 28px" }}>
        <div className="e-rowline" style={{ padding: "18px 0", alignItems: "flex-start" }}>
          <span className="e-h3" style={{ width: "180px", flex: "none" }}>Onboarding result</span>
          <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "15px" }}>
              "Lifted 7-day activation from 31% to 44%" <span className="e-small">· Your resume</span>
            </span>
            <span style={{ fontSize: "15px" }}>
              "Activation went from 31 to 44 percent in a quarter" <span className="e-small">· Hiring manager drill</span>
            </span>
          </div>
          <span className="e-badge e-badge-ok">Consistent</span>{" "}<button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label="Edit">Edit</button>
        </div>
        <div className="e-rowline" style={{ padding: "18px 0", alignItems: "flex-start" }}>
          <span className="e-h3" style={{ width: "180px", flex: "none" }}>Notice period</span>
          <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "15px" }}>
              <s style={{ color: "var(--e-muted)" }}>"Four weeks"</s>
              <span className="e-small">· Recruiter</span>
            </span>
            <span style={{ fontSize: "15px" }}>
              "Two weeks" <span className="e-small">· Leadership mock · marked as the current answer</span>
            </span>
          </div>
          <span className="e-badge e-badge-ok">Updated</span>{" "}<button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label="Edit">Edit</button>
        </div>
        <div className="e-rowline" style={{ padding: "18px 0", alignItems: "flex-start" }}>
          <span className="e-h3" style={{ width: "180px", flex: "none" }}>Why you're leaving</span>
          <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "15px" }}>
              "I want to own lifecycle end to end, not just one channel." <span className="e-small">· Recruiter</span>
            </span>
            <span style={{ fontSize: "15px" }}>
              "I'm looking for broader ownership across the whole lifecycle." <span className="e-small">· Hiring manager drill</span>
            </span>
          </div>
          <span className="e-badge e-badge-ok">Consistent</span>{" "}<button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label="Edit">Edit</button>
        </div>
        <div className="e-rowline" style={{ padding: "18px 0", alignItems: "flex-start" }}>
          <span className="e-h3" style={{ width: "180px", flex: "none" }}>Pay range</span>
          <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "15px" }}>
              "125 to 140 thousand base" <span className="e-small">· Recruiter</span>
            </span>
          </div>
          <span className="e-pill" style={{ background: "var(--e-ground)" }}>Said once</span>{" "}<button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label="Edit">Edit</button>
        </div>
        <div className="e-rowline" style={{ padding: "18px 0", alignItems: "flex-start" }}>
          <span className="e-h3" style={{ width: "180px", flex: "none" }}>Why Kestrel Pay</span>
          <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "15px" }}>
              "You need one person who builds the journeys and runs them every week." <span className="e-small">· Recruiter</span>
            </span>
          </div>
          <span className="e-pill" style={{ background: "var(--e-ground)" }}>Said once</span>{" "}<button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label="Edit">Edit</button>
        </div>
        <div className="e-rowline" style={{ padding: "18px 0", alignItems: "flex-start", background: "var(--e-highlight)", margin: "0 -28px", paddingLeft: "28px", paddingRight: "28px" }}>
          <span className="e-h3" style={{ width: "180px", flex: "none" }}>Reactivation result</span>
          <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "15px" }}>
              "About 5 percent" <span className="e-small">· Leadership mock</span>
            </span>
            <span className="e-meta" style={{ color: "var(--e-warn-ink)" }}>Your story bank says 4.8 percent. Say the real number; small rounding up adds up across stages.</span>
          </div>
          <button type="button" className="e-btn e-btn-white e-btn-sm">It's 5 now</button>
        </div>
        <div className="e-rowline" style={{ padding: "18px 0", alignItems: "flex-start", borderBottom: "none" }}>
          <span className="e-h3" style={{ width: "180px", flex: "none" }}>Activation result</span>
          <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "15px" }}>
              "31 to 44 percent" <span className="e-small">· 4 times, every stage</span>
            </span>
          </div>
          <span className="e-badge e-badge-ok">Consistent</span>{" "}<button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label="Edit">Edit</button>
        </div>
      </section>
      <span className="e-small">Only answers inside this application are compared. Tailoring for a different company is fine.</span>
    </AppShell>
  );
}
