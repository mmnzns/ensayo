import { useState } from "react";
import { plainError } from "../../data/actions";
import { useActions } from "../../data/real";
import { useHashParam } from "../../data/selection";
import { storyGaps, useStore } from "../../data/store";
import { priorityFor, addStress, angleTargets, anglesToSave, branchChoices, checkAngleNumbers, draftAngle, numberList, numberProblem, removeStress } from "./angles";
import type { Story, StoryAngle, Target } from "../../data/types";
import { TargetMark } from "../applications/TargetMark";
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import { chosenStory } from "./selection";
import StoryTabs from "./StoryTabs";

export default function StoryAngles() {
  const store = useStore();
  const named = useHashParam("story");
  const story = store.stories.find((s) => s.id === (named ?? chosenStory())) ?? store.stories[0];
  if (!story) {
    return (
      <AppShell nav="stories">
        <Link to="5-1-stories" className="e-small" style={{ textDecoration: "none" }}>‹ Stories</Link>
        <h1 className="e-h1">No story to show</h1>
        <span className="e-meta">Add a story and its angles will open here.</span>
      </AppShell>
    );
  }
  return <Angles key={story.id} story={story} />;
}

/** The practiced count for one target, when the data says it. Totals are not split by target yet. */
const practicedFor = (story: Story, targetId: string): number | undefined => (story.usage as { byTarget?: Record<string, number> }).byTarget?.[targetId];

const times = (n: number) => (n === 1 ? "practiced once" : `practiced ${n} times`);

