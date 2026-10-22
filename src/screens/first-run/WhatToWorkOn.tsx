// Draft generated from Design/screens/html/1-3-what-to-work-on.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import { useState } from "react";
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import { isApp, useActions } from "../../data/real";
import { useStore } from "../../data/store";
import type { HabitId } from "../../data/types";
import StepHeader from "./StepHeader";
import { MAX_PICKS, withHabits } from "./setup";
import { useStepSave } from "./useStepSave";

const cardStyle = { display: "flex", gap: "14px", alignItems: "flex-start", padding: "20px", cursor: "pointer" } as const;
const onStyle = { boxShadow: "inset 0 0 0 2px var(--e-primary)", background: "var(--e-tint)" } as const;

export default function WhatToWorkOn() {
  const { habits, profile } = useStore();
  const options = habits.filter((h) => h.chip);
  // Picks in the order they were made, so a third pick can replace the oldest one.
  const [picked, setPicked] = useState<HabitId[]>(() => profile.focusHabits.filter((id) => options.some((h) => h.id === id)).slice(0, MAX_PICKS));
  const [notSure, setNotSure] = useState(false);
  // Said under the counter when a third pick pushed the oldest one out.
  const [dropped, setDropped] = useState<string | null>(null);

  // Continue saves the picks on the profile ("Not sure yet" saves none); the browser preview just moves on.
  const { saveProfile } = useActions();
  const { saving, problem, onContinue } = useStepSave("1-4-microphone");
  const save = onContinue(async () => {
    if (isApp()) await saveProfile(withHabits(profile, picked, notSure));
  });

  const toggle = (id: HabitId) => {
    setNotSure(false);
    if (picked.includes(id)) {
      setPicked(picked.filter((x) => x !== id));
      setDropped(null);
    } else if (picked.length >= MAX_PICKS) {
      const oldest = options.find((h) => h.id === picked[0]);
      setDropped(oldest?.chip ?? null);
      setPicked([...picked.slice(1), id]);
    } else {
      setPicked([...picked, id]);
      setDropped(null);
    }
  };
  const toggleNotSure = () => {
    setNotSure((cur) => !cur);
    setPicked([]);
    setDropped(null);
  };

  return (
    <FocusShell>
      <div className="e-wrap" style={{ width: "100%", gap: "32px" }}>
        <StepHeader step={3} skipTo="1-4-microphone" />
        <div style={{ maxWidth: "860px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span className="e-label">Step 3 of 7</span>
            <h1 className="e-h1">What do you want to work on?</h1>
            <p className="e-meta" style={{ margin: "0" }}>Pick one or two. Ensayo keeps an eye on them every session and tells you when one sticks.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
            {options.map((h) => {
              const on = picked.includes(h.id);
              return (
                <label key={h.id} className="e-card" style={{ ...cardStyle, ...(on ? onStyle : {}) }}>
                  <input type="checkbox" className="e-check" checked={on} onChange={() => toggle(h.id)} style={{ marginTop: "2px" }} />
                  <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span className="e-h3">{h.chip}</span>
                    <span className="e-meta">{h.blurb}</span>
                  </span>
                </label>
              );
            })}
            <label className="e-card" style={{ ...cardStyle, ...(notSure ? onStyle : {}) }}>
              <input type="checkbox" className="e-check" checked={notSure} onChange={toggleNotSure} style={{ marginTop: "2px" }} />
              <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span className="e-h3">Not sure yet</span>
                <span className="e-meta">Ensayo picks one after your first few answers.</span>
              </span>
            </label>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <Link to="1-2-about-you" className="e-btn e-btn-ghost">← Back</Link>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", textAlign: "center" }} aria-live="polite">
              <span className="e-meta">{picked.length} of {MAX_PICKS} picked</span>
              {dropped ? <span className="e-small">Two is the limit, so "{dropped}" was unpicked.</span> : null}
            </span>
            <Link to="1-4-microphone" className="e-btn e-btn-primary" onClick={save} aria-disabled={saving || undefined}>Continue</Link>
          </div>
          {problem ? <span className="e-meta" role="alert" style={{ color: "var(--e-warn-ink)" }}>{problem}</span> : null}
        </div>
      </div>
    </FocusShell>
  );
}
