// Esc in a session: what it does on each phase, and the words of the question it asks before throwing an answer away.

/** The answer in danger, if any: being recorded, or being scored. */
export type AtStake = "recording" | "scoring" | null;

/** What is at stake on a live session's screen. Only a live session has an answer to lose. */
export function atStake(screen: "recording" | "thinking", live: boolean, failed = false): AtStake {
  if (!live || failed) return null;
  return screen === "recording" ? "recording" : "scoring";
}

/** Esc ends the session at once when nothing is at stake; otherwise it asks first. */
export const escDecision = (stake: AtStake): "ask" | "end" => (stake ? "ask" : "end");

export const END_TITLE = "End the session?";
export const END_CONFIRM = "End session";
export const END_KEEP = "Keep going";
export const endBody = (stake: Exclude<AtStake, null>): string => (stake === "recording" ? "This answer will be lost." : "The answer being scored will be lost.");
