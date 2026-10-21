import { useState, type ReactNode } from "react";
import { storyGaps, useStore } from "../../data/store";
import type { Branch, Story as StoryType } from "../../data/types";
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import { go } from "../../ui/router";
import { BRANCH_LABELS, CORE_BRANCHES, numberText } from "./helpers";
import Numbers, { type NumberRow } from "./Numbers";
import { chosenStory } from "./selection";

export default function Story() {
  const store = useStore();
  const story = store.stories.find((s) => s.id === chosenStory()) ?? store.stories[0];
  if (!story) {
    return (
      <AppShell nav="stories">
        <Link to="5-1-stories" className="e-small" style={{ textDecoration: "none" }}>‹ Stories</Link>
        <h1 className="e-h1">No story to show</h1>
        <span className="e-meta">Add a story and it will open here.</span>
      </AppShell>
    );
  }
  // Keyed by story so opening another story starts from that story's own values.
  return <StoryEditor key={story.id} story={story} />;
}

function Field({ id, label, missing, children }: { id: string; label: string; missing?: boolean; children: ReactNode }) {
  return (
    <div className="e-field">
      {missing ? (
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <label htmlFor={id} style={{ flex: "1" }}>{label}</label>
          <span className="e-badge">Missing</span>
        </div>
      ) : (
        <label htmlFor={id}>{label}</label>
      )}
      {children}
    </div>
  );
}

const linkButton = { background: "none", border: "none", padding: "0", font: "inherit", color: "var(--e-primary)", textDecoration: "underline", cursor: "pointer" } as const;

