// Progress by target (v0.1): which answers and sessions belong to which target, the totals for one target, and the
// "Ready for each target?" cards. Pure. Habits are not here on purpose: how you deliver goes with you to every job, so
// the habit numbers always read every answer, whatever target the screen is filtered to.

import type { RepSummary } from "../../practice/habits";
import { streakOf } from "../../practice/habits";
import { repTargetId } from "../../data/readiness";
import { applicationTarget } from "../../data/targets";
import type { Application, SessionSummary, Streak, Target } from "../../data/types";

/** An answer as the backend lists it: answers saved before targets carry no `target_id`. */
export type TargetedRep = RepSummary & { target_id?: string | null };

/** The answers for one target, or all of them. */
export function filterRepsByTarget(reps: TargetedRep[], applications: Pick<Application, "id" | "targetId">[], targets: Target[], targetId: string | "all"): TargetedRep[] {
  return targetId === "all" ? reps : reps.filter((r) => repTargetId(r, applications, targets) === targetId);
}

/** The totals cards: days in a row belong to the person and never narrow; the counts follow the filter. */
export function totalsFor(all: TargetedRep[], shown: TargetedRep[], now: Date): Streak {
  return { ...streakOf(shown, now), daysInARow: streakOf(all, now).daysInARow };
}

/** The target a session row belongs to: its own, else the first target. */
export function sessionTargetId(s: Pick<SessionSummary, "targetId" | "applicationId">, applications: Pick<Application, "id" | "targetId">[], targets: Target[]): string | undefined {
  if (s.targetId) return s.targetId;
  const app = s.applicationId ? applications.find((a) => a.id === s.applicationId) : undefined;
  if (app) return applicationTarget(app, targets)?.id;
  return targets.find((t) => !t.archived)?.id ?? targets[0]?.id;
}

export function filterSessionsByTarget(sessions: SessionSummary[], applications: Pick<Application, "id" | "targetId">[], targets: Target[], targetId: string | "all"): SessionSummary[] {
  return targetId === "all" ? sessions : sessions.filter((s) => sessionTargetId(s, applications, targets) === targetId);
}

/** The targets the filter offers: live ones, plus an archived one that still holds answers or applications. */
export function progressChoices(targets: Target[], used: (string | undefined)[]): Target[] {
  const ids = new Set(used);
  return targets.filter((t) => !t.archived || ids.has(t.id));
}
