import { useState } from "react";
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import { useStore } from "../../data/store";
import type { Application } from "../../data/types";
import { AppHeader, AppTabs, withFeatured, type Featured } from "./parts";

type Analysis = NonNullable<Application["analysis"]>;

const editInput = { minHeight: "40px", padding: "8px 10px", fontSize: "15px" } as const;

function Overview({ app, now }: Featured) {
  const store = useStore();
  const [analysis, setAnalysis] = useState<Analysis | null>(app.analysis);
  const [editNeeds, setEditNeeds] = useState(false);
  const [editBeliefs, setEditBeliefs] = useState(false);

  const stories = store.stories;
  const patch = (fn: (a: Analysis) => Analysis) => setAnalysis((a) => (a ? fn(a) : a));

  return (
    <AppShell nav="applications">
      <AppHeader app={app} now={now} />
      <AppTabs current="overview" />
      {!analysis && (
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start" }}>
          <span className="e-h2">Nothing read from the posting yet</span>
          <span className="e-meta">Paste the job posting and Ensayo will list what they likely need, the three things they must believe about you, and the gaps.</span>
          <Link to="6-4-application-edit-details" className="e-btn e-btn-line">Add the posting</Link>
        </section>
      )}
      {analysis && (
        <>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "12px" }}>
              <span className="e-h2">What they likely need</span>
              <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {editNeeds ? (
                  <input className="e-input" style={{ ...editInput, width: "320px", fontSize: "14px" }} aria-label="Summary" value={analysis.summary} onChange={(e) => patch((a) => ({ ...a, summary: e.target.value }))} />
                ) : (
                  <span className="e-small">{analysis.summary}</span>
                )}
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label={editNeeds ? "Done editing what they likely need" : "Edit what they likely need"} onClick={() => setEditNeeds(!editNeeds)}>
                  {editNeeds ? "Done" : "Edit"}
                </button>
              </span>
            </div>
            {analysis.priorities.length === 0 && <span className="e-meta">No priorities read yet.</span>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
              {analysis.priorities.map((p, i) => (
                <div key={i} className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {editNeeds ? (
                    <>
                      <input className="e-input" style={{ ...editInput, fontWeight: 600 }} aria-label={`Priority ${i + 1} title`} value={p.title} onChange={(e) => patch((a) => ({ ...a, priorities: a.priorities.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) }))} />
                      <textarea className="e-input" rows={3} style={{ fontSize: "14px" }} aria-label={`Priority ${i + 1} detail`} value={p.detail} onChange={(e) => patch((a) => ({ ...a, priorities: a.priorities.map((x, j) => (j === i ? { ...x, detail: e.target.value } : x)) }))} />
                    </>
                  ) : (
                    <>
                      <span className="e-h3">{p.title}</span>
                      <span className="e-meta">{p.detail}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingBottom: "8px" }}>
              <span className="e-h2">Three things they need to believe about you</span>
              <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label={editBeliefs ? "Done editing beliefs" : "Edit beliefs"} onClick={() => setEditBeliefs(!editBeliefs)}>
                {editBeliefs ? "Done" : "Edit"}
              </button>
            </div>
            {analysis.beliefs.length === 0 && <span className="e-meta">Nothing to show until the posting is read.</span>}
            {analysis.beliefs.map((b, i) => {
              const story = b.storyId ? stories.find((s) => s.id === b.storyId) : undefined;
              const covered = b.covered && !!b.storyId;
              return (
                <div key={i} className="e-rowline" style={{ alignItems: "flex-start", ...(i === analysis.beliefs.length - 1 ? { borderBottom: "none" } : {}) }}>
                  <span className="e-h2" style={{ width: "28px", color: "var(--e-muted)" }}>{i + 1}</span>
                  <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "6px" }}>
                    {editBeliefs ? (
                      <input className="e-input" style={editInput} aria-label={`Belief ${i + 1}`} value={b.text} onChange={(e) => patch((a) => ({ ...a, beliefs: a.beliefs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) }))} />
                    ) : (
                      <span className="e-h3">{b.text}</span>
                    )}
                    <span className="e-meta">{covered ? (b.story || (story ? `${story.title} · ${story.headline}` : "")) : (b.why ?? "None of your stories shows this yet.")}</span>
                  </div>
                  {covered ? (
                    <>
                      <span className="e-badge e-badge-ok">Covered</span>{" "}<Link to="5-4-story" className="e-btn e-btn-ghost e-btn-sm">Open</Link>
                    </>
                  ) : (
                    <>
                      <span className="e-badge">No story yet</span>{" "}<Link to="5-2-add-a-story-paste" className="e-btn e-btn-line e-btn-sm">Add one</Link>
                    </>
                  )}
                </div>
              );
            })}
          </section>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "20px" }}>
            <section className="e-card" style={{ flex: "1 1 380px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <span className="e-h3">They ask for, and your stories don't mention</span>
              {analysis.gaps.length === 0 && <span className="e-meta">Nothing missing. Your stories cover what the posting asks for.</span>}
              {analysis.gaps.map((g, i) => (
                <div key={i} className="e-rowline" style={{ padding: "10px 0", ...(i === analysis.gaps.length - 1 ? { borderBottom: "none" } : {}) }}>
                  <span style={{ flex: "1" }}>{g}</span>
                  <Link to="2-3-start-a-session" className="e-small" style={{ textDecoration: "none" }}>practice the gap question</Link>
                </div>
              ))}
            </section>
            <section className="e-card" style={{ flex: "1 1 380px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <span className="e-h3">Their words, worth echoing</span>
              {analysis.echo.length === 0 && <span className="e-meta">No phrases picked out yet.</span>}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {analysis.echo.map((e, i) => (
                  <span key={i} className="e-pill" style={{ background: "var(--e-ground)", color: "var(--e-ink)" }}>{e}</span>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </AppShell>
  );
}

export default withFeatured(Overview);