function StoryEditor({ story }: { story: StoryType }) {
  const { screens } = useStore();
  const telling = screens.stories.telling[story.id];

  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [headline, setHeadline] = useState(story.direct_answer);
  const [context, setContext] = useState(story.context);
  const [approach, setApproach] = useState(story.approach);
  const [action, setAction] = useState(story.action);
  const [ownership, setOwnership] = useState(story.ownership);
  const [result, setResult] = useState(story.result);
  const [scale, setScale] = useState(story.scale);
  const [numbers, setNumbers] = useState<NumberRow[]>(story.proof_points.map((p) => ({ id: p.label, label: p.metric, value: numberText(p), checked: p.verified })));
  const [added, setAdded] = useState<Branch[]>([]);
  const [adding, setAdding] = useState<Branch["kind"] | null>(null);
  const [trigger, setTrigger] = useState("");
  const [angle, setAngle] = useState("");

  const edited = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setSaved(false);
  };

  // Gaps and the Verified badge follow what is ticked on this screen.
  const gaps = storyGaps({ ...story, approach, proof_points: numbers.map((n) => ({ label: n.id, metric: n.label, before: "", after: n.value, unit: "", approximate: false, verified: n.checked })) });

  const branches = [...story.branches, ...added];
  const kinds = [...CORE_BRANCHES, ...branches.map((b) => b.kind).filter((k) => !CORE_BRANCHES.includes(k))].filter((k, i, all) => all.indexOf(k) === i) as Branch["kind"][];

  const saveBranch = () => {
    if (adding && trigger.trim()) {
      setAdded([...added, { kind: adding, trigger: trigger.trim(), angle: angle.trim() }]);
      setSaved(false);
    }
    setAdding(null);
    setTrigger("");
    setAngle("");
  };

  return (
    <AppShell nav="stories">
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <Link to="5-1-stories" className="e-small" style={{ textDecoration: "none" }}>‹ Stories</Link>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
            <h1 className="e-h1">{story.title}</h1>
            {gaps.length > 0 ? gaps.map((g) => <span key={g} className="e-badge">{g}</span>) : <span className="e-badge e-badge-ok">Verified</span>}
          </div>
          <span className="e-meta">{story.year ? `${story.employer} · ${story.year}` : story.employer}</span>
        </div>
        <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-primary">Practice this story</Link>
      </header>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>
        <section className="e-card" style={{ flex: "999 1 520px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
          <Field id="h" label="Headline">
            <textarea id="h" className="e-input" rows={2} value={headline} onChange={(e) => edited(setHeadline)(e.target.value)} />
          </Field>
          <Field id="ctx" label="What was going on">
            <textarea id="ctx" className="e-input" rows={2} value={context} onChange={(e) => edited(setContext)(e.target.value)} />
          </Field>
          <Field id="ap" label="What you noticed and decided" missing={approach.trim() === ""}>
            <textarea id="ap" className="e-input" rows={3} placeholder="I noticed... so I decided... and I picked ... to prove it." value={approach} onChange={(e) => edited(setApproach)(e.target.value)} />
          </Field>
          <Field id="ac" label="What you did">
            <textarea id="ac" className="e-input" rows={3} value={action} onChange={(e) => edited(setAction)(e.target.value)} />
          </Field>
          <Field id="ow" label="What you owned" missing={ownership.trim() === ""}>
            <textarea id="ow" className="e-input" rows={2} placeholder="What was yours, and who else helped?" value={ownership} onChange={(e) => edited(setOwnership)(e.target.value)} />
          </Field>
          <Field id="r" label="What changed">
            <textarea id="r" className="e-input" rows={2} value={result} onChange={(e) => edited(setResult)(e.target.value)} />
          </Field>
          <Field id="sc" label="Scale">
            <input id="sc" className="e-input" value={scale} onChange={(e) => edited(setScale)(e.target.value)} />
          </Field>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "14px", fontWeight: "600" }}>Numbers</span>
            <Numbers rows={numbers} setRows={setNumbers} lastBorder onEdit={() => setSaved(false)} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", borderTop: "1px solid var(--e-line)", paddingTop: "16px" }}>
            {confirmDelete ? (
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
                <span className="e-meta" style={{ color: "var(--e-ink)" }}>Delete this story? It can't be undone.</span>
                <button type="button" className="e-btn e-btn-danger e-btn-sm" onClick={() => go("5-1-stories")}>Yes, delete it</button>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setConfirmDelete(false)}>Keep it</button>
              </div>
            ) : (
              <button type="button" className="e-btn e-btn-danger e-btn-sm" onClick={() => setConfirmDelete(true)}>Delete story</button>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {saved && <span className="e-small" role="status">Saved</span>}
              <button type="button" className="e-btn e-btn-soft e-btn-sm" onClick={() => setSaved(true)}>Save changes</button>
            </div>
          </div>
        </section>
        <aside style={{ flex: "1 1 320px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <span className="e-label">How you've told it</span>
            {story.usage.practiced > 0 ? (
              <div style={{ display: "flex", gap: "20px" }}>
                <div>
                  <div className="e-h2">{story.usage.practiced}</div>
                  <span className="e-small">{story.usage.practiced === 1 ? "time practiced" : "times practiced"}</span>
                </div>
                {story.usage.saidNumber !== undefined && (
                  <div>
                    <div className="e-h2">{story.usage.saidNumber} of {story.usage.practiced}</div>
                    <span className="e-small">said the number</span>
                  </div>
                )}
              </div>
            ) : (
              <span className="e-meta">Not practiced yet. Practice it once and this fills in.</span>
            )}
            {telling?.note && (
              <div className="e-soft" style={{ background: "var(--e-highlight)", padding: "14px 16px" }}>
                <span className="e-meta" style={{ color: "var(--e-warn-ink)" }}>{telling.note}</span>
              </div>
            )}
          </section>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <span className="e-label">Fits questions like</span>
            {telling && telling.questions.length > 0 ? telling.questions.map((q) => <span key={q} className="e-meta">{q}</span>) : <span className="e-meta">Questions show up here once you've practiced this story.</span>}
          </section>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span className="e-label" style={{ paddingBottom: "6px" }}>Ready for follow-ups</span>
            {kinds.map((kind, i) => {
              const b = branches.find((x) => x.kind === kind);
              return (
                <div key={kind} style={{ padding: "10px 0", ...(i < kinds.length - 1 ? { borderBottom: "1px solid var(--e-line)" } : {}), display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span className="e-h3" style={{ fontSize: "15px" }}>{BRANCH_LABELS[kind] ?? kind}</span>
                  {b ? (
                    <span className="e-meta">"{b.trigger}"{b.angle ? ` ${b.angle}` : ""}</span>
                  ) : adding === kind ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <input className="e-input" aria-label="What they might ask" placeholder="What they might ask" value={trigger} onChange={(e) => setTrigger(e.target.value)} />
                      <input className="e-input" aria-label="What you would say" placeholder="What you'd point to" value={angle} onChange={(e) => setAngle(e.target.value)} />
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button type="button" className="e-btn e-btn-soft e-btn-sm" onClick={saveBranch}>Add</button>
                        <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => { setAdding(null); setTrigger(""); setAngle(""); }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <span className="e-meta">
                      Not written yet. <button type="button" style={linkButton} onClick={() => { setAdding(kind); setTrigger(""); setAngle(""); }}>Add it</button>
                    </span>
                  )}
                </div>
              );
            })}
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
