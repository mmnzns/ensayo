// The three-second microphone check used by setup and by Settings, Speech: records from the chosen device, reads the
// level, then throws the recording away.
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { takeOverOnFirstStart } from "../../practice/api";
import { levelVerdict, pushLevel } from "./setup";

export const BARS = 14;
const LIVE_MS = 3000;
const POLL_MS = 100;

/** Reads the loudness for three seconds from the real recorder, then throws the recording away. */
export function useLevelTest(device: string) {
  const [listening, setListening] = useState(false);
  const [levels, setLevels] = useState<number[]>([]);
  const [verdict, setVerdict] = useState<{ ok: boolean; line: string } | null>(null);
  const [trouble, setTrouble] = useState("");
  const recording = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const finish = async (peak: number | null) => {
    window.clearInterval(timer.current);
    if (recording.current) {
      recording.current = false;
      try {
        const rec = await invoke<{ path: string }>("stop_recording");
        // This was only a level check: the sound is not kept.
        await invoke("discard_recording", { path: rec.path }).catch(() => {});
      } catch {
        // Nothing was recording any more.
      }
    }
    setListening(false);
    if (peak !== null) setVerdict(levelVerdict(peak));
  };

  const start = async () => {
    if (listening) return;
    setTrouble("");
    setVerdict(null);
    setLevels([]);
    try {
      await invoke("start_recording", { device: device || null, takeOver: takeOverOnFirstStart() });
    } catch (e) {
      setTrouble(typeof e === "string" && e.trim() ? e : "Ensayo couldn't start listening. Check the microphone and try again.");
      return;
    }
    recording.current = true;
    setListening(true);
    let peak = 0;
    const began = Date.now();
    timer.current = window.setInterval(() => {
      void invoke<{ level: number } | null>("recording_level").then((l) => {
        const level = l?.level ?? 0;
        peak = Math.max(peak, level);
        setLevels((h) => pushLevel(h, level, BARS));
      }, () => {});
      if (Date.now() - began >= LIVE_MS) void finish(peak);
    }, POLL_MS);
  };

  // Leaving the screen while listening stops the recorder, so practice can have it.
  useEffect(() => () => void finish(null), []);

  return { listening, levels, verdict, trouble, start };
}
