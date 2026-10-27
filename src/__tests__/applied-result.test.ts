import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import { attemptFromOutcome } from "../practice/attempt";
import { drillView, fixesStuck, firstTryStat, habitResult, summaryOfFull, type RepSummary } from "../practice/habits";
import type { Check, FullRep, Metrics, RepOutcome } from "../practice/types";

const check = (id: string, passed: boolean | null, evidence = "", sentences: number[] = []): Check => ({ id, passed, evidence, sentences, seconds: null });

function fullRep(checks: Check[], fix: string | null, over: Partial<FullRep> = {}): FullRep {
  const m: Metrics = {
    rubric_version: 1,
    outcome: "scored",
    words: [],
    sentences: [{ index: 1, text: "Four weeks.", start_ms: 0, end_ms: 1000, first_word: 0, word_count: 2 }, { index: 2, text: "Two weeks, actually.", start_ms: 1000, end_ms: 2000, first_word: 2, word_count: 3 }],
    word_count: 5,
    speaking_ms: 50_000,
    wpm: 100,
    window: { min_s: 45, max_s: 60 },
    length: "fits",
    fillers: { count: 0, per_minute: 0, items: [] },
    pauses: [],
    proof: { matched: [], landed_sentence: null, tail_ms: null },
    unbanked: [],
    restart_at: null,
    checks,
  };
  return { session_id: "s", n: 1, question_id: "q", question_text: "Q", question_type: "behavioral", behavioral_situation: null, commitment_check: false, builder_operator_check: false, is_major_story: true, founder_variant: false, attempt: 1, recorded_at: "2026-10-21T10:00:00Z", story_ids: [], follow_up: null, fix, note: null, rewrite: null, ai: null, feedback: null, transcript: [], metrics: m, ...over };
}
const outcomeOf = (rep: FullRep): RepOutcome => ({ outcome: "scored", session_id: "s", rep, delta: null, restart_offered: false, audio_kept: true, notice: null, transcript_text: null });

const EVIDENCE = 'In the recruiter stage you said "four weeks". Here you said "two weeks".';

describe("the result screen with the consistency check", () => {
  it("lists it in the details in plain words, never by its id", () => {
    const a = attemptFromOutcome(outcomeOf(fullRep([check("c1_consistent", false, EVIDENCE, [2])], "c1_consistent")));
    const row = a.details.rows.find((r) => r.id === "c1_consistent");
    expect(row).toMatchObject({ label: "Said it the way you said it before", state: "notyet", note: EVIDENCE });
    for (const r of a.details.rows) expect(r.label).not.toMatch(/c1|_/);
  });

  it("writes the coach note itself when there is no model note, and highlights the sentence it is about", () => {
    const a = attemptFromOutcome(outcomeOf(fullRep([check("c1_consistent", false, EVIDENCE, [2])], "c1_consistent")));
    expect(a.coachNote).toBe(EVIDENCE);
    expect(a.transcript[1].tone).toBe("highlight");
  });

  it("keeps the model's own note when there is one", () => {
    const a = attemptFromOutcome(outcomeOf(fullRep([check("c1_consistent", false, EVIDENCE, [2])], "c1_consistent", { note: "Pick one answer for notice." })));
    expect(a.coachNote).toBe("Pick one answer for notice.");
  });

  it("shows a pass as a yes with what it was compared with, and skips a check that did not apply", () => {
    const pass = attemptFromOutcome(outcomeOf(fullRep([check("c1_consistent", true, "What you said matches what you said before.")], null)));
    expect(pass.details.rows.find((r) => r.id === "c1_consistent")).toMatchObject({ state: "yes", note: "What you said matches what you said before.", measures: "The same facts as your earlier stages and your resume." });
    const none = attemptFromOutcome(outcomeOf(fullRep([check("c1_consistent", null)], null)));
    expect(none.details.rows.find((r) => r.id === "c1_consistent")).toBeUndefined();
  });

  it("is not a win on its own and does not hide what else worked", () => {
    const a = attemptFromOutcome(outcomeOf(fullRep([check("c1_consistent", true), check("length", true)], null)));
    expect(a.wins).toContain("0:50 long");
  });
});

describe("a check the app does not know yet", () => {
  it("still shows a row, in the words of its id, with its evidence when it did not hold", () => {
    const a = attemptFromOutcome(outcomeOf(fullRep([check("c2_tone_match", false, "The tone shifted halfway."), check("c3_other", true)], "c2_tone_match")));
    expect(a.details.rows.find((r) => r.id === "c2_tone_match")).toMatchObject({ label: "Tone match", state: "notyet", note: "The tone shifted halfway." });
    expect(a.details.rows.find((r) => r.id === "c3_other")).toMatchObject({ label: "Other", state: "yes", note: "" });
    expect(a.coachNote.length).toBeGreaterThan(0);
  });

  it("does not list the time to the point as a row of its own", () => {
    const a = attemptFromOutcome(outcomeOf(fullRep([check("time_to_point", true)], null)));
    expect(a.details.rows.find((r) => r.id === "time_to_point")).toBeUndefined();
  });
});

describe("habits and summaries ignore the consistency check", () => {
  const habits = mockStore.habits;
  const session = { mode: "drill", stage: "recruiter", application_id: "app_1", started: "2026-10-21T10:00:00Z" };

  it("is in no habit's criteria", () => {
    for (const h of habits) expect(h.criteria).not.toContain("c1_consistent");
  });

  it("does not change what a habit says about an answer", () => {
    const without = summaryOfFull(fullRep([check("proof", true), check("clean_stop", true)], null), session);
    const withFailed = summaryOfFull(fullRep([check("proof", true), check("clean_stop", true), check("c1_consistent", false, EVIDENCE)], "c1_consistent"), session);
    for (const h of habits) expect(habitResult(h, withFailed), h.id).toBe(habitResult(h, without));
    const only = summaryOfFull(fullRep([check("c1_consistent", false, EVIDENCE)], "c1_consistent"), session);
    for (const h of habits) expect(habitResult(h, only), h.id).toBeNull();
  });

  it("keeps the pass rates the same with it on the answers", () => {
    const reps: RepSummary[] = [1, 2, 3].map((n) => ({ ...summaryOfFull(fullRep([check("proof", n !== 2), check("c1_consistent", n === 1)], n === 1 ? null : "proof", { n, question_id: `q${n}`, recorded_at: `2026-10-21T10:0${n}:00Z` }), session) }));
    const numbers = habits.find((h) => h.id === "numbers")!;
    expect(firstTryStat(numbers, reps)).toEqual([2, 3]);
  });

  it("counts a consistency fix that held on the next try as a fix that stuck", () => {
    const first = summaryOfFull(fullRep([check("c1_consistent", false, EVIDENCE)], "c1_consistent", { n: 1, attempt: 1 }), session);
    const second = summaryOfFull(fullRep([check("c1_consistent", true)], null, { n: 2, attempt: 2, recorded_at: "2026-10-21T10:05:00Z" }), session);
    expect(fixesStuck([first, second])).toEqual({ stuck: 1, of: 1 });
  });

  it("still gives a session summary when the only thing that failed is the consistency check", () => {
    const only = summaryOfFull(fullRep([check("proof", true), check("c1_consistent", false, EVIDENCE)], "c1_consistent"), session);
    const view = drillView(habits, [only], [], []);
    expect(view).not.toBeNull();
    expect(view!.totals.answers).toBe(1);
    expect(view!.nextTime.advice.length).toBeGreaterThan(0);
  });
});
