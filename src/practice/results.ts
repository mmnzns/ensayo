// What the results screens show for one finished session, from the saved answers (pure; see habits.ts for the math).

import type { DrillResultsData, GraduationData } from "../data/screens/results";
import type { Habit, HabitId } from "../data/types";
import type { SessionDetail } from "./api";
import { drillView, firstTries, habitSeconds, lastTenResults, nextHabitChoices, STAGE_LABELS, summaryOfFull, type RepSummary } from "./habits";

const PASS_LINE: Record<HabitId, string> = {
  to_the_point: "opened with the point.",
  clean_stop: "stopped right after the result.",
  numbers: "had the number in them.",
  ownership: "said what you decided.",
  why_first: "said why before what.",
  method_first: "opened with how you handle it.",
  conviction: "were said without the hedge.",
  fillers: "stayed clear of filler words.",
};

const DAY = 86_400_000;

/** "Today", "Three days ago", "Three weeks ago". */
export function agoText(iso: string, now: Date): string {
  const days = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / DAY));
  const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
  const word = (n: number) => WORDS[n] ?? String(n);
  if (days === 0) return "Earlier today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${word(days)} days ago`;
  const weeks = Math.round(days / 7);
  return weeks < 9 ? `${word(weeks)} weeks ago` : `${Math.round(days / 30)} months ago`;
}

export interface SessionResults {
  drill: DrillResultsData;
  /** Set when a habit reached the graduation line during this session. */
  graduation: GraduationData | null;
}

/** `history` is every saved answer (may be empty in the browser preview; the session's own answers stand in). */
export function resultsOfSession(habits: Habit[], detail: SessionDetail, history: RepSummary[], focusHabits: HabitId[], now: Date): SessionResults | null {
  const own = detail.reps.map((r) => summaryOfFull(r, detail.session));
  const all = history.some((r) => r.session_id === detail.session.id) ? history : [...history, ...own];
  const view = drillView(habits, own, all, focusHabits);
  if (!view) return null;

  const drill: DrillResultsData = {
    kind: view.kind,
    applicationId: view.applicationId ?? "",
    stageLabel: STAGE_LABELS[view.stage] ?? view.stage,
    focusHabitId: view.focusHabitId,
    targetSeconds: view.targetSeconds,
    chartMaxSeconds: view.chartMaxSeconds,
    questions: view.questions,
    fixes: view.fixes,
    bestAnswer: view.best
      ? { question: view.best.question, attempt: view.best.attempt, pointAtSeconds: view.best.pointAtSeconds, note: view.best.note, spoken: view.best.spoken }
      : { question: "", attempt: 1, pointAtSeconds: 0, note: "", spoken: "" },
    ...(view.best ? { bestFrom: { sessionId: view.best.sessionId, n: view.best.n } } : {}),
    nextTime: view.nextTime,
    totals: view.totals,
  };

  let graduation: GraduationData | null = null;
  if (view.graduatedHabit) {
    const habit = habits.find((h) => h.id === view.graduatedHabit)!;
    const clock = firstTries(all)
      .map((r) => ({ at: r.recorded_at, s: habitSeconds(r, habit.id) }))
      .filter((x): x is { at: string; s: number } => x.s !== null);
    const { choices, suggested } = nextHabitChoices(habits, all, habit.id);
    graduation = {
      habitId: habit.id,
      results: lastTenResults(habit, all),
      passLine: PASS_LINE[habit.id],
      before: clock.length > 1 ? { when: agoText(clock[0].at, now), seconds: Math.round(clock[0].s) } : null,
      nowSeconds: clock.length > 1 ? Math.round(clock[clock.length - 1].s) : null,
      nextChoices: choices,
      suggestedNextId: suggested,
    };
  }
  return { drill, graduation };
}
