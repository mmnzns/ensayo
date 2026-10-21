// Draft generated from Design/screens/html/5-4-story.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";

export default function Story() {
  return (
    <AppShell nav="stories">
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <Link to="5-1-stories" className="e-small" style={{ textDecoration: "none" }}>‹ Stories</Link>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h1 className="e-h1">Onboarding drop-off</h1>
            <span className="e-badge e-badge-ok">Verified</span>
          </div>
          <span className="e-meta">Fernhill · 2025</span>
        </div>
        <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-primary">Practice this story</Link>
      </header>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>
        <section className="e-card" style={{ flex: "999 1 520px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
          <div className="e-field">
            <label htmlFor="h">Headline</label>
            <textarea id="h" className="e-input" rows={2} defaultValue={"I moved seven-day activation from 31 to 44 percent by fixing what happened after signup, not the emails."} />
          </div>
          <div className="e-field">
            <label htmlFor="ctx">What was going on</label>
            <textarea id="ctx" className="e-input" rows={2} defaultValue={"Seven-day activation at Fernhill had been flat for two quarters. Everyone assumed the welcome emails were the problem."} />
          </div>
          <div className="e-field">
            <label htmlFor="ap">What you noticed and decided</label>
            <textarea id="ap" className="e-input" rows={3} defaultValue={"I traced the funnel and saw people opened and clicked the emails, then stalled on the bank-linking screen. I decided the fix was the handoff from email to that screen, and I chose seven-day activation as the number to prove it."} />
          </div>
          <div className="e-field">
            <label htmlFor="ac">What you did</label>
            <textarea id="ac" className="e-input" rows={3} defaultValue={"I rebuilt the trigger so the email fired when someone stalled on that step instead of on day two. I worked with the product designer to cut the bank-linking screen from three steps to one."} />
          </div>
          <div className="e-field">
            <label htmlFor="ow">What you owned</label>
            <textarea id="ow" className="e-input" rows={2} defaultValue={"The diagnosis, the trigger rebuild and the metric. The product designer owned the screen redesign."} />
          </div>
          <div className="e-field">
            <label htmlFor="r">What changed</label>
            <textarea id="r" className="e-input" rows={2} defaultValue={"Within a quarter, seven-day activation went from 31 to 44 percent."} />
          </div>
          <div className="e-field">
            <label htmlFor="sc">Scale</label>
            <input id="sc" className="e-input" defaultValue="About 40,000 new signups a quarter" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "14px", fontWeight: "600" }}>Numbers</span>
            <div className="e-rowline" style={{ padding: "12px 0" }}>
              <span style={{ flex: "1" }}>Seven-day activation</span>
              <span className="e-meta" style={{ width: "120px" }}>31% → 44%</span>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
                <input type="checkbox" className="e-check" defaultChecked />Checked
              </label>
            </div>
            <div className="e-rowline" style={{ padding: "12px 0" }}>
              <span style={{ flex: "1" }}>Bank-linking steps</span>
              <span className="e-meta" style={{ width: "120px" }}>3 → 1</span>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
                <input type="checkbox" className="e-check" defaultChecked />Checked
              </label>
            </div>
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" style={{ alignSelf: "flex-start" }}>+ Add a number</button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", borderTop: "1px solid var(--e-line)", paddingTop: "16px" }}>
            <button type="button" className="e-btn e-btn-danger e-btn-sm">Delete story</button>
            <button type="button" className="e-btn e-btn-soft e-btn-sm">Save changes</button>
          </div>
        </section>
        <aside style={{ flex: "1 1 320px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <span className="e-label">How you've told it</span>
            <div style={{ display: "flex", gap: "20px" }}>
              <div>
                <div className="e-h2">9</div>
                <span className="e-small">times practiced</span>
              </div>
              <div>
                <div className="e-h2">8 of 9</div>
                <span className="e-small">said the number</span>
              </div>
            </div>
            <div className="e-soft" style={{ background: "var(--e-highlight)", padding: "14px 16px" }}>
              <span className="e-meta" style={{ color: "var(--e-warn-ink)" }}>Last Tuesday you said 45 percent. Your story says 44.</span>
            </div>
          </section>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <span className="e-label">Fits questions like</span>
            <span className="e-meta">Tell me about a time you improved a metric.</span>
            <span className="e-meta">Tell me about a problem everyone had misread.</span>
            <span className="e-meta">How do you decide what to fix first?</span>
          </section>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span className="e-label" style={{ paddingBottom: "6px" }}>Ready for follow-ups</span>
            <div style={{ padding: "10px 0", borderBottom: "1px solid var(--e-line)", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="e-h3" style={{ fontSize: "15px" }}>Data</span>
              <span className="e-meta">"How did you know it was bank linking?" Funnel by step: clicks held, linking dropped.</span>
            </div>
            <div style={{ padding: "10px 0", borderBottom: "1px solid var(--e-line)", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="e-h3" style={{ fontSize: "15px" }}>What went wrong</span>
              <span className="e-meta">"What didn't work?" First trigger fired mid-flow; moved it to 20 minutes after stalling.</span>
            </div>
            <div style={{ padding: "10px 0", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="e-h3" style={{ fontSize: "15px" }}>Pushback</span>
              <span className="e-meta">
                Not written yet. <a href="#">Add it</a>
              </span>
            </div>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
