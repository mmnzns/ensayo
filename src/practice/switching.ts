// Changing target is blocked while a practice session is running: the pitch, questions and stories of a session do
// not change under the person halfway through.

import type { LiveState } from "./live";

export const SWITCH_BLOCKED = "Finish or end this session before you switch.";

/** The line to show instead of switching, or null when switching is fine. A session that has reached its end (phase idle) no longer blocks. */
export function switchBlocked(live: Pick<LiveState, "active" | "phase">): string | null {
  return live.active && live.phase !== "idle" ? SWITCH_BLOCKED : null;
}
