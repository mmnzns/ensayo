// Settings, Speech: which microphone Ensayo records with, and a short level test on it. The choice is saved in prefs and
// goes to every recording; empty means the system default.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BARS, useLevelTest } from "../first-run/useLevelTest";
import { readPrefs, updateMic } from "./prefs";

/** The choices for the list: the system default first, then each connected microphone. A saved one that is not connected stays listed, so the list never shows a choice you didn't make. */
export function micChoices(devices: string[], saved: string): { value: string; label: string }[] {
  const list = devices.map((d) => ({ value: d, label: d }));
  if (saved && !devices.includes(saved)) list.push({ value: saved, label: `${saved} (not connected)` });
  return [{ value: "", label: "System default" }, ...list];
}

export default function MicrophoneCard() {
  const [devices, setDevices] = useState<string[]>([]);
  const [device, setDevice] = useState(() => readPrefs().mic.device);
  const test = useLevelTest(device);
  useEffect(() => {
    invoke<string[]>("list_input_devices").then(setDevices, () => {});
  }, []);
  const bars = Array.from({ length: BARS }, (_, i) => test.levels[i - (BARS - test.levels.length)] ?? 0);

  return (
    <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <span className="e-h3">Microphone</span>
        <span className="e-meta">The one Ensayo records your answers with.</span>
      </div>
      <div className="e-field">
        <label htmlFor="settings-mic">Microphone</label>
        <select
          id="settings-mic"
          className="e-input"
          value={device}
          onChange={(e) => {
            setDevice(e.target.value);
            updateMic({ device: e.target.value });
          }}
        >
          {micChoices(devices, device).map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "48px", padding: "0 4px" }} aria-label={test.listening ? "Input level, listening" : "Input level"}>
        {bars.map((level, i) => (
          <span key={i} style={{ flex: "1", height: `${Math.max(8, Math.round(level * 100))}%`, borderRadius: "4px", background: level > 0.05 ? "var(--e-primary)" : "var(--e-line)", transition: "height 120ms ease" }} />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
        <span className="e-meta" aria-live="polite">{test.listening ? "Listening" : test.trouble || test.verdict?.line || "Press the button and say a few words. The test is not kept."}</span>
        <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => void test.start()} disabled={test.listening}>
          {test.listening ? "Testing" : test.verdict || test.trouble ? "Test again" : "Test the microphone"}
        </button>
      </div>
    </section>
  );
}
