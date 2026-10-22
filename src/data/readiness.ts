// How ready each target is, in four plain lines (Settings, Targets and Progress): the pitch, the lead stories, the last
// Mock and the gaps the postings found, plus the one thing to do next. Pure: the screen hands in what the store holds. Answers saved before targets carry no target,
// so an answer belongs to its own target, else the application's, else the first target.

import type { RepSummary } from "../practice/habits";
import type { SessionPreset } from "../screens/home/preset";
import { applicationTarget, visibleStories } from "./targets";
import type { Application, Story, Target } from "./types";

export interface ReadinessLine {
  id: "pitch" | "stories" | "mock" | "gaps";
  /** A green tick when true, a grey one when not. */
  ok: boolean;
  title: string;
  detail: string;
}

export type ReadinessAction = { kind: "pitch" | "gap"; label: string; primary: boolean; applicationId?: string };

export interface Readiness {
  target: Target;
  lines: ReadinessLine[];
  /** The one thing to do next: practice the pitch when it is the thing to fix, else a gap when there is one. */
  action: ReadinessAction;
  /** The companies of this target's applications that are still open, in the order the store keeps them. */
  applications: string[];
}

export interface ReadinessInput {
  /** Every target, archived ones included: the first one is where old answers belong. */
  targets: Target[];
  stories: Story[];
  applications: Application[];
  reps: RepSummary[];
  now?: Date;
}

const PITCH_TYPES = new Set(["tell_me_about_yourself", "about_you"]);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 19" from a saved date-time, or "" when it is not one. Read as written, with no time zone shift. */
export function dateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : "";
}

/** The target an answer was practised for. */
export function repTargetId(rep: Pick<RepSummary, "target_id" | "application_id">, applications: Pick<Application, "id" | "targetId">[], targets: Target[]): string | undefined {
  if (rep.target_id) return rep.target_id;
  const app = rep.application_id ? applications.find((a) => a.id === rep.application_id) : undefined;
  if (app) return applicationTarget(app, targets)?.id;
  return targets.find((t) => !t.archived)?.id ?? targets[0]?.id;
}

const latest = (isos: string[]) => isos.reduce((a, b) => (a > b ? a : b), "");

/** The stories a target leads with: the ones pinned for it, or with none pinned the first three it uses. Hidden ones never count. */
export function leadStories(target: Pick<Target, "pinnedStoryIds" | "hiddenStoryIds">, stories: Story[]): Story[] {
  const shown = visibleStories(stories, target);
  const pinned = shown.filter((s) => target.pinnedStoryIds.includes(s.id));
  return pinned.length > 0 ? pinned : shown.slice(0, 3);
}

/** The earliest upcoming interview among these applications, for "try one before X calls". */
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

export function targetReadiness(target: Target, input: ReadinessInput): Readiness {
  const { targets, stories, applications, reps } = input;
  const now = input.now ?? new Date();
  const mine = reps.filter((r) => repTargetId(r, applications, targets) === target.id);
  const open = applications.filter((a) => a.status !== "closed" && applicationTarget(a, targets)?.id === target.id);

  // The pitch: one count per question answered, however many tries it took; follow-ups are left out.
  const pitchReps = mine.filter((r) => PITCH_TYPES.has(r.question_type) && !r.follow_up);
  const pitchCount = new Set(pitchReps.map((r) => `${r.session_id}|${r.question_id}`)).size;
  const pitch: ReadinessLine =
    pitchCount === 0
      ? { id: "pitch", ok: false, title: "Pitch not practiced yet", detail: "the first thing to fix" }
      : { id: "pitch", ok: true, title: `Pitch practiced ${pitchCount === 1 ? "once" : `${pitchCount} times`}`, detail: `last on ${dateLabel(latest(pitchReps.map((r) => r.recorded_at)))}` };

  const lead = leadStories(target, stories);
  const verified = lead.filter((s) => s.verified).length;
  const leadLine: ReadinessLine =
    lead.length === 0
      ? { id: "stories", ok: false, title: "No lead stories yet", detail: "pin up to three to put them first" }
      : { id: "stories", ok: verified === lead.length, title: "Lead stories verified", detail: `${verified} of ${lead.length}` };

  // The last Mock, and how many of the must-say points of this target's open applications have been said in a Mock.
  const mocks = mine.filter((r) => r.mode === "mock");
  let mock: ReadinessLine;
  if (mocks.length === 0) {
    const company = nextCaller(open, now);
    mock = { id: "mock", ok: false, title: "No Mock yet", detail: company ? `${company} could call any day` : "try one before an interview" };
  } else {
    const last = mocks.reduce((a, b) => (b.recorded_at > a.recorded_at ? b : a));
    const points = open.flatMap((a) => a.resume?.mustSay ?? []);
    const said = points.filter((m) => /^said/i.test(m.said.trim())).length;
    mock = { id: "mock", ok: true, title: `Last Mock, ${dateLabel(last.started || last.recorded_at)}`, detail: points.length > 0 ? `said ${said} of ${points.length} must-say points` : "no must-say points to check yet" };
  }

  // The gaps the postings of this target's open applications found.
  const gapList = open.flatMap((a) => (a.analysis?.gaps ?? []).map((text) => ({ text, app: a })));
  const names = [...new Set(gapList.map((g) => g.text))];
  const companies = [...new Set(gapList.map((g) => g.app.company))];
  const gaps: ReadinessLine =
    gapList.length === 0
      ? { id: "gaps", ok: true, title: "No open gaps", detail: "" }
      : { id: "gaps", ok: false, title: `${gapList.length} open ${gapList.length === 1 ? "gap" : "gaps"}`, detail: names.length <= 2 ? names.join(", ") : `from ${companies.join(", ")}` };

  const action: ReadinessAction =
    pitchCount === 0 || gapList.length === 0
      ? { kind: "pitch", label: "Practice the pitch", primary: pitchCount === 0 }
      : { kind: "gap", label: "Practice a gap", primary: false, applicationId: gapList[0].app.id };

  return { target, lines: [pitch, leadLine, mock, gaps], action, applications: open.map((a) => a.company) };
}

/** What Start a session opens with for a readiness action. The pitch is asked at the first call; a gap opens its application. */
export function presetFor(action: ReadinessAction): SessionPreset {
  return action.kind === "gap" && action.applicationId ? { mode: "drill", source: "application", applicationId: action.applicationId } : { mode: "drill", source: "stage", stage: "recruiter" };
}

/** What an archived target still holds, for "2 applications and 6 sessions kept". */
export function keptCounts(target: Target, input: Pick<ReadinessInput, "targets" | "applications" | "reps">): { applications: number; sessions: number } {
  const applications = input.applications.filter((a) => applicationTarget(a, input.targets)?.id === target.id).length;
  const sessions = new Set(input.reps.filter((r) => repTargetId(r, input.applications, input.targets) === target.id).map((r) => r.session_id)).size;
  return { applications, sessions };
}

/** "2 applications and 6 sessions kept", "1 session kept", or "nothing to keep" when it is empty. */
export function keptLine({ applications, sessions }: { applications: number; sessions: number }): string {
  const parts = [applications > 0 ? `${applications} ${applications === 1 ? "application" : "applications"}` : "", sessions > 0 ? `${sessions} ${sessions === 1 ? "session" : "sessions"}` : ""].filter(Boolean);
  return parts.length ? `${parts.join(" and ")} kept` : "nothing in it yet";
}
