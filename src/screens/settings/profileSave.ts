// Settings, Profile saves as the person types. This decides what, if anything, to save: pure, so the screen only
// has to call it and then `saveProfile`.

import type { HabitId, Profile, SellsTo, Seniority } from "../../data/types";
import { aboutProblems, profileFromAbout, withHabits } from "../first-run/setup";

export interface ProfileFields {
  name: string;
  role: string;
  industry: string;
  seniority: Seniority;
  sellsTo: SellsTo;
  who: string;
  focus: HabitId[];
}

export type ProfileSave = { kind: "same" } | { kind: "problem"; name?: string; role?: string } | { kind: "save"; profile: Profile };

export const SAVE_FAILED = "That change didn't save. Ensayo will try again when you change something else.";

/** The profile to save for what is on screen, over `saved` (which keeps what Settings does not show, like the full name). */
export function profileToSave(saved: Profile, f: ProfileFields): ProfileSave {
  const problems = aboutProblems({ name: f.name, role: f.role, industry: f.industry, seniority: f.seniority, sellsTo: f.sellsTo, who: f.who });
  if (problems.name || problems.role) return { kind: "problem", ...problems };
  const next = withHabits(profileFromAbout(saved, { name: f.name, role: f.role, industry: f.industry, seniority: f.seniority, sellsTo: f.sellsTo, who: f.who }), f.focus, f.focus.length === 0);
  return JSON.stringify(next) === JSON.stringify(saved) ? { kind: "same" } : { kind: "save", profile: next };
}