function Angles({ story }: { story: Story }) {
  const store = useStore();
  const actions = useActions();
  const live = angleTargets(store.targets);
  const [cards, setCards] = useState<Record<string, StoryAngle>>(() => Object.fromEntries(live.map((t) => [t.id, draftAngle(story, t.id)])));
  const [adding, setAdding] = useState<string | null>(null);
  const [tag, setTag] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pinError, setPinError] = useState("");

  const gaps = storyGaps(story);
  const cardOf = (id: string): StoryAngle => cards[id] ?? draftAngle(story, id);
  const checks = Object.fromEntries(live.map((t) => [t.id, checkAngleNumbers(cardOf(t.id).headline, story.proof_points)]));
  const problems = live.filter((t) => !checks[t.id].ok).map((t) => numberProblem(t.name, checks[t.id]));
  const patch = (id: string, p: Partial<StoryAngle>) => {
    setCards((c) => ({ ...c, [id]: { ...(c[id] ?? draftAngle(story, id)), ...p } }));
    setSaved(false);
    setError("");
  };
  const choices = branchChoices(story.branches);

  const save = async () => {
    if (problems.length > 0) return;
    setBusy(true);
    setError("");
    try {
      await actions.saveStory({ ...story, angles: anglesToSave(story, live.map((t) => cardOf(t.id)), store.targets) });
      setSaved(true);
    } catch (e) {
      setSaved(false);
      setError(plainError(e));
    } finally {
      setBusy(false);
    }
  };

  const prioritise = async (target: Target, priority: "pin" | "hide" | "none") => {
    setPinError("");
    try {
      await actions.setStoryPriority(target.id, story.id, priority);
    } catch (e) {
      setPinError(plainError(e));
    }
  };

  const commitTag = (id: string) => {
    patch(id, { emphasis: addStress(cardOf(id).emphasis, tag) });
    setTag("");
    setAdding(null);
  };

  const numbers = numberList(story);

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
      <StoryTabs story={story} current="angles" />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>
        <div style={{ flex: "999 1 520px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
          <p className="e-body" style={{ margin: 0, color: "var(--e-muted)" }}>
            Same story, a different way in. An angle changes how you open and what you stress for each target. <strong style={{ color: "var(--e-ink)" }}>It never changes the numbers.</strong>
          </p>
          {live.map((t) => {
            const a = cardOf(t.id);
            const c = checks[t.id];
            const here = priorityFor(t, story.id);
            const hasSaved = !!story.angles?.some((x) => x.target_id === t.id && x.headline.trim());
            const n = practicedFor(story, t.id);
            return (
              <section key={t.id} className="e-card" style={{ display: "flex", flexDirection: "column", gap: "16px" }} aria-label={`Angle for ${t.name}`}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
                  <TargetMark target={t} size={12} />
                  <span className="e-h2">{t.name}</span>
                  {here === "pin" && <span className="e-badge" style={{ background: "var(--e-tint)", color: "var(--e-primary-dark)" }}>Pinned here</span>}
                  {here === "hide" && <span className="e-badge">Hidden here</span>}
                  <span style={{ flex: "1" }} />
                  {n !== undefined && <span className="e-small">{times(n)}</span>}
                  {here !== "pin" && <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => void prioritise(t, "pin")}>Pin here</button>}
                  {here !== "hide" && <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => void prioritise(t, "hide")}>Hide here</button>}
                  {here !== "none" && <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => void prioritise(t, "none")}>{here === "pin" ? "Unpin" : "Show again"}</button>}
                </div>
                {!hasSaved && !a.headline.trim() && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span className="e-label">No angle yet</span>
                    <span className="e-meta">Targets without an angle use the story's own headline.</span>
                  </div>
                )}
                <div className="e-field">
                  <label htmlFor={`op-${t.id}`}>Opening sentence</label>
                  <textarea id={`op-${t.id}`} className="e-input" rows={2} placeholder={story.direct_answer} value={a.headline} aria-invalid={!c.ok} onChange={(e) => patch(t.id, { headline: e.target.value })} />
                  {a.headline.trim() === "" ? (
                    <span className="e-small">Leave it empty to use the story's own headline.</span>
                  ) : c.ok ? (
                    <span className="e-meta" style={{ color: "var(--e-ok)" }}>Numbers match the story</span>
                  ) : (
                    <span className="e-meta" role="alert" style={{ color: "var(--e-warn-ink)" }}>{numberProblem(t.name, c)}</span>
                  )}
                </div>
                <div className="e-field">
                  <span style={{ fontSize: "14px", fontWeight: "600" }}>Stress</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {a.emphasis.map((e) => (
                      <button key={e} type="button" className="e-chip e-chip-on" aria-pressed="true" title="Take this out" style={{ minHeight: "36px", padding: "6px 14px", fontSize: "14px" }} onClick={() => patch(t.id, { emphasis: removeStress(a.emphasis, e) })}>
                        {e}
                      </button>
                    ))}
                    {adding === t.id ? (
                      <span style={{ display: "inline-flex", gap: "6px" }}>
                        <input
                          className="e-input"
                          aria-label={`Add something to stress for ${t.name}`}
                          autoFocus
                          style={{ minHeight: "36px", padding: "6px 12px", fontSize: "14px", width: "180px" }}
                          value={tag}
                          onChange={(e) => setTag(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitTag(t.id);
                            }
                            if (e.key === "Escape") {
                              setAdding(null);
                              setTag("");
                            }
                          }}
                        />
                        <button type="button" className="e-chip" style={{ minHeight: "36px", padding: "6px 14px", fontSize: "14px" }} onClick={() => commitTag(t.id)}>Add</button>
                      </span>
                    ) : (
                      <button type="button" className="e-chip" style={{ minHeight: "36px", padding: "6px 14px", fontSize: "14px" }} onClick={() => { setAdding(t.id); setTag(""); }}>+ Add</button>
                    )}
                  </div>
                </div>
                <div className="e-field">
                  <label htmlFor={`lb-${t.id}`}>Be ready to go deeper on</label>
                  <select id={`lb-${t.id}`} className="e-input" value={a.lead_branch ?? ""} onChange={(e) => patch(t.id, { lead_branch: e.target.value || null })}>
                    <option value="">Nothing in particular</option>
                    {choices.map((b) => (
                      <option key={b.value} value={b.value}>{b.label}</option>
                    ))}
                  </select>
                </div>
              </section>
            );
          })}
          {live.length === 0 && <span className="e-meta">Add a target in Settings to give this story an angle for it.</span>}
          {live.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: "12px" }}>
              {pinError && <span role="alert" className="e-small" style={{ color: "var(--e-danger)" }}>{pinError}</span>}
              {error && <span role="alert" className="e-small" style={{ color: "var(--e-danger)" }}>{error}</span>}
              {saved && <span className="e-small" role="status">Saved</span>}
              {problems.length > 0 && <span className="e-small" style={{ color: "var(--e-warn-ink)" }}>Fix the numbers above to save.</span>}
              <button type="button" className="e-btn e-btn-soft e-btn-sm" disabled={busy || problems.length > 0} onClick={() => void save()}>{busy ? "Saving" : "Save angles"}</button>
            </div>
          )}
        </div>
        <aside style={{ flex: "1 1 320px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span className="e-label" style={{ paddingBottom: "6px" }}>Numbers · shared by every angle</span>
            {numbers.length === 0 && <span className="e-meta">This story has no numbers yet. Add them on the Story tab.</span>}
            {numbers.map((n, i) => (
              <div key={`${n.label}-${i}`} className="e-rowline" style={{ padding: "12px 0", ...(i === numbers.length - 1 ? { borderBottom: "none" } : {}) }}>
                <span style={{ flex: "1" }}>{n.label}</span>
                <span className="e-meta">{n.value}</span>
                {n.verified && <span style={{ color: "var(--e-ok)" }} aria-label="Checked">✓</span>}
              </div>
            ))}
            <span className="e-small" style={{ paddingTop: "6px" }}>Change numbers on the Story tab. Every angle uses them.</span>
          </section>
          <section className="e-soft" style={{ background: "var(--e-highlight)", display: "flex", flexDirection: "column", gap: "6px" }}>
            <span className="e-h3" style={{ fontSize: "15px", color: "var(--e-warn-ink)" }}>The one rule</span>
            <span className="e-meta" style={{ color: "var(--e-warn-ink)" }}>If an opening sentence uses a number that isn't in this story, Ensayo won't save it and tells you which number.</span>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
