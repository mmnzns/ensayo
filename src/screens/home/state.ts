// Which Home to show, and small lines on it that depend on whether anything has been practised.

import type { EngineStatus } from "../../data/types";

/** In the app, until the first answer is saved, Home is the welcome with a way to start. The browser preview keeps the full sample Home. */
export const showFirstHome = (real: boolean, sessions: number): boolean => real && sessions === 0;

/** The "add an engine" nudge: always in the browser preview (as designed), and in the app only while feedback is timing only. */
export const showEngineNudge = (real: boolean, engine: EngineStatus): boolean => !real || engine.kind === "timing";

/** The line beside a habit on Home: "7 of your last 10", or a plain one while there are no answers to count. */
export const habitCount = (got: number, of: number): string => (of > 0 ? `${got} of your last ${of}` : "No answers yet");
