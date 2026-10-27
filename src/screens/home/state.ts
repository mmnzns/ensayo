// Which Home to show, and small lines on it that depend on whether anything has been practised.

import type { EngineStatus } from "../../data/types";

/** In the app, until the first answer is saved, Home is the welcome with a way to start. The browser preview keeps the full sample Home. With an interview coming up, Home shows it, so the welcome steps aside. */
export const showFirstHome = (real: boolean, sessions: number, hasInterview = false): boolean => real && sessions === 0 && !hasInterview;

/** The "add an engine" nudge: always in the browser preview (as designed), and in the app only while feedback is timing only. */
export const showEngineNudge = (real: boolean, engine: EngineStatus): boolean => !real || engine.kind === "timing";

/** The line beside a habit on Home: "Passed 7 of your last 10 first tries", or a plain one while there are no answers to count. */
export const habitCount = (got: number, of: number): string => (of > 0 ? `Passed ${got} of your last ${of} first ${of === 1 ? "try" : "tries"}` : "No answers yet");

/** When follow-ups come, and that they need an AI engine (live.ts: a Drill offers one after an answer once an engine is
 *  ready; a Mock asks up to 2 on story answers, 1 at the recruiter stage). */
export function followUpHint(kind: EngineStatus["kind"], mock: boolean): string {
  if (kind === "timing") return "Follow-ups need an AI engine. With timing only, none are asked. Add one in Settings, under AI.";
  return mock ? "The interviewer asks up to 2 follow-ups on your story answers, 1 at the recruiter stage." : "After each answer you can take a follow-up, where the interviewer pushes on what you said.";
}

/** What the focus habit changes: the results lead with it. It does not change which fix the note picks. */
export const FOCUS_HINT = "Your results lead with this habit, first try against best try. It doesn't change which fix you get after an answer.";
