import { useState } from "react";
import { storyGaps, useStore } from "../../data/store";
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import { priorityFor } from "./angles";
import { filterStories, firstUncovered, usageText } from "./helpers";
import { chooseStory } from "./selection";

export default function Stories() {
  const store = useStore();
  const { stories, methods, applications } = store;
  const { filters, gapNeed } = store.screens.stories;
  const [filterId, setFilterId] = useState(filters[0]?.id ?? "all");
  const shown = filterStories(stories, filters.find((f) => f.id === filterId));
  const gap = firstUncovered(applications);
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
          <Link to="5-1-stories" role="tab" aria-selected="true" className="e-btn e-btn-sm" style={{ background: "var(--e-tint)", color: "var(--e-ink)" }}>Stories · {stories.length}</Link>
          <Link to="5-5-methods" role="tab" aria-selected="false" className="e-btn e-btn-sm e-btn-ghost">How you work · {methods.length}</Link>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {filters.map((f) => (
            <button key={f.id} type="button" className={f.id === filterId ? "e-chip e-chip-on" : "e-chip"} aria-pressed={f.id === filterId} onClick={() => setFilterId(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "16px" }}>
        {shown.map((s) => {
          const gaps = storyGaps(s);
          const here = priorityFor(store.activeTarget, s.id);
          return (
            <Link key={s.id} to="5-4-story" onClick={() => chooseStory(s.id)} className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px", textDecoration: "none", color: "var(--e-ink)", ...(here === "hide" ? { opacity: 0.65 } : {}) }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                <span className="e-small">{s.employer}</span>
                <span style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "6px" }}>
                  {here === "pin" && <span className="e-badge" title={`Pinned for ${store.activeTarget?.name}`} style={{ background: "var(--e-tint)", color: "var(--e-primary-dark)" }}>Pinned</span>}
                  {here === "hide" && <span className="e-badge" title={`Hidden for ${store.activeTarget?.name}`}>Hidden</span>}
                  {gaps.length > 0 ? gaps.map((g) => <span key={g} className="e-badge">{g}</span>) : s.verified ? <span className="e-badge e-badge-ok">Verified</span> : null}
                </span>
              </div>
              <span className="e-h3">{s.title}</span>
              {s.headline && <span className="e-pill" style={{ alignSelf: "flex-start", fontWeight: "600", ...(s.headline.includes("→") ? { background: "var(--e-tint)", color: "var(--e-primary-dark)" } : { background: "var(--e-ground)" }) }}>{s.headline}</span>}
              <span className="e-small" style={{ marginTop: "auto" }}>{usageText(s.usage)}</span>
            </Link>
          );
        })}
        {shown.length === 0 && (
          <span className="e-meta" style={{ gridColumn: "1 / -1" }}>
            {stories.length === 0 ? "No stories yet. Add one and it will show up here." : "No stories match this filter."}
          </span>
        )}
      </div>
      {gap && (
        <div className="e-soft" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "14px" }}>
          <span className="e-meta" style={{ flex: "1 1 380px" }}>{gap.company} will want {gapNeed}. None of yours fits yet.</span>
          <Link to="6-3-application-overview" className="e-btn e-btn-white e-btn-sm">See what they need</Link>
        </div>
      )}
    </AppShell>
  );
}
