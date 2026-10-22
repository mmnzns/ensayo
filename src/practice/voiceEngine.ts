// The interviewer's voice, the decisions without the browser or the backend in them: the probe that finds out whether
// the app's browser engine has any voice, what Settings says about it, and which engine speaks first.
// voice.ts wires these to the real speechSynthesis and to the backend's system speech.

import type { VoiceEngine, VoiceLike } from "../screens/settings/prefs";

/** How long the probe waits for the system to finish loading its voices. */
export const PROBE_WAIT_MS = 2000;

/** What the probe needs from the browser: its voices now, and a way to hear that they changed. */
export interface ProbeSource {
  getVoices(): VoiceLike[];
  /** Calls `cb` when the voice list changes (`voiceschanged`); returns how to stop listening. */
  onChange(cb: () => void): () => void;
}

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

/**
 * Whether the app's browser engine has a voice. Nothing is spoken. The decision table:
 * - no speech synthesis at all (`source` is null): none, at once
 * - voices already listed: those, at once
 * - the list is empty: wait for `voiceschanged` up to `waitMs`; a change that brings voices ends the wait with them,
 *   a change that is still empty keeps waiting
 * - the wait runs out: whatever the list holds by then, which is none when nothing came
 */
export function probeBrowserVoices(source: ProbeSource | null, waitMs: number = PROBE_WAIT_MS, timers: Timers = realTimers): Promise<VoiceLike[]> {
  if (!source) return Promise.resolve([]);
  const read = (): VoiceLike[] => {
    try {
      return source.getVoices();
    } catch {
      return [];
    }
  };
  const now = read();
  if (now.length > 0) return Promise.resolve(now);
  return new Promise((resolve) => {
    let done = false;
    let stop: () => void = () => {};
    let timer: unknown;
    const finish = (voices: VoiceLike[]) => {
      if (done) return;
      done = true;
      stop();
      timers.clear(timer);
      resolve(voices);
    };
    stop = source.onChange(() => {
      const v = read();
      if (v.length > 0) finish(v);
    });
    timer = timers.set(() => finish(read()), waitMs);
  });
}

/** What Settings, Voice says: the list, the system's voice standing in, or no voice at all. */
export type VoiceMode = "list" | "system" | "none";

export function voiceMode(browserVoices: number, systemVoices: number): VoiceMode {
  if (browserVoices > 0) return "list";
  return systemVoices > 0 ? "system" : "none";
}

export const NO_BROWSER_VOICE = "No voice from the app's browser engine on this computer, so Ensayo uses your system's voice.";
export const NO_VOICE = "No voice available. Questions are shown, not spoken.";

/** The engines to try, in order: the saved choice first, the other one after it, each only if it has voices. */
export function engineOrder(saved: VoiceEngine, has: { browser: boolean; system: boolean }): VoiceEngine[] {
  const other: VoiceEngine = saved === "browser" ? "system" : "browser";
  return [saved, other].filter((e) => has[e]);
}

/**
 * Tries each engine until one speaks. `attempt` resolves true when the engine read the line (to the end, or until it
 * was stopped) and false when it failed or could not speak. `live` turns false once someone stopped or replaced this
 * line, so a stop never falls through to the next engine. Resolves true when some engine spoke.
 */
export async function speakInOrder(order: VoiceEngine[], attempt: (engine: VoiceEngine, isLast: boolean) => Promise<boolean>, live: () => boolean = () => true): Promise<boolean> {
  for (let i = 0; i < order.length; i++) {
    if (!live()) return true;
    let ok = false;
    try {
      ok = await attempt(order[i], i === order.length - 1);
    } catch {
      ok = false;
    }
    if (ok) return true;
  }
  return false;
}
