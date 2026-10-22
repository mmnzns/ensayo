import { useRef, useState } from "react";
import { useActions } from "../../data/real";
import { useStore } from "../../data/store";
import type { Method } from "../../data/types";
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import { chooseStory } from "./selection";

interface Entry {
  /** The sentence as last committed. */
  saved: string;
  /** What is in the box while editing. */
  draft: string;
  editing: boolean;
}

export default function Methods() {
  const { stories, methods, screens } = useStore();
  const { saveMethod } = useActions();
  const [saveFailed, setSaveFailed] = useState(false);
  const { methodPlaceholders } = screens.stories;
  // Set when Escape cancels an edit, so the blur that follows does not commit the text that was just abandoned.
  const skipBlur = useRef(false);
  const [entries, setEntries] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(methods.map((m) => [m.situation, { saved: m.spoken, draft: m.spoken, editing: !m.spoken.trim() }])),
  );
  const entry = (m: Method): Entry => entries[m.situation] ?? { saved: "", draft: "", editing: true };
  const patch = (m: Method, p: Partial<Entry>) => setEntries((es) => ({ ...es, [m.situation]: { ...entry(m), ...p } }));
  const commit = (m: Method) => {
    const text = entry(m).draft.trim();
    patch(m, { saved: text, draft: text, editing: text === "" });
    if (text === entry(m).saved) return;
    saveMethod({ ...m, spoken: text }).then(
      () => setSaveFailed(false),
      () => setSaveFailed(true),
    );
  };
  const cancel = (m: Method) => {
    const e = entry(m);
    patch(m, { draft: e.saved, editing: e.saved.trim() === "" });
  };
  const filled = methods.filter((m) => entry(m).saved.trim()).length;
  const titleOf = (id: string) => stories.find((s) => s.id === id)?.title;

  const storyLink = (id: string, label: string, chip: boolean) => (
    <Link key={id} to="5-4-story" onClick={() => chooseStory(id)} className={chip ? "e-pill" : undefined} style={chip ? { background: "var(--e-ground)", textDecoration: "none", color: "var(--e-ink)" } : { color: "inherit" }}>
      {label}
    </Link>
  );

  return (
    <AppShell nav="stories">
      <header style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <h1 className="e-h1">Stories</h1>
        <span className="e-meta">"Tell me about a time..." lands best when you open with how you always handle it, then the story as proof.</span>
      </header>
      <div style={{ display: "flex", gap: "6px", background: "var(--e-surface)", borderRadius: "14px", padding: "4px", boxShadow: "var(--e-shadow)", alignSelf: "flex-start" }} role="tablist">
        <Link to="5-1-stories" role="tab" aria-selected="false" className="e-btn e-btn-sm e-btn-ghost">Stories · {stories.length}</Link>
        <Link to="5-5-methods" role="tab" aria-selected="true" className="e-btn e-btn-sm" style={{ background: "var(--e-tint)", color: "var(--e-ink)" }}>How you work · {filled} of {methods.length}</Link>
      </div>
      {saveFailed && <span className="e-meta" role="alert" style={{ color: "var(--e-warn-ink)" }}>Ensayo could not save that sentence. Check that your data folder is available, then try again.</span>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
        {methods.map((m) => {
          const e = entry(m);
          const hasSaved = e.saved.trim() !== "";
          const linked = m.storyIds.map((id) => ({ id, title: titleOf(id) })).filter((x): x is { id: string; title: string } => !!x.title);
          const taId = `m-${m.situation}`;
          if (hasSaved && !e.editing) {
            return (
              <section key={m.situation} className="e-card" style={{ position: "relative", display: "flex", flexDirection: "column", gap: "12px" }}>
                <span className="e-label">{m.label}</span>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" style={{ position: "absolute", top: "14px", right: "16px" }} onClick={() => patch(m, { editing: true })}>Edit</button>
                <span className="e-hand" style={{ fontSize: "20px" }}>"{e.saved}"</span>
                {linked.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>{linked.map((x) => storyLink(x.id, x.title, true))}</div>}
              </section>
            );
          }
          return (
            <section key={m.situation} className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px", ...(hasSaved ? {} : { background: "transparent", border: "1.5px dashed var(--e-line)", boxShadow: "none" }) }}>
              <span className="e-label">{m.label}</span>
              <label htmlFor={taId} className="e-meta">{m.prompt}</label>
              <textarea
                id={taId}
                className="e-input"
                rows={2}
                placeholder={methodPlaceholders[m.situation] ?? ""}
                value={e.draft}
                autoFocus={hasSaved}
                onChange={(ev) => patch(m, { draft: ev.target.value })}
                onFocus={() => (skipBlur.current = false)}
                onBlur={() => {
                  if (skipBlur.current) skipBlur.current = false;
                  else commit(m);
                }}
                onKeyDown={(ev) => {
                  if (ev.key === "Escape") {
                    skipBlur.current = true;
                    cancel(m);
                  }
                  if (ev.key === "Enter" && !ev.shiftKey) {
                    ev.preventDefault();
                    commit(m);
                  }
                }}
              />
              {hasSaved ? (
                <div style={{ display: "flex", gap: "8px" }}>
                  <button type="button" className="e-btn e-btn-soft e-btn-sm" onMouseDown={(ev) => ev.preventDefault()} onClick={() => commit(m)}>Done</button>
                  <button type="button" className="e-btn e-btn-ghost e-btn-sm" onMouseDown={(ev) => ev.preventDefault()} onClick={() => cancel(m)}>Cancel</button>
                </div>
              ) : (
                linked.length > 0 && (
                  <span className="e-small">
                    Story that fits:{" "}
                    {linked.map((x, i) => (
                      <span key={x.id}>
                        {i > 0 && ", "}
                        {storyLink(x.id, x.title, false)}
                      </span>
                    ))}
                  </span>
                )
              )}
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}
