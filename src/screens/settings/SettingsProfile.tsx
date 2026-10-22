// Draft generated from Design/screens/html/8-1-settings-profile.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import { useEffect, useRef, useState } from "react";
import { useActions } from "../../data/real";
import { useStore } from "../../data/store";
import type { HabitId, SellsTo, Seniority } from "../../data/types";
import { SettingsLayout } from "./parts";
import { profileToSave, SAVE_FAILED } from "./profileSave";

const SENIORITY: Seniority[] = ["early", "mid", "senior", "lead", "director"];

export default function SettingsProfile() {
  const { profile, habits, screens } = useStore();
  const { seniorityLabels, sellsToLabels } = screens.settings;
  const [name, setName] = useState(profile.name);
  const [seniority, setSeniority] = useState<Seniority>(profile.seniority);
  const [role, setRole] = useState(profile.targetRole);
  const [industry, setIndustry] = useState(profile.industry);
  const [sellsTo, setSellsTo] = useState<SellsTo>(profile.sellsTo);
  const [identity, setIdentity] = useState(profile.identityStatement);
  const [focus, setFocus] = useState<HabitId[]>(profile.focusHabits);

  // Changes save on their own a moment after you stop typing, to the data folder in the app.
  const { saveProfile } = useActions();
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const saving = useRef(0);
  const decision = profileToSave(profile, { name, role, industry, seniority, sellsTo, who: identity, focus });
  const changed = decision.kind === "save" ? decision.profile : null;
  // Keyed by content, so a failed save waits for the next change instead of retrying in a loop.
  const changedKey = changed ? JSON.stringify(changed) : "";
  useEffect(() => {
    if (!changed) return;
    const id = window.setTimeout(() => {
      const ticket = ++saving.current;
      saveProfile(changed).then(
        () => ticket === saving.current && setStatus("saved"),
        () => ticket === saving.current && setStatus("failed"),
      );
    }, 600);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changedKey, saveProfile]);

  // Up to two: picking a third lets go of the one picked first.
  const toggleFocus = (id: HabitId) =>
    setFocus((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id].slice(-2)));

  return (
    <SettingsLayout active="8-1-settings-profile">
      <section className="e-card" style={{ flex: "999 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "22px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span className="e-h2">Profile</span>
          <span className="e-meta">Shapes the questions and what Ensayo listens for.</span>
          <span className="e-small" role="status" aria-live="polite" style={{ minHeight: "1.4em", color: status === "failed" ? "var(--e-warn-ink)" : "var(--e-primary-dark)" }}>
            {decision.kind === "problem" ? <span style={{ color: "var(--e-ink)" }}>{decision.name ?? decision.role}</span> : status === "failed" ? SAVE_FAILED : status === "saved" ? "Saved" : ""}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
          <div className="e-field">
            <label htmlFor="nm">Your name</label>
            <input id="nm" className="e-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="e-field">
            <label htmlFor="sn">Seniority</label>
            <select id="sn" className="e-input" value={seniority} onChange={(e) => setSeniority(e.target.value as Seniority)}>
              {SENIORITY.map((s) => (
                <option key={s} value={s}>{seniorityLabels[s]}</option>
              ))}
            </select>
          </div>
          <div className="e-field">
            <label htmlFor="rl">Role you're going for</label>
            <input id="rl" className="e-input" value={role} onChange={(e) => setRole(e.target.value)} />
          </div>
          <div className="e-field">
            <label htmlFor="in">Industry</label>
            <input id="in" className="e-input" value={industry} onChange={(e) => setIndustry(e.target.value)} />
          </div>
        </div>
        <div className="e-field">
          <span style={{ fontSize: "14px", fontWeight: "600" }}>You sell to</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {sellsToLabels.map((o) => (
              <button key={o.id} type="button" className={sellsTo === o.id ? "e-chip e-chip-on" : "e-chip"} aria-pressed={sellsTo === o.id} onClick={() => setSellsTo(o.id)}>{o.label}</button>
            ))}
          </div>
        </div>
        <div className="e-field">
          <label htmlFor="id">Who you are at work, in one sentence</label>
          <textarea id="id" className="e-input" rows={2} value={identity} onChange={(e) => setIdentity(e.target.value)} />
          <span className="e-small">Checked against your "Tell me about yourself" answers.</span>
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
      </section>
    </SettingsLayout>
  );
}
