// Draft generated from Design/screens/html/5-5-methods.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";

export default function Methods() {
  return (
    <AppShell nav="stories">
      <header style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <h1 className="e-h1">Stories</h1>
        <span className="e-meta">"Tell me about a time..." lands best when you open with how you always handle it, then the story as proof.</span>
      </header>
      <div style={{ display: "flex", gap: "6px", background: "var(--e-surface)", borderRadius: "14px", padding: "4px", boxShadow: "var(--e-shadow)", alignSelf: "flex-start" }} role="tablist">
        <Link to="5-1-stories" role="tab" aria-selected="false" className="e-btn e-btn-sm e-btn-ghost">Stories · 6</Link>
        <Link to="5-5-methods" role="tab" aria-selected="true" className="e-btn e-btn-sm" style={{ background: "var(--e-tint)", color: "var(--e-ink)" }}>How you work · 4 of 6</Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <span className="e-label">Solving a problem</span>
          <span className="e-hand" style={{ fontSize: "20px" }}>"Whenever a number stalls, the first thing I do is find where people actually drop, before I change anything."</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            <span className="e-pill" style={{ background: "var(--e-ground)" }}>Onboarding drop-off</span>
            <span className="e-pill" style={{ background: "var(--e-ground)" }}>Deliverability rescue</span>
          </div>
        </section>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <span className="e-label">Handling disagreement</span>
          <span className="e-hand" style={{ fontSize: "20px" }}>"Before I push back, I find out what the other person is protecting. Then I propose a small test instead of asking them to trust me."</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            <span className="e-pill" style={{ background: "var(--e-ground)" }}>Pushing back on a launch date</span>
          </div>
        </section>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <span className="e-label">Getting buy-in</span>
          <span className="e-hand" style={{ fontSize: "20px" }}>"I put the proposal in the terms the decision-maker already cares about, and make it cheap to say yes."</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            <span className="e-pill" style={{ background: "var(--e-ground)" }}>Reactivation program</span>
          </div>
        </section>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <span className="e-label">Serving customers</span>
          <span className="e-hand" style={{ fontSize: "20px" }}>"I fix the urgent thing first, then the process behind it, so it doesn't come back."</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            <span className="e-pill" style={{ background: "var(--e-ground)" }}>Onboarding drop-off</span>
          </div>
        </section>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px", background: "transparent", border: "1.5px dashed var(--e-line)", boxShadow: "none" }}>
          <span className="e-label">Leading a team</span>
          <label htmlFor="m5" className="e-meta">How do you handle this every time? One sentence.</label>
          <textarea id="m5" className="e-input" rows={2} placeholder="When I lead a team, the first thing I do is..." defaultValue={""} />
          <span className="e-small">Story that fits: Growing the lifecycle team</span>
        </section>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px", background: "transparent", border: "1.5px dashed var(--e-line)", boxShadow: "none" }}>
          <span className="e-label">Why this work</span>
          <label htmlFor="m6" className="e-meta">Why this kind of work matters to you, and who it helps.</label>
          <textarea id="m6" className="e-input" rows={2} placeholder="The part I care about most is..." defaultValue={""} />
        </section>
      </div>
    </AppShell>
  );
}
