// Habit tracking (Build Plan, "Habit tracking"): what each habit's pass rate is, whether fixes stick on the second try,
// when a habit has graduated, the streak, and what a finished session says. Pure functions over the compact rep
// summaries the backend lists; every score keeps the rubric version it was made under, so history is never rewritten.

import type { Habit, HabitId, HabitStat, SessionSummary, Streak } from "../data/types";

export interface CheckSummary {
  id: string;
  /** null when the check did not apply to that answer. */
  passed: boolean | null;
  evidence: string;
  sentences: number[];
  seconds: number | null;
}

export interface RepSummary {
  session_id: string;
  mode: string;
  stage: string;
  application_id: string | null;
  started: string;
  n: number;
  question_id: string;
  question_text: string;
  question_type: string;
  attempt: number;
  follow_up: boolean;
  recorded_at: string;
  rubric_version: number;
  fix: string | null;
  note: string | null;
  note_was_wrong: boolean;
  checks: CheckSummary[];
  speaking_ms: number;
  fillers: number;
  tail_ms: number | null;
  ai_cost_usd: number | null;
}

/** Last N first attempts a pass rate looks at. */
export const WINDOW = 20;
/** No trend until this many answers exist for a habit. */
export const MIN_FOR_TREND = 5;
/** A habit graduates when it passes this many of its last GRADUATION_OF answers (a placeholder until M5). */
export const GRADUATION_PASSES = 8;
export const GRADUATION_OF = 10;

/** A habit passes on a rep when every one of its criteria that applied passed. null when none applied. */
export function habitResult(habit: Habit, rep: RepSummary): boolean | null {
  const results = habit.criteria.map((id) => rep.checks.find((c) => c.id === id)?.passed ?? null).filter((r): r is boolean => r !== null);
  if (results.length === 0) return null;
  return results.every(Boolean);
}

const byTime = (a: RepSummary, b: RepSummary) => (a.recorded_at < b.recorded_at ? -1 : a.recorded_at > b.recorded_at ? 1 : a.n - b.n);

/** First attempts at a question (not retries, not follow-ups), oldest first. */
export function firstTries(reps: RepSummary[]): RepSummary[] {
  return reps.filter((r) => r.attempt === 1 && !r.follow_up && r.checks.length > 0).sort(byTime);
}

/** The first attempts a habit applies to, with its result on each, oldest first. */
function applicable(habit: Habit, reps: RepSummary[]): { rep: RepSummary; pass: boolean }[] {
  return firstTries(reps).flatMap((rep) => {
    const pass = habitResult(habit, rep);
    return pass === null ? [] : [{ rep, pass }];
  });
}

/** Passes out of the last 20 first attempts. */
export function firstTryStat(habit: Habit, reps: RepSummary[]): [number, number] {
  const last = applicable(habit, reps).slice(-WINDOW);
  return [last.filter((x) => x.pass).length, last.length];
}

/** Of the answers whose top fix was this habit's, how many passed it on the next attempt at the same question. */
export function retryStat(habit: Habit, reps: RepSummary[]): [number, number] {
  let fixed = 0;
  let total = 0;
  for (const r of reps.filter((x) => x.attempt === 1 && !x.follow_up && x.fix && habit.criteria.includes(x.fix))) {
    const next = reps.find((x) => x.session_id === r.session_id && x.question_id === r.question_id && x.attempt === 2 && !x.follow_up);
    if (!next) continue;
    total += 1;
    if (habitResult(habit, next) === true) fixed += 1;
  }
  return [fixed, total];
}

export function graduated(habit: Habit, reps: RepSummary[]): boolean {
  const last = applicable(habit, reps).slice(-GRADUATION_OF);
  return last.length === GRADUATION_OF && last.filter((x) => x.pass).length >= GRADUATION_PASSES;
}

/** A trend only means something once there are five answers to read it from. */
export const trendReady = (habit: Habit, reps: RepSummary[]) => applicable(habit, reps).length >= MIN_FOR_TREND;

/** Dates where the rubric changed between one answer and the next, so a trend can mark the change. */
export function rubricChanges(reps: RepSummary[]): string[] {
  const sorted = [...reps].sort(byTime);
  const out: string[] = [];
  for (let i = 1; i < sorted.length; i++) if (sorted[i].rubric_version !== sorted[i - 1].rubric_version) out.push(sorted[i].recorded_at);
  return out;
}

