import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { habits } from "../data/mock/habits";
import { fakeApi } from "../practice/fakeApi";
import { agoText, resultsOfSession } from "../practice/results";
import type { FinishArgs } from "../practice/types";

const args = (attempt: number): FinishArgs => ({
  session_id: null,
  mode: "drill",
  stage: "hiring_manager",
  application_id: null,
  question_id: "q1",
  question_text: "Tell me about a time you improved a metric.",
  question_type: "behavioral",
  behavioral_situation: null,
  commitment_check: false,
  builder_operator_check: false,
  is_major_story: false,
  founder_variant: false,
  follow_up: null,
  attempt,
  story_ids: [],
  audio_path: "/fake/rec.wav",
});

describe("results of one finished session", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function practised() {
    const api = fakeApi();
    for (const attempt of [1, 2, 3]) {
      const p = api.finishRep(args(attempt));
      await vi.advanceTimersByTimeAsync(1000);
      await p;
    }
    return (await api.loadSession("ses_fake"))!;
  }

  it("draws the clean-stop delta on the first and best tries, and says which fix held", async () => {
    const detail = await practised();
    const r = resultsOfSession(habits, detail, [], ["clean_stop"], new Date())!;
    expect(r.drill.kind).toBe("seconds");
    expect(r.drill.focusHabitId).toBe("clean_stop");
    expect(r.drill.questions).toMatchObject([{ id: "q1", firstTry: 31, bestTry: 4 }]);
    expect(r.drill.fixes).toEqual({ stuck: 1, of: 1 });
    expect(r.drill.stageLabel).toBe("Hiring manager");
    expect(r.drill.bestFrom).toEqual({ sessionId: "ses_fake", n: 3 });
    expect(r.graduation).toBeNull();
  });

  it("is a yes or no hero for a habit that has no clock", async () => {
    const detail = await practised();
    const r = resultsOfSession(habits, detail, [], ["numbers"], new Date())!;
    expect(r.drill.kind).toBe("flags");
    expect(r.drill.questions[0]).toMatchObject({ id: "q1", firstTry: 1, bestTry: 1 });
  });

  it("has nothing to show for a session with no scored answers", () => {
    expect(resultsOfSession(habits, { session: { id: "s", mode: "drill", stage: "recruiter", application_id: null, started: "2026-10-20T10:00:00Z" }, reps: [] }, [], [], new Date())).toBeNull();
  });
});

describe("agoText", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  it("reads like a person would say it", () => {
    expect(agoText("2026-10-22T08:00:00Z", now)).toBe("Earlier today");
    expect(agoText("2026-10-21T12:00:00Z", now)).toBe("Yesterday");
    expect(agoText("2026-10-19T12:00:00Z", now)).toBe("Three days ago");
    expect(agoText("2026-10-01T12:00:00Z", now)).toBe("Three weeks ago");
  });
});
