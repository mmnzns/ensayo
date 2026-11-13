// The four minute limit on one answer, as the recording screen shows it. Seconds here are recorded seconds: paused
// time does not count.

/** Where the warning appears: 3:30, which leaves 30 seconds. */
export const WARN_AT_SECONDS = 210;
/** Where recording stops by itself. */
export const LIMIT_SECONDS = 240;

export const LIMIT_WARNING = "30 seconds left";
export const LIMIT_STOPPED = "The answer reached the 4 minute limit, so recording stopped.";

export type LimitState = "ok" | "warn" | "stop";

export function limitState(recordedSeconds: number): LimitState {
  if (recordedSeconds >= LIMIT_SECONDS) return "stop";
  return recordedSeconds >= WARN_AT_SECONDS ? "warn" : "ok";
}
