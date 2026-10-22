// What practising inside an application needs from the application, as pure functions: which stage to practise, what the
// consistency check says in plain words, the flags a Mock shows, and what the debrief is told about the posting. The
// screens and live.ts only call these.

import type { ConsistencyFlag } from "../data/screens/results";
import type { Application, ProcessStage } from "../data/types";
import type { MustSayItem } from "./debrief";
import type { Check, FullRep } from "./types";

/** The stage to practise next: the application's current stage while it is open, else the first open one in order. */
export function nextOpenStage(app: Application): ProcessStage | undefined {
  const open = [...app.process].filter((s) => !s.done).sort((a, b) => a.order - b.order);
  return open.find((s) => s.id === app.current_stage_id) ?? open[0];
}

/** A stage's date as the backend keeps it: "2026-10-23T14:00" (seconds allowed), or just "2026-10-23" while no time is set. Read as local time either way. */
export function stageWhen(at: string | undefined): { date: Date; hasTime: boolean } | null {
  const m = at ? /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(at.trim()) : null;
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : 0, m[5] ? Number(m[5]) : 0, m[6] ? Number(m[6]) : 0);
  return Number.isNaN(date.getTime()) ? null : { date, hasTime: m[4] !== undefined };
}

export interface PracticeTarget {
  application: Application;
  stage: ProcessStage;
  /** When that stage is, when it has a date. */
  when: { date: Date; hasTime: boolean } | null;
}

/** The earliest upcoming stage with a date across open applications. A stage with a date and no time stays upcoming through that day. */
export function nextDated(apps: Application[], now: Date): (PracticeTarget & { when: { date: Date; hasTime: boolean } }) | undefined {
  let best: (PracticeTarget & { when: { date: Date; hasTime: boolean } }) | undefined;
  for (const application of apps) {
    if (application.status === "closed") continue;
    for (const stage of application.process) {
      const when = stageWhen(stage.at);
      if (stage.done || !when) continue;
      const over = when.hasTime ? when.date : new Date(when.date.getFullYear(), when.date.getMonth(), when.date.getDate() + 1);
      if (over < now) continue;
      if (!best || when.date < best.when.date) best = { application, stage, when };
    }
  }
  return best;
}

/** What a session "from an application" practises: what a button asked for (an application, and a stage when it names one), else the nearest interview, else the open application added most recently. */
export function practiceTarget(apps: Application[], now: Date, want: { applicationId?: string; stageId?: string } = {}): PracticeTarget | undefined {
  const asked = want.applicationId ? apps.find((a) => a.id === want.applicationId) : undefined;
  if (asked) {
    const stage = (want.stageId ? asked.process.find((s) => s.id === want.stageId) : undefined) ?? nextOpenStage(asked);
    if (stage) return { application: asked, stage, when: stageWhen(stage.at) };
  }
  const soonest = nextDated(apps, now);
  if (soonest) return soonest;
  const open = apps.filter((a) => a.status !== "closed" && nextOpenStage(a)).sort((a, b) => b.applied_on.localeCompare(a.applied_on));
  const application = open[0];
  const stage = application && nextOpenStage(application);
  return application && stage ? { application, stage, when: stageWhen(stage.at) } : undefined;
}

// ---------- the consistency check ----------

export const CONSISTENCY = "c1_consistent";

export interface ConsistencyNote {
  /** "recruiter stage", or "resume". */
  earlier: string;
  fromResume: boolean;
  earlierSaid: string;
  nowSaid: string;
}

// The backend writes the check's evidence as: In the recruiter stage you said "X". Here you said "Y".
// Or, for the resume: Your resume says "X". Here you said "Y". Several are joined with a space.
const EVIDENCE = /(?:In the ([a-z][a-z ]*?) stage you said|Your resume says) "(.*?)"\. Here you said "(.*?)"\./g;

/** The versions a failed consistency check found, read back from its evidence. */
export function consistencyNotes(check: Check | undefined): ConsistencyNote[] {
  if (!check || check.id !== CONSISTENCY || check.passed !== false) return [];
  return [...check.evidence.matchAll(EVIDENCE)].map((m) => ({
    earlier: m[1] ? `${m[1]} stage` : "resume",
    fromResume: m[1] === undefined,
    earlierSaid: m[2],
    nowSaid: m[3],
  }));
}

/** The check in plain words, one sentence pair per version: "In the recruiter stage you said X. Here you said Y." */
export function consistencySentences(check: Check | undefined): string[] {
  if (!check || check.id !== CONSISTENCY || check.passed !== false) return [];
  const notes = consistencyNotes(check);
  if (notes.length > 0) return notes.map((n) => `${n.fromResume ? "Your resume says" : `In the ${n.earlier} you said`} "${n.earlierSaid}". Here you said "${n.nowSaid}".`);
  return [check.evidence.trim() || "This sounded different from what you said before."];
}

export const consistencyCheckOf = (rep: FullRep | null | undefined): Check | undefined => rep?.metrics.checks.find((c) => c.id === CONSISTENCY);

/** A check this version of Ensayo has no wording for: its id as a short phrase ("c2_tone_match" is "Tone match"). */
export function unknownCheckLabel(id: string): string {
  const words = id.replace(/^[a-z]\d+_/, "").replace(/_/g, " ").trim() || id;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ---------- the Mock debrief ----------

const upperFirst = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const stageName = (n: ConsistencyNote) => (n.fromResume ? "resume" : n.earlier.replace(/ stage$/, ""));

/** One flag per version a Mock answer said differently, in the order they were said. Retries at a question do not repeat a flag. */
export function flagsOfReps(reps: FullRep[]): ConsistencyFlag[] {
  const seen = new Set<string>();
  const out: ConsistencyFlag[] = [];
  for (const r of [...reps].sort((a, b) => a.n - b.n)) {
    consistencyNotes(consistencyCheckOf(r)).forEach((n, i) => {
      const key = `${n.earlier}|${n.earlierSaid}|${n.nowSaid}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        id: `r${r.n}-${i}`,
        badge: "Said differently",
        earlierStage: stageName(n),
        earlierSaid: n.earlierSaid,
        nowSaid: n.nowSaid,
        keepLabel: `${upperFirst(n.nowSaid)} is right now`,
        keptNote: `Marked as updated. ${upperFirst(n.nowSaid)} is your answer from here on.`,
      });
    });
  }
  return out;
}

export interface DebriefContext {
  company: string;
  role: string;
  jdSummary: string;
  /** Priority titles, one per line. */
  priorities: string;
  mustSay: MustSayItem[];
}

/** What the debrief is told about the application: who it is for, what the posting said, and what the resume wants said out loud. */
export function debriefContext(app: Application): DebriefContext {
  return {
    company: app.company,
    role: app.role,
    jdSummary: app.analysis?.summary ?? "",
    priorities: (app.analysis?.priorities ?? []).map((p) => p.title).join("\n"),
    mustSay: (app.resume?.mustSay ?? []).map((m) => ({ id: m.id, text: m.text })),
  };
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The claim "X is right now" changes for a flag: the earlier version when it is in the application's log or on its resume, else the new one. Every version of the same thing is retired when it is marked, so either id names the same line. */
export function claimToUpdate(app: Application | undefined, flag: { earlierSaid: string; nowSaid: string }): string | undefined {
  if (!app) return undefined;
  const all = [...app.claims, ...(app.resume?.claims ?? [])];
  return (all.find((c) => same(c.value, flag.earlierSaid)) ?? all.find((c) => same(c.value, flag.nowSaid)))?.id;
}
