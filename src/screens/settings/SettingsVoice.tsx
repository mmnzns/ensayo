import { useEffect, useState } from "react";
import type { VoiceData } from "../../data/screens/settings";
import { say, stopSaying, useVoices } from "../../practice/voice";
import { RowText, SettingsLayout, ToggleRow, useLater } from "./parts";
import { readPrefs, updateVoice, voiceChoices, type VoicePrefs } from "./prefs";

const SPEEDS: VoiceData["speed"][] = ["Slower", "Normal", "Faster"];

const SAMPLE = "Tell me about a time you changed your mind.";

export default function SettingsVoice() {
  // Where the choice is kept: this computer (see prefs.ts). The voices are the ones the system offers.
  const [prefs, setPrefs] = useState<VoicePrefs>(() => readPrefs().voice);
  const voices = useVoices();
  const choices = voiceChoices(voices);
  const [playing, setPlaying] = useState(false);
  const later = useLater();
  useEffect(() => stopSaying, []);

  const change = (c: Partial<VoicePrefs>) => setPrefs(updateVoice(c).voice);
  const { readAloud, speed, readTrySaying } = prefs;
  // A saved voice that this computer no longer has shows as automatic.
  const voice = choices.some((c) => c.value === prefs.voiceUri) ? prefs.voiceUri : "";

  const preview = () => {
    setPlaying(true);
    // Read the sample through the saved settings, so what you hear is what practice will use.
    if (!say(SAMPLE, () => setPlaying(false))) later(() => setPlaying(false), 600);
  };
  const off = { opacity: readAloud ? 1 : 0.5 };

  return (
    <SettingsLayout active="8-3-settings-voice">
      <section className="e-card" style={{ flex: "999 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingBottom: "10px" }}>
          <span className="e-h2">Interviewer voice</span>
          <span className="e-meta">Questions are read aloud by a voice on this computer. The text always stays on screen.</span>
        </div>
        <ToggleRow title="Read questions aloud" checked={readAloud} onChange={(v) => change({ readAloud: v })} />
        <div className="e-rowline" style={off}>
          <RowText title="Voice" hint={choices.length === 0 ? "Ensayo can't find a voice on this computer. Questions stay on screen." : "Natural voices sound best. On Windows, install them under Settings › Time & language › Speech."} />
          <div style={{ display: "flex", gap: "8px" }}>
            <select className="e-input" style={{ width: "220px" }} aria-label="Voice" value={voice} disabled={!readAloud} onChange={(e) => change({ voiceUri: e.target.value })}>
              <option value="">Automatic</option>
              {choices.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
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
              <button key={s} type="button" className={speed === s ? "e-chip e-chip-on" : "e-chip"} aria-pressed={speed === s} disabled={!readAloud} onClick={() => change({ speed: s })}>{s}</button>
            ))}
          </div>
        </div>
        <ToggleRow last title={'Read the "Try saying" line aloud too'} hint="Hearing the better line helps it stick." checked={readTrySaying} onChange={(v) => change({ readTrySaying: v })} disabled={!readAloud} />
      </section>
    </SettingsLayout>
  );
}
