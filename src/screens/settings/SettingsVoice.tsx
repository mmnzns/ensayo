// Draft generated from Design/screens/html/8-3-settings-voice.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import { useState } from "react";
import { useStore } from "../../data/store";
import type { VoiceData } from "../../data/screens/settings";
import { RowText, SettingsLayout, ToggleRow, useLater } from "./parts";

const SPEEDS: VoiceData["speed"][] = ["Slower", "Normal", "Faster"];

export default function SettingsVoice() {
  const { voice: v } = useStore().screens.settings;
  const [readAloud, setReadAloud] = useState(v.readAloud);
  const [voice, setVoice] = useState(v.voice);
  const [speed, setSpeed] = useState<VoiceData["speed"]>(v.speed);
  const [trySaying, setTrySaying] = useState(v.readTrySaying);
  const [playing, setPlaying] = useState(false);
  const later = useLater();

  // M1 plays nothing; the button just shows that it would.
  const preview = () => {
    setPlaying(true);
    later(() => setPlaying(false), 1600);
  };
  const off = { opacity: readAloud ? 1 : 0.5 };

  return (
    <SettingsLayout active="8-3-settings-voice">
      <section className="e-card" style={{ flex: "999 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingBottom: "10px" }}>
          <span className="e-h2">Interviewer voice</span>
          <span className="e-meta">Questions are read aloud by a voice on this computer. The text always stays on screen.</span>
        </div>
        <ToggleRow title="Read questions aloud" checked={readAloud} onChange={setReadAloud} />
        <div className="e-rowline" style={off}>
          <RowText title="Voice" hint={"Natural voices sound best. On Windows, install them under Settings › Time & language › Speech."} />
          <div style={{ display: "flex", gap: "8px" }}>
            <select className="e-input" style={{ width: "220px" }} aria-label="Voice" value={voice} disabled={!readAloud} onChange={(e) => setVoice(e.target.value)}>
              {v.voices.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
            <button type="button" className="e-btn e-btn-soft e-btn-sm" style={{ minHeight: "48px" }} disabled={!readAloud || playing} onClick={preview}>
              {playing ? (
                <span className="e-dot" aria-hidden="true" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M7 4l13 8-13 8z" />
                </svg>
              )}
              {playing ? "Playing" : "Preview"}
            </button>
          </div>
        </div>
        <div className="e-rowline" style={off}>
          <span style={{ flex: "1" }}>Speed</span>
          <div style={{ display: "flex", gap: "6px" }} role="group" aria-label="Speed">
            {SPEEDS.map((s) => (
              <button key={s} type="button" className={speed === s ? "e-chip e-chip-on" : "e-chip"} aria-pressed={speed === s} disabled={!readAloud} onClick={() => setSpeed(s)}>{s}</button>
            ))}
          </div>
        </div>
        <ToggleRow last title={'Read the "Try saying" line aloud too'} hint="Hearing the better line helps it stick." checked={trySaying} onChange={setTrySaying} disabled={!readAloud} />
      </section>
    </SettingsLayout>
  );
}
