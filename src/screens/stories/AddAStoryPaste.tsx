// Draft generated from Design/screens/html/5-2-add-a-story-paste.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";

export default function AddAStoryPaste() {
  return (
    <AppShell nav="stories">
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <Link to="5-1-stories" className="e-small" style={{ textDecoration: "none" }}>‹ Stories</Link>
        <h1 className="e-h1">Add a story</h1>
      </div>
      <div style={{ display: "flex", gap: "6px", background: "var(--e-surface)", borderRadius: "14px", padding: "4px", boxShadow: "var(--e-shadow)", alignSelf: "flex-start" }} role="tablist">
        <button type="button" role="tab" aria-selected="true" className="e-btn e-btn-sm" style={{ background: "var(--e-tint)", color: "var(--e-ink)" }}>Paste it</button>
        <button type="button" role="tab" aria-selected="false" className="e-btn e-btn-sm e-btn-ghost">Start blank</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>
        <section className="e-card" style={{ flex: "999 1 520px", minWidth: "0", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="e-field">
            <label htmlFor="raw">Your story, any format</label>
            <textarea id="raw" className="e-input" rows={11} defaultValue={"Brightwave 2024. Newsletter open rates dropped from 38% to 21% over a month, team blamed subject lines and kept testing copy. Sender score had fallen to 62. Moved to a dedicated IP, set up warmup, cleaned 40k inactive addresses, fixed DMARC. Sender score back to 94 in six weeks, opens back to 36%."} />
          </div>
          <div className="e-field" style={{ maxWidth: "320px" }}>
            <label htmlFor="emp">
              Company <span style={{ fontWeight: "400", color: "var(--e-muted)" }}>(if it's not in the text)</span>
            </label>
            <input id="emp" className="e-input" placeholder="e.g. Brightwave" />
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <Link to="5-3-add-a-story-review" className="e-btn e-btn-primary">Read it</Link>
            <Link to="5-1-stories" className="e-btn e-btn-ghost">Cancel</Link>
          </div>
        </section>
        <aside className="e-card" style={{ flex: "1 1 280px", minWidth: "0", display: "flex", flexDirection: "column", gap: "14px" }}>
          <span className="e-h3">What to paste</span>
          <span className="e-meta">Notes, a resume bullet, a line from a performance review, an answer you gave last time. Messy is fine.</span>
          <span className="e-h3">What happens</span>
          <span className="e-meta">Ensayo sorts it into the parts of a good answer and shows you what's missing. You check every field before it saves.</span>
          <div className="e-soft" style={{ padding: "14px 16px" }}>
            <span className="e-meta" style={{ color: "var(--e-ink)" }}>Ensayo never adds a number, result or detail that isn't in your text.</span>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
