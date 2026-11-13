// What the thinking screen shows for an answer being scored. A row is ticked only when the backend said that part is done.
import type { EngineStatus } from "../../data/types";
import { canStop } from "../../ui/aiStop";

/** After this many seconds the screen says it is taking longer than usual. */
export const LONG_WAIT_SECONDS = 30;
export const LONG_WAIT_TEXT = "Taking longer than usual.";

export interface ThinkingRows {
  /** "Turning your answer into text" */
  text: boolean;
  /** "Timing, length and filler words" */
  timing: boolean;
  /** The AI row is still running (a spinner and the clock). */
  judging: boolean;
}

/** In the app, the first two rows tick when `rep-measured` arrived (`measured` is its word count); the preview ticks them at once. */
export function thinkingRows(live: boolean, measured: number | null): ThinkingRows {
  const done = !live || measured !== null;
  return { text: done, timing: done, judging: true };
}

/** Whole seconds since the wait began, never negative. */
export function elapsedSeconds(since: number | null, now: number): number {
  return since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000));
}

/** "12 s" under a minute, "1:24" after. */
export function elapsedLabel(seconds: number): string {
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export const takingLonger = (seconds: number): boolean => seconds >= LONG_WAIT_SECONDS;

/** Stop shows only for the built-in local AI, only while the AI part runs (after the measured part), and not when no AI was asked. */
export function showStop(kind: EngineStatus["kind"] | undefined, live: boolean, aiReady: boolean, measured: number | null): boolean {
  return live && aiReady && measured !== null && canStop(kind);
}
