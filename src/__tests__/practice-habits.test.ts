import { describe, expect, it } from "vitest";
import { habits } from "../data/mock/habits";
import { firstTries, fixesStuck, graduated, habitResult, habitStats, pickFocusHabits, retryStat, rubricChanges, sessionList, streakOf, trendReady, whenText, type CheckSummary, type RepSummary } from "../practice/habits";

const chk = (id: string, passed: boolean | null, seconds: number | null = null): CheckSummary => ({ id, passed, evidence: "", sentences: [], seconds });
const H = (id: string) => habits.find((h) => h.id === id)!;

let counter = 0;
function rep(over: Partial<RepSummary> & { checks?: CheckSummary[] } = {}): RepSummary {
  counter += 1;
  return {
    session_id: "s1",
    mode: "drill",
    stage: "hiring_manager",
    application_id: null,
    started: "2026-10-20T10:00:00Z",
    n: counter,
    question_id: `q${counter}`,
    question_text: "Q",
    question_type: "behavioral",
    attempt: 1,
    follow_up: false,
    recorded_at: `2026-10-20T10:${String(counter % 60).padStart(2, "0")}:00Z`,
    rubric_version: 1,
    fix: null,
    note: null,
    note_was_wrong: false,
    checks: [chk("proof", true), chk("ownership", true)],
    speaking_ms: 50_000,
    fillers: 0,
    tail_ms: null,
    ai_cost_usd: null,
    ...over,
  };
}

describe("a habit on one answer", () => {
  it("passes when every criterion that applied passed, fails if one failed, and is not counted when none applied", () => {
    const toThePoint = H("to_the_point");
    expect(habitResult(toThePoint, rep({ checks: [chk("answer_first", true), chk("time_to_point", true)] }))).toBe(true);
    expect(habitResult(toThePoint, rep({ checks: [chk("answer_first", true), chk("time_to_point", false)] }))).toBe(false);
    expect(habitResult(toThePoint, rep({ checks: [chk("answer_first", true), chk("time_to_point", null)] }))).toBe(true);
    expect(habitResult(toThePoint, rep({ checks: [chk("proof", true)] }))).toBeNull();
  });
});

describe("pass rates", () => {
  it("count only first attempts at a question, not retries or follow-ups, in the last twenty", () => {
    const reps = [
      ...Array.from({ length: 25 }, (_, i) => rep({ checks: [chk("ownership", i >= 5)] })), // the first 5 fail, the last 20 pass
      rep({ attempt: 2, checks: [chk("ownership", false)] }),
      rep({ follow_up: true, checks: [chk("ownership", false)] }),
    ];
    expect(firstTries(reps)).toHaveLength(25);
    expect(habitStats(habits, reps).find((s) => s.id === "ownership")!.firstTry).toEqual([20, 20]);
  });

  it("start counting only once something applied: nothing yet reads 0 of 0", () => {
    expect(habitStats(habits, [rep({ checks: [chk("proof", true)] })]).find((s) => s.id === "fillers")!.firstTry).toEqual([0, 0]);
  });
});

describe("fixed on the second try", () => {
  it("counts an answer whose top fix passed on the next attempt, per question in a session", () => {
    const reps = [
      rep({ question_id: "a", fix: "ownership", checks: [chk("ownership", false)] }),
      rep({ question_id: "a", attempt: 2, checks: [chk("ownership", true)] }),
      rep({ question_id: "b", fix: "ownership", checks: [chk("ownership", false)] }),
      rep({ question_id: "b", attempt: 2, checks: [chk("ownership", false)] }),
      rep({ question_id: "c", fix: "ownership", checks: [chk("ownership", false)] }), // never retried
      rep({ question_id: "d", fix: "proof", checks: [chk("proof", false)] }),
      rep({ question_id: "d", attempt: 2, checks: [chk("proof", true)] }),
    ];
    expect(retryStat(H("ownership"), reps)).toEqual([1, 2]);
    expect(retryStat(H("numbers"), reps)).toEqual([1, 1]);
    expect(fixesStuck(reps)).toEqual({ stuck: 2, of: 3 });
  });
});