/** "Not sure yet" in setup: after 5 answers, the habits with the lowest first-try pass rate (ties in table order). */
export function pickFocusHabits(habits: Habit[], reps: RepSummary[], count = 1): HabitId[] {
  const rated = habits
    .map((h, order) => ({ h, order, applies: applicable(h, reps).length, stat: firstTryStat(h, reps) }))
    .filter((x) => x.applies >= MIN_FOR_TREND)
    .map((x) => ({ ...x, rate: x.stat[0] / x.stat[1] }));
  rated.sort((a, b) => a.rate - b.rate || a.order - b.order);
  return rated.slice(0, count).map((x) => x.h.id);
}

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** Days practised in a row ending today (or yesterday: the streak is not lost until a whole day is missed), and totals. */
export function streakOf(reps: RepSummary[], now: Date): Streak {
  const days = new Set(reps.map((r) => dayKey(r.recorded_at)));
  let daysInARow = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(dayKey(cursor.toISOString()))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor.toISOString()))) {
    daysInARow += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  const answers = reps.filter((r) => !r.follow_up).length;
  const questions = new Set(reps.filter((r) => !r.follow_up).map((r) => `${r.session_id}/${r.question_id}`)).size;
  return { daysInARow, answers, questions, followUps: reps.filter((r) => r.follow_up).length };
}

/** The small note under a habit on Home and Progress. */
function habitNote(first: [number, number], retry: [number, number], isGraduated: boolean, ready: boolean): string {
  if (isGraduated) return "Graduated. This one has stuck.";
  if (!ready) return "A few more answers and the trend shows.";
  if (retry[1] > 0) return `Fixes stick on the second try ${retry[0]} out of ${retry[1]} times.`;
  const left = GRADUATION_PASSES - first[0];
  return left > 0 && first[1] >= GRADUATION_OF ? "Still getting there." : "Keep going.";
}

/** One entry per habit, in the habit table's order, as Home and Progress show them. */
export function habitStats(habits: Habit[], reps: RepSummary[]): HabitStat[] {
  return habits.map((h) => {
    const first = firstTryStat(h, reps);
    const retry = retryStat(h, reps);
    const isGraduated = graduated(h, reps);
    const stat: HabitStat = { id: h.id, firstTry: first, note: habitNote(first, retry, isGraduated, trendReady(h, reps)) };
    if (retry[1] > 0) stat.retry = retry;
    if (isGraduated) stat.graduated = true;
    return stat;
  });
}

// ---------- the sessions list ----------

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export const STAGE_LABELS: Record<string, string> = { recruiter: "Recruiter", hiring_manager: "Hiring manager", leadership: "Leadership", panel: "Panel", technical: "Technical" };

