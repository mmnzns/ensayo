// Draft generated from Design/screens/html/6-1-applications.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";

export default function Applications() {
  return (
    <AppShell nav="applications">
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <h1 className="e-h1">Applications</h1>
          <span className="e-meta">Everything you've applied to. Attach the resume you sent, and practice each one stage by stage.</span>
        </div>
        <Link to="6-2-new-application" className="e-btn e-btn-primary">+ Add an application</Link>
      </header>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
        <nav style={{ display: "flex", gap: "6px", background: "var(--e-surface)", borderRadius: "14px", padding: "4px", boxShadow: "var(--e-shadow)" }} aria-label="Filter">
          <Link to="6-1-applications" aria-current="page" className="e-btn e-btn-sm" style={{ background: "var(--e-tint)", color: "var(--e-ink)" }}>Active · 5</Link>
          <Link to="6-1-applications" className="e-btn e-btn-sm e-btn-ghost">Closed · 3</Link>
        </nav>
        <span className="e-small">2 waiting to hear back · 1 interview this week</span>
      </div>
      <Link to="6-3-application-overview" className="e-card" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "20px", textDecoration: "none", color: "var(--e-ink)", boxShadow: "inset 0 0 0 2px var(--e-primary)" }}>
        <div style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <span className="e-label">Next up</span>
          <span className="e-h2">Kestrel Pay · Hiring manager</span>
          <span className="e-meta">Friday 2:00 PM · 9 answers practiced for this stage</span>
        </div>
        <span className="e-badge">In 2 days</span>
        <span className="e-btn e-btn-primary e-btn-sm">Practice this stage</span>
      </Link>
      <section className="e-card" style={{ padding: "8px 28px" }}>
        <div className="e-rowline" style={{ padding: "14px 0" }}>
          <span className="e-label" style={{ flex: "2 1 0" }}>Company</span>
          <span className="e-label" style={{ flex: "1 1 0" }}>Status</span>
          <span className="e-label" style={{ flex: "1.3 1 0" }}>Sent</span>
          <span className="e-label" style={{ flex: "1.5 1 0" }}>Next</span>
          <span className="e-label" style={{ flex: "0.8 1 0", textAlign: "right" }}>Practice</span>
        </div>
        <Link to="6-3-application-overview" className="e-rowline" style={{ padding: "18px 0", textDecoration: "none", color: "var(--e-ink)" }}>
          <span style={{ flex: "2 1 0", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontWeight: "700", fontSize: "16px" }}>
              Kestrel Pay <span className="e-pill" style={{ background: "var(--e-ground)", padding: "3px 10px", fontSize: "12px" }}>Startup</span>
            </span>
            <span className="e-small">Senior Lifecycle Marketing Manager</span>
          </span>
          {" "}
          <span style={{ flex: "1 1 0" }}>
            <span className="e-pill" style={{ background: "var(--e-tint)", color: "var(--e-primary-dark)", fontWeight: "600" }}>Interviewing</span>
          </span>
          {" "}
          <span style={{ flex: "1.3 1 0", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "14px" }}>Applied Oct 6</span>
            <span className="e-small" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                <path d="M14 3v6h6" />
              </svg>
              Resume · Kestrel.pdf
            </span>
          </span>
          {" "}
          <span style={{ flex: "1.5 1 0", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "14px", fontWeight: "600" }}>Hiring manager</span>
            <span className="e-small">Fri, Oct 23 · 2:00 PM</span>
          </span>
          {" "}<span className="e-small" style={{ flex: "0.8 1 0", textAlign: "right" }}>21 answers</span>
        </Link>
        {" "}
        <Link to="6-3-application-overview" className="e-rowline" style={{ padding: "18px 0", textDecoration: "none", color: "var(--e-ink)" }}>
          <span style={{ flex: "2 1 0", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontWeight: "700", fontSize: "16px" }}>Northpine</span>
            <span className="e-small">Head of Lifecycle</span>
          </span>
          {" "}
          <span style={{ flex: "1 1 0" }}>
            <span className="e-pill" style={{ background: "var(--e-tint)", color: "var(--e-primary-dark)", fontWeight: "600" }}>Interviewing</span>
          </span>
          {" "}
          <span style={{ flex: "1.3 1 0", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "14px" }}>Applied Sep 29</span>
            <span className="e-small" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                <path d="M14 3v6h6" />
              </svg>
              Resume · Northpine.pdf
            </span>
          </span>
          {" "}
          <span style={{ flex: "1.5 1 0", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "14px", fontWeight: "600" }}>Technical</span>
            <span className="e-small">Date to come</span>
          </span>
          {" "}<span className="e-small" style={{ flex: "0.8 1 0", textAlign: "right" }}>8 answers</span>
        </Link>
        {" "}
        <Link to="6-3-application-overview" className="e-rowline" style={{ padding: "18px 0", textDecoration: "none", color: "var(--e-ink)" }}>
          <span style={{ flex: "2 1 0", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontWeight: "700", fontSize: "16px" }}>Harbourline Bank</span>
            <span className="e-small">Lifecycle Marketing Manager</span>
          </span>
          {" "}
          <span style={{ flex: "1 1 0" }}>
            <span className="e-pill" style={{ background: "var(--e-highlight)", color: "var(--e-warn-ink)", fontWeight: "600" }}>Screening</span>
          </span>
          {" "}
          <span style={{ flex: "1.3 1 0", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "14px" }}>Applied Oct 12</span>
            <span className="e-small" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                <path d="M14 3v6h6" />
              </svg>
              Resume · Harbourline.docx
            </span>
          </span>
          {" "}
          <span style={{ flex: "1.5 1 0", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "14px", fontWeight: "600" }}>Recruiter</span>
            <span className="e-small">Mon, Oct 26 · 10:00 AM</span>
          </span>
          {" "}<span className="e-small" style={{ flex: "0.8 1 0", textAlign: "right" }}>Not yet</span>
        </Link>
        {" "}
        <Link to="6-3-application-overview" className="e-rowline" style={{ padding: "18px 0", textDecoration: "none", color: "var(--e-ink)" }}>
          <span style={{ flex: "2 1 0", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontWeight: "700", fontSize: "16px" }}>Tidewell</span>
            <span className="e-small">CRM Lead</span>
          </span>
          {" "}
          <span style={{ flex: "1 1 0" }}>
            <span className="e-pill" style={{ background: "var(--e-ground)", color: "var(--e-muted)", fontWeight: "600" }}>Applied</span>
          </span>
          {" "}
          <span style={{ flex: "1.3 1 0", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "14px" }}>Applied Oct 15</span>
            <span className="e-small" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                <path d="M14 3v6h6" />
              </svg>
              Resume · Tidewell.pdf
            </span>
          </span>
          {" "}
          <span style={{ flex: "1.5 1 0", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "14px", fontWeight: "600" }}>Waiting to hear</span>
            <span className="e-small">6 days since you applied</span>
          </span>
          {" "}<span className="e-small" style={{ flex: "0.8 1 0", textAlign: "right" }}>Not yet</span>
        </Link>
        {" "}
        <Link to="6-3-application-overview" className="e-rowline" style={{ padding: "18px 0", textDecoration: "none", color: "var(--e-ink)", borderBottom: "none" }}>
          <span style={{ flex: "2 1 0", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontWeight: "700", fontSize: "16px" }}>Copperleaf</span>
            <span className="e-small">Marketing Ops Manager</span>
          </span>
          {" "}
          <span style={{ flex: "1 1 0" }}>
            <span className="e-pill" style={{ background: "var(--e-ground)", color: "var(--e-muted)", fontWeight: "600" }}>Applied</span>
          </span>
          {" "}
          <span style={{ flex: "1.3 1 0", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "14px" }}>Applied Oct 18</span>
            <span className="e-small" style={{ color: "var(--e-warn-ink)" }}>No resume attached</span>
          </span>
          {" "}
          <span style={{ flex: "1.5 1 0", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "14px", fontWeight: "600" }}>Waiting to hear</span>
            <span className="e-small">Referral from Sam</span>
          </span>
          {" "}<span className="e-small" style={{ flex: "0.8 1 0", textAlign: "right" }}>Not yet</span>
        </Link>
      </section>
    </AppShell>
  );
}
