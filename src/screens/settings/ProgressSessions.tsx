// Draft generated from Design/screens/html/7-2-progress-sessions.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";

export default function ProgressSessions() {
  return (
    <AppShell nav="progress">
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px" }}>
        <h1 className="e-h1">Progress</h1>
        <div style={{ display: "flex", gap: "6px", background: "var(--e-surface)", borderRadius: "14px", padding: "4px", boxShadow: "var(--e-shadow)" }} role="tablist">
          <Link to="7-1-progress-habits" role="tab" aria-selected="false" className="e-btn e-btn-sm e-btn-ghost">Habits</Link>
          <Link to="7-2-progress-sessions" role="tab" aria-selected="true" className="e-btn e-btn-sm" style={{ background: "var(--e-tint)", color: "var(--e-ink)" }}>Sessions</Link>
        </div>
      </header>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        <button type="button" className="e-chip e-chip-on" aria-pressed="true">All</button>
        <button type="button" className="e-chip">Drill</button>
        <button type="button" className="e-chip">Mock</button>
        <button type="button" className="e-chip">Kestrel Pay</button>
        <button type="button" className="e-chip">Northpine</button>
      </div>
      <span className="e-small">Drill: a note after every answer, with retries. Mock: a full stage run straight through, notes at the end.</span>
      <section className="e-card" style={{ padding: "4px 28px" }}>
        <span className="e-label" style={{ display: "block", padding: "18px 0 4px" }}>This week</span>{" "}
        <Link to="4-3-session-results-drill" className="e-rowline" style={{ textDecoration: "none", color: "var(--e-ink)" }}>
          <span className="e-meta" style={{ width: "120px" }}>Today, 9:12 PM</span>
          <span className="e-pill" style={{ background: "var(--e-ground)", width: "52px", justifyContent: "center" }}>Drill</span>
          <span style={{ flex: "1" }}>Hiring manager · Kestrel Pay</span>
          <span className="e-hand" style={{ fontSize: "17px", color: "var(--e-win)" }}>38s → 9s</span>
          <span className="e-small" style={{ width: "24px" }}>›</span>
        </Link>
        {" "}
        <Link to="4-4-session-results-mock-debrief" className="e-rowline" style={{ textDecoration: "none", color: "var(--e-ink)" }}>
          <span className="e-meta" style={{ width: "120px" }}>Yesterday</span>
          <span className="e-pill" style={{ background: "var(--e-ink)", color: "#FFFFFF", width: "52px", justifyContent: "center" }}>Mock</span>
          <span style={{ flex: "1" }}>Leadership · Kestrel Pay</span>
          <span className="e-hand" style={{ fontSize: "17px" }}>5 of 6 on point</span>
          <span className="e-small" style={{ width: "24px" }}>›</span>
        </Link>
        {" "}
        <Link to="4-3-session-results-drill" className="e-rowline" style={{ textDecoration: "none", color: "var(--e-ink)" }}>
          <span className="e-meta" style={{ width: "120px" }}>Mon, Oct 19</span>
          <span className="e-pill" style={{ background: "var(--e-ground)", width: "52px", justifyContent: "center" }}>Drill</span>
          <span style={{ flex: "1" }}>Recruiter · general questions</span>
          <span className="e-hand" style={{ fontSize: "17px" }}>3 fixes stuck</span>
          <span className="e-small" style={{ width: "24px" }}>›</span>
        </Link>
        {" "}<span className="e-label" style={{ display: "block", padding: "22px 0 4px" }}>Last week</span>{" "}
        <Link to="4-3-session-results-drill" className="e-rowline" style={{ textDecoration: "none", color: "var(--e-ink)" }}>
          <span className="e-meta" style={{ width: "120px" }}>Sat, Oct 17</span>
          <span className="e-pill" style={{ background: "var(--e-ground)", width: "52px", justifyContent: "center" }}>Drill</span>
          <span style={{ flex: "1" }}>Story: Reactivation program</span>
          <span className="e-hand" style={{ fontSize: "17px" }}>said 4.8% every time</span>
          <span className="e-small" style={{ width: "24px" }}>›</span>
        </Link>
        {" "}
        <Link to="4-3-session-results-drill" className="e-rowline" style={{ textDecoration: "none", color: "var(--e-ink)" }}>
          <span className="e-meta" style={{ width: "120px" }}>Thu, Oct 15</span>
          <span className="e-pill" style={{ background: "var(--e-ground)", width: "52px", justifyContent: "center" }}>Drill</span>
          <span style={{ flex: "1" }}>Technical · Northpine</span>
          <span className="e-hand" style={{ fontSize: "17px" }}>2 fixes stuck</span>
          <span className="e-small" style={{ width: "24px" }}>›</span>
        </Link>
        {" "}
        <Link to="4-4-session-results-mock-debrief" className="e-rowline" style={{ textDecoration: "none", color: "var(--e-ink)", borderBottom: "none" }}>
          <span className="e-meta" style={{ width: "120px" }}>Tue, Oct 13</span>
          <span className="e-pill" style={{ background: "var(--e-ink)", color: "#FFFFFF", width: "52px", justifyContent: "center" }}>Mock</span>
          <span style={{ flex: "1" }}>Recruiter · Kestrel Pay</span>
          <span className="e-hand" style={{ fontSize: "17px" }}>4 of 5 on point</span>
          <span className="e-small" style={{ width: "24px" }}>›</span>
        </Link>
      </section>
      <span className="e-small">Recordings are kept for 30 days, then only the text stays. Change this in Settings, Privacy.</span>
    </AppShell>
  );
}