/** "Today, 9:12 PM", "Yesterday", "Mon, Oct 19". */
export function whenText(iso: string, now: Date): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY);
  if (days === 0) return `Today, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** Fixes that stuck: answers whose top fix passed on the next attempt at the same question, in one session. */
export function fixesStuck(reps: RepSummary[]): { stuck: number; of: number } {
  let stuck = 0;
  let of = 0;
  for (const r of reps.filter((x) => x.attempt === 1 && !x.follow_up && x.fix)) {
    const next = reps.find((x) => x.session_id === r.session_id && x.question_id === r.question_id && x.attempt === 2 && !x.follow_up);
    if (!next) continue;
    of += 1;
    if (next.checks.find((c) => c.id === r.fix)?.passed === true) stuck += 1;
  }
  return { stuck, of };
}

/** One row per session for the sessions list, newest first. */
export function sessionList(reps: RepSummary[], now: Date, companyOf: (applicationId: string) => string | undefined): SessionSummary[] {
  const bySession = new Map<string, RepSummary[]>();
  for (const r of reps) bySession.set(r.session_id, [...(bySession.get(r.session_id) ?? []), r]);
  return [...bySession.entries()]
    .map(([id, rs]) => {
      const first = rs[0];
      const stage = STAGE_LABELS[first.stage] ?? first.stage;
      const company = first.application_id ? companyOf(first.application_id) : undefined;
      const { stuck } = fixesStuck(rs);
      const answered = rs.filter((r) => !r.follow_up).length;
      const row: SessionSummary = {
        id,
        when: whenText(first.started, now),
        group: now.getTime() - new Date(first.started).getTime() < 7 * DAY ? "This week" : "Last week",
        mode: first.mode === "mock" ? "mock" : "drill",
        title: `${stage} · ${company ?? "general questions"}`,
        headline: stuck > 0 ? `${stuck} fix${stuck === 1 ? "" : "es"} stuck` : `${answered} answer${answered === 1 ? "" : "s"}`,
        ...(first.application_id ? { applicationId: first.application_id } : {}),
      };
      return { row, started: first.started };
    })
    .sort((a, b) => (a.started < b.started ? 1 : -1))
    .map((x) => x.row);
}

// ---------- one finished session ----------

import type { FullRep } from "./types";

/** A rep loaded with its words (`load_session`) as the compact summary the habit functions read, plus what was said. */
export function summaryOfFull(r: FullRep, session: { mode: string; stage: string; application_id: string | null; started: string }): RepSummary & { text: string } {
  return {
    session_id: r.session_id,
    mode: session.mode,
    stage: session.stage,
    application_id: session.application_id,
    started: session.started,
    n: r.n,
    question_id: r.question_id,
    question_text: r.question_text,
    question_type: r.question_type,
    attempt: r.attempt,
    follow_up: r.follow_up !== null,
    recorded_at: r.recorded_at,
    rubric_version: r.metrics.rubric_version,
    fix: r.fix,
    note: r.note,
    note_was_wrong: r.feedback?.note_was_wrong ?? false,
    checks: r.metrics.checks,
    speaking_ms: r.metrics.speaking_ms,
    fillers: r.metrics.fillers.count,
    tail_ms: r.metrics.proof.tail_ms,
    ai_cost_usd: r.ai?.cost_usd ?? null,
    text: r.metrics.sentences.map((s) => s.text).join(" "),
  };
}

export type FocusKind = "seconds" | "flags";

export interface DrillQuestion {
  id: string;
  /** In the focus habit's unit (seconds) for "seconds" habits; 1 when it passed and 0 when it did not for "flags". */
  firstTry: number;
  bestTry: number;
}

export interface DrillView {
  applicationId: string | null;
  stage: string;
  focusHabitId: HabitId;
  kind: FocusKind;
  /** Target in seconds for "seconds" habits. */
  targetSeconds: number;
  chartMaxSeconds: number;
  questions: DrillQuestion[];
  fixes: { stuck: number; of: number };
  /** null when the session had no answer to show. */
  best: { question: string; attempt: number; pointAtSeconds: number; note: string; spoken: string; sessionId: string; n: number } | null;
  nextTime: { habitId: HabitId; keptGoingSeconds: number; advice: string };
  totals: { answers: number; followUps: number; costCents: number };
  /** A habit that reached the graduation line during this session, if any. */
  graduatedHabit: HabitId | null;
}

const ADVICE: Record<HabitId, string> = {
  to_the_point: "Open with the result, then tell the story.",
  clean_stop: "Try ending on the number.",
  numbers: "Say the number out loud, not just the result.",
  ownership: 'Say what you decided, with "I".',
  why_first: "Say why before you say what you built.",
  method_first: "Open with how you handle this kind of problem.",
  conviction: "Say it without the hedge.",
  fillers: "Pause instead of filling the gap.",
};

const SECONDS_HABITS: Partial<Record<HabitId, { check: string; target: number }>> = { to_the_point: { check: "time_to_point", target: 10 }, clean_stop: { check: "clean_stop", target: 15 } };

/** Seconds on the focus habit's clock for one answer (time to point, time after the number), or null when it has none. */
export const habitSeconds = (r: RepSummary, habitId: HabitId): number | null => secondsOf(r, habitId);

const secondsOf = (r: RepSummary, habitId: HabitId): number | null => {
  const spec = SECONDS_HABITS[habitId];
  if (!spec) return null;
  return r.checks.find((c) => c.id === spec.check)?.seconds ?? null;
};

/** What a finished Drill says (Build Plan, "Session results"): the delta on the focus habit, what stuck, the best answer,
 *  and the one habit to carry. `session` is this session's answers; `all` is every answer ever, for graduation. */
export function drillView(habits: Habit[], session: (RepSummary & { text?: string })[], all: RepSummary[], focusHabits: HabitId[]): DrillView | null {
  const scored = session.filter((r) => r.checks.length > 0);
  if (scored.length === 0) return null;
  const firsts = scored.filter((r) => r.attempt === 1 && !r.follow_up);
  const failures = (h: Habit) => firsts.filter((r) => habitResult(h, r) === false).length;
  const inSession = (h: Habit) => firsts.some((r) => habitResult(h, r) !== null);
  const focus = habits.find((h) => focusHabits.includes(h.id) && inSession(h)) ?? [...habits].filter(inSession).sort((a, b) => failures(b) - failures(a))[0] ?? habits[0];
  const spec = SECONDS_HABITS[focus.id];
  const questionIds = [...new Set(firsts.map((r) => r.question_id))];
  const questions: DrillQuestion[] = questionIds.map((id) => {
    const tries = scored.filter((r) => r.question_id === id && !r.follow_up).sort((a, b) => a.attempt - b.attempt);
    if (spec) {
      const secs = tries.map((r) => secondsOf(r, focus.id)).filter((s): s is number => s !== null);
      return { id, firstTry: secs[0] ?? 0, bestTry: secs.length ? Math.min(...secs) : 0 };
    }
    const results = tries.map((r) => (habitResult(focus, r) ? 1 : 0));
    return { id, firstTry: results[0] ?? 0, bestTry: results.length ? Math.max(...results) : 0 };
  });

  const done = scored.filter((r) => !r.follow_up);
  const passCount = (r: RepSummary) => r.checks.filter((c) => c.passed === false).length;
  const best = [...done].sort((a, b) => passCount(a) - passCount(b) || (a.recorded_at < b.recorded_at ? 1 : -1))[0];
  const pointCheck = best?.checks.find((c) => c.id === "time_to_point");
  const notes = [best?.checks.find((c) => c.id === "clean_stop")?.passed ? "stopped right after the result" : "", best?.checks.find((c) => c.id === "proof")?.passed ? "said your number" : ""].filter(Boolean);

  const carry = habits.filter((h) => h.id !== focus.id && inSession(h)).sort((a, b) => failures(b) - failures(a))[0] ?? focus;
  const tails = firsts.map((r) => r.tail_ms).filter((t): t is number => t !== null);
  const sessionId = scored[0].session_id;
  const before = all.filter((r) => r.session_id !== sessionId && r.recorded_at < scored[0].recorded_at);
  const graduatedHabit = habits.find((h) => graduated(h, all) && !graduated(h, before))?.id ?? null;

  return {
    applicationId: scored[0].application_id,
    stage: scored[0].stage,
    focusHabitId: focus.id,
    kind: spec ? "seconds" : "flags",
    targetSeconds: spec?.target ?? 0,
    chartMaxSeconds: Math.max(60, ...questions.flatMap((q) => [q.firstTry, q.bestTry])),
    questions,
    fixes: fixesStuck(scored),
    best: best ? { question: best.question_text, attempt: best.attempt, pointAtSeconds: pointCheck?.seconds ?? 0, note: notes.join(" and ") || "that is the one to keep", spoken: (best as { text?: string }).text ?? "", sessionId: best.session_id, n: best.n } : null,
    nextTime: { habitId: carry.id, keptGoingSeconds: tails.length ? Math.round(tails.reduce((a, b) => a + b, 0) / tails.length / 1000) : 0, advice: ADVICE[carry.id] },
    totals: { answers: done.length, followUps: scored.filter((r) => r.follow_up).length, costCents: Math.round(scored.reduce((s, r) => s + (r.ai_cost_usd ?? 0), 0) * 100) },
    graduatedHabit,
  };
}

/** The last ten first-attempt results for a habit, oldest first, for the graduation dots. */
export function lastTenResults(habit: Habit, reps: RepSummary[]): boolean[] {
  return applicable(habit, reps).slice(-GRADUATION_OF).map((x) => x.pass);
}

/** The habits still worth working on after one graduates: those not graduated, lowest pass rate first. */
export function nextHabitChoices(habits: Habit[], reps: RepSummary[], justGraduated: HabitId): { choices: HabitId[]; suggested: HabitId } {
  const open = habits.filter((h) => h.id !== justGraduated && !graduated(h, reps));
  const ranked = [...open].sort((a, b) => {
    const [ap, at] = firstTryStat(a, reps);
    const [bp, bt] = firstTryStat(b, reps);
    return (at ? ap / at : 1) - (bt ? bp / bt : 1);
  });
  const choices = ranked.slice(0, 4).map((h) => h.id);
  return { choices, suggested: choices[0] ?? justGraduated };
}
