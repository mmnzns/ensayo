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

import type { Target, You } from "../types";

/** Dana's two targets in the v0.1 boards: B2C lifecycle (the one she started with) and B2B marketing ops. */
export const targets: Target[] = [
  {
    id: "tg_b2c", name: "B2C lifecycle", color: "coral", role: profile.targetRole, roleFamily: "lifecycle", seniority: profile.seniority, industry: profile.industry, sellsTo: "b2c", companyStage: "any",
    pitch: profile.identityStatement, leadWith: ["I own lifecycle end to end", "Activation went from 31% to 44%"], pinnedStoryIds: [], hiddenStoryIds: [], defaultProcess: ["recruiter", "hiring_manager", "technical", "panel"],
    baseResume: null, payRange: null, archived: false, createdAt: "2026-10-01T00:00:00Z",
  },
  {
    id: "tg_b2b", name: "B2B marketing ops", color: "slate", role: "Marketing Operations Manager", roleFamily: "marketing_ops", seniority: "senior", industry: "B2B SaaS", sellsTo: "b2b", companyStage: "growth",
    pitch: "I'm a marketing ops lead who turns a messy stack into a pipeline the sales team trusts, then proves it in the numbers.", leadWith: ["Pipeline sales trusts", "I run the stack myself"], pinnedStoryIds: [], hiddenStoryIds: [], defaultProcess: ["recruiter", "hiring_manager", "technical", "panel"],
    baseResume: null, payRange: null, archived: false, createdAt: "2026-10-21T00:00:00Z",
  },
];

export const you: You = { name: profile.name, fullName: profile.fullName, focusHabits: profile.focusHabits, activeTargetId: "tg_b2c" };
