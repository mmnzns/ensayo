// Draft generated from Design/screens/html/8-2-settings-practice.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import { useState } from "react";
import { useStore } from "../../data/store";
import { ChipChoice, RowText, SettingsLayout, ToggleRow } from "./parts";
import { readPrefs, stageIdOf, stageLabelOf, updatePractice, type PracticePrefs } from "./prefs";
import { applyTheme, getStoredTheme, type ThemeMode } from "./theme";

const APPEARANCE: { mode: ThemeMode; label: string }[] = [
  { mode: "auto", label: "Auto" },
  { mode: "light", label: "Light" },
  { mode: "dark", label: "Dark" },
];

const LENGTHS: PracticePrefs["questions"][] = [3, 5, 10];

const SHORTCUTS: [string, string][] = [
  ["Space", "start and stop"],
  ["Enter", "again"],
  ["N", "next question"],
  ["L", "listen back"],
  ["R", "hear the question again"],
  ["Esc", "end session"],
];

export default function SettingsPractice() {
  const { stages } = useStore().screens.settings;
  // These are kept on this computer (see prefs.ts), and Start a session begins from them.
  const [prefs, setPrefs] = useState<PracticePrefs>(() => readPrefs().practice);
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme);
  const change = (c: Partial<PracticePrefs>) => setPrefs(updatePractice(c).practice);
  const { stage, questions: drill, tries, timer, followUps, autoStop } = prefs;

  const pickTheme = (mode: ThemeMode) => {
    setTheme(mode);
    applyTheme(mode);
  };

  return (
    <SettingsLayout active="8-2-settings-practice">
      <section className="e-card" style={{ flex: "999 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px" }}>
        <span className="e-h2" style={{ paddingBottom: "10px" }}>Practice</span>
        <div className="e-rowline">
          <RowText title="Default stage" hint="Which interviewer you practice with when no application is picked." />
          <select className="e-input" style={{ width: "200px" }} aria-label="Default stage" value={stageLabelOf(stage)} onChange={(e) => change({ stage: stageIdOf(e.target.value) })}>
            {stages.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="e-rowline">
          <RowText title="Questions per Drill" hint="Mock always runs the stage's natural length." />
          <ChipChoice options={LENGTHS} value={drill} onChange={(v) => change({ questions: v })} label="Questions per Drill" />
        </div>
        <div className="e-rowline">
          <span style={{ flex: "1" }}>Tries per question</span>
          <select className="e-input" style={{ width: "200px" }} aria-label="Tries per question" value={tries} onChange={(e) => change({ tries: e.target.value === "2" ? 2 : 3 })}>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </div>
        <ToggleRow title="Show the timer in Drill" hint="Hidden in Mock, like a real call." checked={timer} onChange={(v) => change({ timer: v })} />
        <ToggleRow title="Follow-up questions" checked={followUps} onChange={(v) => change({ followUps: v })} />
        <ToggleRow title="Stop recording after 8 seconds of silence" hint="Off by default. Pausing to find a word shouldn't cut you off." checked={autoStop} onChange={(v) => change({ autoStop: v })} />
        <div className="e-rowline">
          <span style={{ flex: "1" }}>Appearance</span>
          <div style={{ display: "flex", gap: "6px" }} role="group" aria-label="Appearance">
            {APPEARANCE.map((a) => (
              <button key={a.mode} type="button" className={theme === a.mode ? "e-chip e-chip-on" : "e-chip"} aria-pressed={theme === a.mode} onClick={() => pickTheme(a.mode)}>{a.label}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", paddingTop: "14px" }}>
          <span style={{ fontSize: "14px", fontWeight: "600" }}>Shortcuts while practicing</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px 24px" }} className="e-meta">
            {SHORTCUTS.map(([key, what]) => (
              <span key={key}>
                <span className="e-kbd">{key}</span> {what}
              </span>
            ))}
          </div>
        </div>
      </section>
    </SettingsLayout>
  );
}
