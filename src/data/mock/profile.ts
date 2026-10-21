import type { EngineStatus, HabitStat, Profile, Streak } from "../types";

/** Dana Ortiz: a fictional lifecycle marketing manager at Fernhill, a made-up neobank. The sample candidate in the design. */
export const profile: Profile = {
  name: "Dana",
  fullName: "Dana Ortiz",
  targetRole: "Senior Lifecycle Marketing Manager",
  seniority: "senior",
  industry: "Fintech and payments",
  sellsTo: "b2c",
  identityStatement: "I'm a lifecycle marketer who finds where activation and retention actually break, then builds the journeys that fix them.",
  focusHabits: ["to_the_point", "clean_stop"],
};

export const engine: EngineStatus = { label: "Claude Sonnet", kind: "key", offline: false };

/** Totals after today's session (Progress, session results). Home shows the numbers from before it. */
export const streak: Streak = { daysInARow: 5, answers: 58, questions: 23, followUps: 11 };

/** The focus cards on Home (the state before today's session). */
export const homeHabitStats: HabitStat[] = [
  { id: "to_the_point", firstTry: [7, 10], note: "One more good one and it graduates." },
  { id: "clean_stop", firstTry: [4, 10], retry: [3, 4], note: "Fixes stick on the second try 3 out of 4 times." },
];
