// Draft generated from Design/screens/html/5-1-stories.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";

export default function Stories() {
  return (
    <AppShell nav="stories">
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <h1 className="e-h1">Stories</h1>
          <span className="e-meta">The work you'll talk about. Ensayo uses these to check your numbers and pick follow-ups.</span>
        </div>
        <Link to="5-2-add-a-story-paste" className="e-btn e-btn-primary">+ Add a story</Link>
      </header>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
        <div style={{ display: "flex", gap: "6px", background: "var(--e-surface)", borderRadius: "14px", padding: "4px", boxShadow: "var(--e-shadow)" }} role="tablist">
          <Link to="5-1-stories" role="tab" aria-selected="true" className="e-btn e-btn-sm" style={{ background: "var(--e-tint)", color: "var(--e-ink)" }}>Stories · 6</Link>
          <Link to="5-5-methods" role="tab" aria-selected="false" className="e-btn e-btn-sm e-btn-ghost">How you work · 6</Link>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <button type="button" className="e-chip e-chip-on" aria-pressed="true">All</button>
          <button type="button" className="e-chip">Improving a metric</button>
          <button type="button" className="e-chip">Leading people</button>
          <button type="button" className="e-chip">Disagreement</button>
          <button type="button" className="e-chip">Has gaps</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "16px" }}>
        <Link to="5-4-story" className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px", textDecoration: "none", color: "var(--e-ink)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
            <span className="e-small">Fernhill</span>
            <span className="e-badge e-badge-ok">Verified</span>
          </div>
          <span className="e-h3">Onboarding drop-off</span>
          <span className="e-pill" style={{ alignSelf: "flex-start", background: "var(--e-tint)", color: "var(--e-primary-dark)", fontWeight: "600" }}>7-day activation 31% → 44%</span>
          <span className="e-small" style={{ marginTop: "auto" }}>Practiced 9 times · fits 5 questions</span>
        </Link>
        <Link to="5-4-story" className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px", textDecoration: "none", color: "var(--e-ink)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
            <span className="e-small">Fernhill</span>
            <span className="e-badge e-badge-ok">Verified</span>
          </div>
          <span className="e-h3">Reactivation program</span>
          <span className="e-pill" style={{ alignSelf: "flex-start", background: "var(--e-tint)", color: "var(--e-primary-dark)", fontWeight: "600" }}>Reactivation 2.1% → 4.8%</span>
          <span className="e-small" style={{ marginTop: "auto" }}>Practiced 4 times · fits 4 questions</span>
        </Link>
        <Link to="5-4-story" className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px", textDecoration: "none", color: "var(--e-ink)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
            <span className="e-small">Brightwave</span>
            <span className="e-badge">No strategy yet</span>
          </div>
          <span className="e-h3">Deliverability rescue</span>
          <span className="e-pill" style={{ alignSelf: "flex-start", background: "var(--e-tint)", color: "var(--e-primary-dark)", fontWeight: "600" }}>Sender score 62 → 94</span>
          <span className="e-small" style={{ marginTop: "auto" }}>Practiced 2 times · fits 3 questions</span>
        </Link>
        <Link to="5-4-story" className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px", textDecoration: "none", color: "var(--e-ink)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
            <span className="e-small">Brightwave</span>
            <span className="e-badge">Numbers not checked</span>
          </div>
          <span className="e-h3">Pricing page test</span>
          <span className="e-pill" style={{ alignSelf: "flex-start", background: "var(--e-ground)", fontWeight: "600" }}>Trial starts up 18%</span>
          <span className="e-small" style={{ marginTop: "auto" }}>Practiced once · fits 2 questions</span>
        </Link>
        <Link to="5-4-story" className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px", textDecoration: "none", color: "var(--e-ink)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
            <span className="e-small">Fernhill</span>
            <span className="e-badge">No number</span>
          </div>
          <span className="e-h3">Growing the lifecycle team</span>
          <span className="e-pill" style={{ alignSelf: "flex-start", background: "var(--e-ground)", fontWeight: "600" }}>2 to 6 people</span>
          <span className="e-small" style={{ marginTop: "auto" }}>Not practiced yet · fits 3 questions</span>
        </Link>
        <Link to="5-4-story" className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px", textDecoration: "none", color: "var(--e-ink)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
            <span className="e-small">Brightwave</span>
            <span className="e-badge">No strategy yet</span>
          </div>
          <span className="e-h3">Pushing back on a launch date</span>
          <span className="e-pill" style={{ alignSelf: "flex-start", background: "var(--e-ground)", fontWeight: "600" }}>Launch held 2 weeks</span>
          <span className="e-small" style={{ marginTop: "auto" }}>Practiced 3 times · fits 2 questions</span>
        </Link>
      </div>
      <div className="e-soft" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "14px" }}>
        <span className="e-meta" style={{ flex: "1 1 380px" }}>Kestrel Pay will want a story about owning a number end to end without an ops team. None of yours fits yet.</span>
        <Link to="6-3-application-overview" className="e-btn e-btn-white e-btn-sm">See what they need</Link>
      </div>
    </AppShell>
  );
}