describe("graduation and trends", () => {
  const passes = (n: number, of: number) => Array.from({ length: of }, (_, i) => rep({ checks: [chk("ownership", i < n)] }));

  it("graduates at 8 of the last 10", () => {
    expect(graduated(H("ownership"), passes(8, 10))).toBe(true);
    expect(graduated(H("ownership"), passes(7, 10))).toBe(false);
    expect(graduated(H("ownership"), passes(10, 9))).toBe(false);
    expect(graduated(H("ownership"), [...passes(0, 5), ...passes(8, 10).map((r, i) => ({ ...r, recorded_at: `2026-10-21T10:${String(i).padStart(2, "0")}:00Z` }))])).toBe(true);
    const stat = habitStats(habits, passes(8, 10)).find((s) => s.id === "ownership")!;
    expect(stat.graduated).toBe(true);
    expect(stat.note).toContain("Graduated");
  });

  it("shows no trend until there are five answers", () => {
    expect(trendReady(H("ownership"), passes(4, 4))).toBe(false);
    expect(trendReady(H("ownership"), passes(4, 5))).toBe(true);
    expect(habitStats(habits, passes(2, 3)).find((s) => s.id === "ownership")!.note).toContain("few more answers");
  });

  it("marks where the rubric changed", () => {
    const reps = [rep({ rubric_version: 1 }), rep({ rubric_version: 1 }), rep({ rubric_version: 2 }), rep({ rubric_version: 2 })];
    expect(rubricChanges(reps)).toEqual([reps[2].recorded_at]);
    expect(rubricChanges(reps.slice(0, 2))).toEqual([]);
  });

  it("with 'not sure yet' picks the habit with the lowest first-try pass rate after five answers, ties in table order", () => {
    expect(pickFocusHabits(habits, passes(2, 4))).toEqual([]);
    const reps = Array.from({ length: 6 }, (_, i) => rep({ checks: [chk("ownership", i < 2), chk("proof", i < 2), chk("fillers", true)] }));
    expect(pickFocusHabits(habits, reps, 2)).toEqual(["numbers", "ownership"]);
  });
});

describe("streak and totals", () => {
  const day = (offset: number, hours = 10) => new Date(2026, 9, 21 - offset, hours).toISOString();
  const now = new Date(2026, 9, 21, 21, 30);

  it("counts consecutive days ending today, and keeps the streak until a whole day is missed", () => {
    const reps = [rep({ recorded_at: day(0) }), rep({ recorded_at: day(1) }), rep({ recorded_at: day(2) }), rep({ recorded_at: day(4) })];
    expect(streakOf(reps, now).daysInARow).toBe(3);
    expect(streakOf(reps.slice(1), now).daysInARow).toBe(3 - 1);
    expect(streakOf([rep({ recorded_at: day(3) })], now).daysInARow).toBe(0);
  });

  it("counts answers, questions faced and follow-ups survived", () => {
    const reps = [rep({ session_id: "a", question_id: "q1" }), rep({ session_id: "a", question_id: "q1", attempt: 2 }), rep({ session_id: "a", question_id: "q2" }), rep({ session_id: "a", question_id: "q1", follow_up: true })];
    expect(streakOf(reps, now)).toMatchObject({ answers: 3, questions: 2, followUps: 1 });
  });
});

describe("the sessions list", () => {
  const now = new Date(2026, 9, 21, 21, 30);

  it("says when in plain words", () => {
    expect(whenText(new Date(2026, 9, 21, 21, 12).toISOString(), now)).toMatch(/^Today, 9:12/);
    expect(whenText(new Date(2026, 9, 20, 18).toISOString(), now)).toBe("Yesterday");
    expect(whenText(new Date(2026, 9, 19, 18).toISOString(), now)).toBe("Mon, Oct 19");
  });

  it("lists sessions newest first with the stage, the company and what stuck", () => {
    const reps = [
      rep({ session_id: "old", started: new Date(2026, 9, 12, 9).toISOString(), question_id: "a", stage: "recruiter" }),
      rep({ session_id: "new", started: new Date(2026, 9, 21, 20).toISOString(), question_id: "b", application_id: "app_k", fix: "ownership", checks: [chk("ownership", false)] }),
      rep({ session_id: "new", started: new Date(2026, 9, 21, 20).toISOString(), question_id: "b", application_id: "app_k", attempt: 2, checks: [chk("ownership", true)] }),
    ];
    const rows = sessionList(reps, now, (id) => (id === "app_k" ? "Kestrel Pay" : undefined));
    expect(rows.map((r) => r.id)).toEqual(["new", "old"]);
    expect(rows[0]).toMatchObject({ title: "Hiring manager · Kestrel Pay", headline: "1 fix stuck", group: "This week", applicationId: "app_k" });
    expect(rows[1]).toMatchObject({ title: "Recruiter · general questions", headline: "1 answer", group: "Last week" });
  });
});
