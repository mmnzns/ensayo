// Progress by target (v0.1): which answers and sessions belong to which target, the totals for one target, and the
// "Ready for each target?" cards. Pure. Habits are not here on purpose: how you deliver goes with you to every job, so
// the habit numbers always read every answer, whatever target the screen is filtered to.

import type { RepSummary } from "../../practice/habits";
import { streakOf } from "../../practice/habits";
import { applicationTarget, visibleStories } from "../../data/targets";
import type { Application, SessionSummary, Story, Streak, Target } from "../../data/types";
import type { SessionPreset } from "../home/preset";

/** An answer as the backend lists it: answers saved before targets carry no `target_id`. */
export type TargetedRep = RepSummary & { target_id?: string | null };

/** The target an answer was practised for: its own, else its application's, else the first target. */
export function repTargetId(rep: Pick<TargetedRep, "target_id" | "application_id">, applications: Pick<Application, "id" | "targetId">[], targets: Target[]): string | undefined {
  if (rep.target_id) return rep.target_id;
  const app = rep.application_id ? applications.find((a) => a.id === rep.application_id) : undefined;
  if (app) return applicationTarget(app, targets)?.id;
  return targets.find((t) => !t.archived)?.id ?? targets[0]?.id;
}

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

// ---------- ready for each target ----------

export interface ReadinessRow {
  id: "pitch" | "stories" | "mock" | "gaps";
  /** A green tick when true, a grey one when not. */
  ok: boolean;
  title: string;
  detail: string;
}

export type ReadinessAction = { kind: "pitch" | "gap"; label: string; primary: boolean; applicationId?: string };

export interface TargetReadiness {
  target: Target;
  rows: ReadinessRow[];
  /** The one thing to do next: practice the pitch when it is the thing to fix, else a gap when there is one. */
  action: ReadinessAction;
}

export interface ReadinessInput {
  /** Every target, archived ones included. */
  targets: Target[];
  stories: Story[];
  applications: Application[];
  reps: TargetedRep[];
  now: Date;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 19" from a saved date-time, read as written (no time zone shift). "" when it is not one. */
export function dayLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : "";
}

const PITCH_TYPES = new Set(["tell_me_about_yourself", "about_you"]);
const latest = (isos: string[]) => isos.reduce((a, b) => (a > b ? a : b), "");

/** The stories a target leads with: the ones pinned for it, or with none pinned the first three it uses. Hidden ones never count. */
export function leadStories(target: Pick<Target, "pinnedStoryIds" | "hiddenStoryIds">, stories: Story[]): Story[] {
  const shown = visibleStories(stories, target);
  const pinned = shown.filter((s) => target.pinnedStoryIds.includes(s.id));
  return pinned.length > 0 ? pinned : shown.slice(0, 3);
}

/** Open gaps the postings of these applications found, in plain words. */
function gapsOf(apps: Application[]): { text: string; app: Application }[] {
  return apps.flatMap((a) => (a.analysis?.gaps ?? []).map((text) => ({ text, app: a })));
}

function nextCaller(apps: Application[], now: Date): string | undefined {
  let best: { at: number; company: string } | undefined;
  for (const a of apps) {
    for (const s of a.process) {
      const at = s.at && !s.done ? new Date(s.at).getTime() : NaN;
      if (Number.isNaN(at) || at < now.getTime()) continue;
      if (!best || at < best.at) best = { at, company: a.company };
    }
  }
  return best?.company;
}

export function targetReadiness(target: Target, input: ReadinessInput): TargetReadiness {
  const { targets, stories, applications, reps, now } = input;
  const mine = reps.filter((r) => repTargetId(r, applications, targets) === target.id);
  const open = applications.filter((a) => a.status !== "closed" && applicationTarget(a, targets)?.id === target.id);

  // The pitch: one count per question answered, however many tries it took; follow-ups are left out.
  const pitchReps = mine.filter((r) => PITCH_TYPES.has(r.question_type) && !r.follow_up);
  const pitchCount = new Set(pitchReps.map((r) => `${r.session_id}|${r.question_id}`)).size;
  const pitch: ReadinessRow =
    pitchCount === 0
      ? { id: "pitch", ok: false, title: "Pitch not practiced yet", detail: "the first thing to fix" }
      : { id: "pitch", ok: true, title: `Pitch practiced ${pitchCount === 1 ? "once" : `${pitchCount} times`}`, detail: `last on ${dayLabel(latest(pitchReps.map((r) => r.recorded_at)))}` };

  const lead = leadStories(target, stories);
  const verified = lead.filter((s) => s.verified).length;
  const stor: ReadinessRow =
    lead.length === 0
      ? { id: "stories", ok: false, title: "No lead stories yet", detail: "pin up to three to put them first" }
      : { id: "stories", ok: verified === lead.length, title: "Lead stories verified", detail: `${verified} of ${lead.length}` };

  // The last Mock, and how many of the must-say points of this target's open applications have been said in a Mock.
  const mocks = mine.filter((r) => r.mode === "mock");
  let mock: ReadinessRow;
  if (mocks.length === 0) {
    const company = nextCaller(open, now);
    mock = { id: "mock", ok: false, title: "No Mock yet", detail: company ? `${company} could call any day` : "try one before an interview" };
  } else {
    const last = mocks.reduce((a, b) => (b.recorded_at > a.recorded_at ? b : a));
    const points = open.flatMap((a) => a.resume?.mustSay ?? []);
    const said = points.filter((m) => /^said/i.test(m.said.trim())).length;
    mock = { id: "mock", ok: true, title: `Last Mock, ${dayLabel(last.started || last.recorded_at)}`, detail: points.length > 0 ? `said ${said} of ${points.length} must-say points` : "no must-say points to check yet" };
  }

  const gaps = gapsOf(open);
  const names = [...new Set(gaps.map((g) => g.text))];
  const companies = [...new Set(gaps.map((g) => g.app.company))];
  const gapRow: ReadinessRow =
    gaps.length === 0
      ? { id: "gaps", ok: true, title: "No open gaps", detail: "" }
      : { id: "gaps", ok: false, title: `${gaps.length} open ${gaps.length === 1 ? "gap" : "gaps"}`, detail: names.length <= 2 ? names.join(", ") : `from ${companies.join(", ")}` };

  const action: ReadinessAction =
    pitchCount === 0 || gaps.length === 0
      ? { kind: "pitch", label: "Practice the pitch", primary: pitchCount === 0 }
      : { kind: "gap", label: "Practice a gap", primary: false, applicationId: gaps[0].app.id };

  return { target, rows: [pitch, stor, mock, gapRow], action };
}

/** What Start a session opens with for a readiness action. The pitch is asked at the first call; a gap opens its application. */
export function presetFor(action: ReadinessAction): SessionPreset {
  return action.kind === "gap" && action.applicationId ? { mode: "drill", source: "application", applicationId: action.applicationId } : { mode: "drill", source: "stage", stage: "recruiter" };
}
