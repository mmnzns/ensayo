// Settings, You: the name and the habits to work on, which go with the person to every target. Saves on its own a
// moment after the last change. The role, industry and pitch moved to Targets.
import { useEffect, useRef, useState } from "react";
import { useActions } from "../../data/real";
import { useStore } from "../../data/store";
import type { HabitId } from "../../data/types";
import Link from "../../ui/Link";
import { SettingsLayout } from "./parts";
import { MAX_FOCUS, SAVE_FAILED, youToSave } from "./targetForms";

export default function SettingsYou() {
  const { you, habits } = useStore();
  const { saveYou } = useActions();
  const [name, setName] = useState(you.name);
  const [focus, setFocus] = useState<HabitId[]>(you.focusHabits);

  // Changes save on their own a moment after you stop typing, to the data folder in the app.
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const saving = useRef(0);
  const decision = youToSave(you, { name, focus });
  const changed = decision.kind === "save" ? decision.you : null;
  // Keyed by content, so a failed save waits for the next change instead of retrying in a loop.
  const changedKey = changed ? JSON.stringify(changed) : "";
  useEffect(() => {
    if (!changed) return;
    const id = window.setTimeout(() => {
      const ticket = ++saving.current;
      saveYou(changed).then(
        () => ticket === saving.current && setStatus("saved"),
        () => ticket === saving.current && setStatus("failed"),
      );
    }, 600);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changedKey, saveYou]);

  // Up to two: picking a third lets go of the one picked first.
  const toggleFocus = (id: HabitId) => setFocus((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id].slice(-MAX_FOCUS)));

  return (
    <SettingsLayout active="8-1-settings-you">
      <div style={{ flex: "999 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span className="e-h2">You</span>
            <span className="e-meta">Goes with you to every target.</span>
            <span className="e-small" role="status" aria-live="polite" style={{ minHeight: "1.4em", color: status === "failed" ? "var(--e-warn-ink)" : "var(--e-primary-dark)" }}>
              {decision.kind === "problem" ? <span style={{ color: "var(--e-ink)" }}>{decision.name}</span> : status === "failed" ? SAVE_FAILED : status === "saved" ? "Saved" : ""}
            </span>
          </div>
          <div className="e-field" style={{ maxWidth: "360px" }}>
            <label htmlFor="nm">Your name</label>
            <input id="nm" className="e-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="e-field">
            <span style={{ fontSize: "14px", fontWeight: "600" }}>
              Focus habits <span style={{ fontWeight: "400", color: "var(--e-muted)" }}>· up to two</span>
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {habits.map((h) => (
                <button key={h.id} type="button" className={focus.includes(h.id) ? "e-chip e-chip-on" : "e-chip"} aria-pressed={focus.includes(h.id)} onClick={() => toggleFocus(h.id)}>{h.label}</button>
              ))}
            </div>
          </div>
          <span className="e-small" style={{ marginTop: "-8px" }}>Habits count across all your targets. How you deliver an answer is yours, whatever the job.</span>
        </section>
        <section className="e-soft" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px" }}>
          <span style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span className="e-h3">Looking for role, industry or your pitch?</span>
            <span className="e-meta">They moved to Targets, so each kind of job you go for gets its own.</span>
          </span>
          <Link to="8-2-settings-targets" className="e-btn e-btn-white e-btn-sm">Open Targets</Link>
        </section>
      </div>
    </SettingsLayout>
  );
}
