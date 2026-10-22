// How ready each target is, in four plain lines (Settings, Targets): the pitch, the lead stories, the last Mock and the
// gaps the postings found. Pure: the screen hands in what the store holds. Answers saved before targets carry no target,
// so an answer belongs to its own target, else the application's, else the first target.

import type { RepSummary } from "../practice/habits";
import { applicationTarget } from "./targets";
import type { Application, Story, Target } from "./types";

export interface ReadinessLine {
  id: "pitch" | "stories" | "mock" | "gaps";
  /** A green tick when true, a grey one when not. */
  ok: boolean;
  title: string;
  detail: string;
}

export interface Readiness {
  lines: ReadinessLine[];
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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 19" from a saved date-time, or "" when it is not one. Read as written, with no time zone shift. */
export function dateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : "";
}

/** The target an answer was practised for. */
export function repTargetId(rep: Pick<RepSummary, "target_id" | "application_id">, applications: Application[], targets: Target[]): string | undefined {
  if (rep.target_id) return rep.target_id;
  const app = rep.application_id ? applications.find((a) => a.id === rep.application_id) : undefined;
  if (app) return applicationTarget(app, targets)?.id;
  return targets.find((t) => !t.archived)?.id ?? targets[0]?.id;
}

const latest = (isos: string[]) => isos.reduce((a, b) => (a > b ? a : b), "");

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
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
  const mine = reps.filter((r) => repTargetId(r, applications, targets) === target.id);
  const apps = applications.filter((a) => applicationTarget(a, targets)?.id === target.id);
  const open = apps.filter((a) => a.status !== "closed");

  // The pitch: one count per question answered, however many tries it took, follow-ups left out.
  const pitchReps = mine.filter((r) => r.question_type === "tell_me_about_yourself" && !r.follow_up);
  const pitchCount = new Set(pitchReps.map((r) => `${r.session_id}|${r.question_id}`)).size;
  const pitch: ReadinessLine =
    pitchCount === 0
      ? { id: "pitch", ok: false, title: "Pitch not practiced yet", detail: "start here" }
      : { id: "pitch", ok: true, title: `Pitch practiced ${pitchCount === 1 ? "once" : `${pitchCount} times`}`, detail: `last on ${dateLabel(latest(pitchReps.map((r) => r.recorded_at)))}` };

  // The lead stories: the ones pinned, or with nothing pinned the stories in use, hidden ones never counted.
  const pinned = target.pinnedStoryIds.flatMap((id) => stories.filter((s) => s.id === id));
  const lead = pinned.length > 0 ? pinned : stories.filter((s) => !target.hiddenStoryIds.includes(s.id) && s.usage.practiced > 0);
  const verified = lead.filter((s) => s.verified).length;
  const leadLine: ReadinessLine =
    lead.length === 0
      ? { id: "stories", ok: false, title: "No lead stories yet", detail: "pin up to three to put them first" }
      : { id: "stories", ok: verified === lead.length, title: "Lead stories verified", detail: `${verified} of ${lead.length}` };

  // The last Mock, and how many of its application's must-say points were said.
  const mocks = mine.filter((r) => r.mode === "mock");
  let mock: ReadinessLine;
  if (mocks.length === 0) {
    const company = nextCaller(open, input.now ?? new Date());
    mock = { id: "mock", ok: false, title: "No Mock yet", detail: company ? `try one before ${company} calls` : "try one before an interview" };
  } else {
    const lastRep = mocks.reduce((a, b) => (b.recorded_at > a.recorded_at ? b : a));
    const sayList = applications.find((a) => a.id === lastRep.application_id)?.resume?.mustSay ?? [];
    const said = sayList.filter((m) => /^said/i.test(m.said.trim())).length;
    mock = { id: "mock", ok: true, title: `Last Mock, ${dateLabel(lastRep.started || lastRep.recorded_at)}`, detail: sayList.length > 0 ? `said ${said} of ${sayList.length} must-say points` : "" };
  }

  // The gaps the postings of this target's open applications found.
  const withGaps = open.filter((a) => (a.analysis?.gaps.length ?? 0) > 0);
  const gapCount = withGaps.reduce((n, a) => n + (a.analysis?.gaps.length ?? 0), 0);
  const gaps: ReadinessLine =
    gapCount === 0
      ? { id: "gaps", ok: true, title: "No open gaps", detail: "" }
      : { id: "gaps", ok: false, title: `${gapCount} open ${gapCount === 1 ? "gap" : "gaps"}`, detail: `from ${joinNames(withGaps.map((a) => a.company))}` };

  return { lines: [pitch, leadLine, mock, gaps], applications: open.map((a) => a.company) };
}
