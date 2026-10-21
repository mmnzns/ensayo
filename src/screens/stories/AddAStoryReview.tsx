// Draft generated from Design/screens/html/5-3-add-a-story-review.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";

export default function AddAStoryReview() {
  return (
    <AppShell nav="stories">
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <Link to="5-2-add-a-story-paste" className="e-small" style={{ textDecoration: "none" }}>‹ Back to your text</Link>
          <h1 className="e-h1">Check what Ensayo found</h1>
          <span className="e-meta">Edit anything. Two parts are missing; you can fill them now or later.</span>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link to="5-1-stories" className="e-btn e-btn-soft">Save</Link>
          <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-primary">Save and practice</Link>
        </div>
      </header>
      <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
          <div className="e-field">
            <label htmlFor="t">Title</label>
            <input id="t" className="e-input" defaultValue="Deliverability rescue" />
          </div>
          <div className="e-field">
            <label htmlFor="c">Company</label>
            <input id="c" className="e-input" defaultValue="Brightwave" />
          </div>
        </div>
        <div className="e-field">
          <label htmlFor="h">
            Headline <span style={{ fontWeight: "400", color: "var(--e-muted)" }}>· the first sentence you'd say</span>
          </label>
          <textarea id="h" className="e-input" rows={2} defaultValue={"I got newsletter opens from 21 back to 36 percent by fixing our sender reputation, not the subject lines."} />
        </div>
        <div className="e-field">
          <label htmlFor="ctx">What was going on</label>
          <textarea id="ctx" className="e-input" rows={2} defaultValue={"Newsletter opens dropped from 38 to 21 percent in a month. The team blamed subject lines and kept testing copy."} />
        </div>
        <div className="e-field" style={{ background: "var(--e-highlight)", borderRadius: "16px", padding: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <label htmlFor="ap" style={{ flex: "1" }}>What you noticed and decided</label>
            <span className="e-badge" style={{ background: "#FFFFFF" }}>Missing</span>
          </div>
          <span className="e-meta" style={{ color: "var(--e-warn-ink)" }}>Your text says what you did, not why. What did you see that the team missed, and why did you pick that fix? Ensayo won't guess this for you.</span>
          <textarea id="ap" className="e-input" rows={2} placeholder="I noticed... so I decided... and I picked ... to prove it." defaultValue={""} />
        </div>
        <div className="e-field">
          <label htmlFor="ac">What you did</label>
          <textarea id="ac" className="e-input" rows={2} defaultValue={"I moved us to a dedicated IP, set up a warmup, cleaned 40,000 inactive addresses and fixed DMARC."} />
        </div>
        <div className="e-field" style={{ border: "1.5px dashed #D5DAE3", borderRadius: "16px", padding: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <label htmlFor="ow" style={{ flex: "1" }}>What you owned</label>
            <span className="e-badge">Missing</span>
          </div>
          <input id="ow" className="e-input" placeholder="What was yours, and who else helped?" />
        </div>
        <div className="e-field">
          <label htmlFor="r">What changed</label>
          <textarea id="r" className="e-input" rows={2} defaultValue={"Sender score went from 62 to 94 in six weeks, and opens came back to 36 percent."} />
        </div>
      </section>
      <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingBottom: "6px" }}>
          <span className="e-h3">Numbers</span>
          <span className="e-small">All found in your text</span>
        </div>
        <div className="e-rowline" style={{ padding: "12px 0" }}>
          <span style={{ flex: "1" }}>Sender score</span>
          <span className="e-meta" style={{ width: "120px" }}>62 → 94</span>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
            <input type="checkbox" className="e-check" />Checked
          </label>
        </div>
        <div className="e-rowline" style={{ padding: "12px 0" }}>
          <span style={{ flex: "1" }}>Newsletter open rate</span>
          <span className="e-meta" style={{ width: "120px" }}>21% → 36%</span>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
            <input type="checkbox" className="e-check" />Checked
          </label>
        </div>
        <div className="e-rowline" style={{ padding: "12px 0", borderBottom: "none" }}>
          <span style={{ flex: "1" }}>Inactive addresses removed</span>
          <span className="e-meta" style={{ width: "120px" }}>40,000</span>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
            <input type="checkbox" className="e-check" />Checked
          </label>
        </div>
        <span className="e-small">Tick each once you're sure it's right. Ensayo will flag it if you ever say a different number.</span>
      </section>
      <section className="e-card" style={{ display: "flex", flexWrap: "wrap", gap: "24px" }}>
        <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <span className="e-h3">Good for questions about</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <span className="e-chip e-chip-on">Fixing what's broken</span>
            <span className="e-chip e-chip-on">Finding the real problem</span>
            <span className="e-chip">+ Add</span>
          </div>
        </div>
        <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <span className="e-h3">Likely follow-ups</span>
          <span className="e-meta">"How did you know it wasn't the subject lines?" · Sender score had dropped to 62.</span>
        </div>
      </section>
    </AppShell>
  );
}
