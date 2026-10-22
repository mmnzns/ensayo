// Stopping a recording by itself after a long silence (Settings, Practice). It reads the same voice level the bars
// show. Silence only counts once the person has spoken, so waiting to begin never stops anything.

export const SILENCE_LIMIT_MS = 8000;
/** Below this level (0 to 1) the room counts as quiet. */
export const QUIET_LEVEL = 0.02;

export interface SilenceState {
  heard: boolean;
  quietMs: number;
}

export const SILENCE_START: SilenceState = { heard: false, quietMs: 0 };

/** One reading of the voice level, `dtMs` after the last one. */
export function silenceStep(s: SilenceState, level: number, dtMs: number): SilenceState {
  if (level >= QUIET_LEVEL) return { heard: true, quietMs: 0 };
  return s.heard ? { heard: true, quietMs: s.quietMs + dtMs } : s;
}

export const silenceStop = (s: SilenceState): boolean => s.heard && s.quietMs >= SILENCE_LIMIT_MS;
