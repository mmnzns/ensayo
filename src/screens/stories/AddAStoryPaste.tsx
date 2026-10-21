import { useState } from "react";
import { useStore } from "../../data/store";
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import { go } from "../../ui/router";
import { pasteDraft, setBlankReview } from "./selection";

export default function AddAStoryPaste() {
  const { pasteSample } = useStore().screens.stories;
  const [raw, setRaw] = useState(pasteDraft.raw ?? pasteSample);
  const [company, setCompany] = useState(pasteDraft.company);
  const empty = raw.trim() === "";

  const readIt = () => {
    if (empty) return;
    pasteDraft.raw = raw;
    pasteDraft.company = company;
    setBlankReview(false);
    go("5-3-add-a-story-review");
  };
  const startBlank = () => {
    setBlankReview(true);
    go("5-3-add-a-story-review");
  };

  return (
    <AppShell nav="stories">
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <Link to="5-1-stories" className="e-small" style={{ textDecoration: "none" }}>‹ Stories</Link>
        <h1 className="e-h1">Add a story</h1>
      </div>
      <div style={{ display: "flex", gap: "6px", background: "var(--e-surface)", borderRadius: "14px", padding: "4px", boxShadow: "var(--e-shadow)", alignSelf: "flex-start" }} role="tablist">
        <button type="button" role="tab" aria-selected="true" className="e-btn e-btn-sm" style={{ background: "var(--e-tint)", color: "var(--e-ink)" }}>Paste it</button>
        <button type="button" role="tab" aria-selected="false" className="e-btn e-btn-sm e-btn-ghost" onClick={startBlank}>Start blank</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>
        <section className="e-card" style={{ flex: "999 1 520px", minWidth: "0", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="e-field">
            <label htmlFor="raw">Your story, any format</label>
            <textarea id="raw" className="e-input" rows={11} value={raw} onChange={(e) => setRaw(e.target.value)} />
          </div>
          <div className="e-field" style={{ maxWidth: "320px" }}>
            <label htmlFor="emp">
              Company <span style={{ fontWeight: "400", color: "var(--e-muted)" }}>(if it's not in the text)</span>
            </label>
            <input id="emp" className="e-input" placeholder="e.g. Brightwave" value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button type="button" className="e-btn e-btn-primary" onClick={readIt} disabled={empty} style={empty ? { opacity: 0.5, cursor: "not-allowed" } : undefined}>Read it</button>
            <Link to="5-1-stories" className="e-btn e-btn-ghost">Cancel</Link>
            {empty && <span className="e-small">Paste something first, or start blank.</span>}
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
