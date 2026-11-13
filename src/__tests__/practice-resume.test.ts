import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import type { RepApi } from "../practice/api";
import { beginRecording, cancelLive, getLive, nextLiveQuestion, resetLive, resumeLive, setRepApi, startLive, stopAndFinish, type ResumableSession } from "../practice/live";
import { CONTINUE_TITLE, continueLine } from "../practice/resume";
import type { FinishArgs, FullRep, RepOutcome } from "../practice/types";
import ContinueCard from "../screens/home/ContinueCard";

function rep(attempt: number, fix: string | null = "length"): FullRep {
  return {
    session_id: "ses_a",
    n: attempt,
    question_id: "q",
    question_text: "Q",
    question_type: "behavioral",
    behavioral_situation: null,
    commitment_check: false,
    builder_operator_check: false,
    is_major_story: true,
    founder_variant: false,
    attempt,
    recorded_at: "2026-10-21T10:00:00Z",
    story_ids: [],
    follow_up: null,
    fix,
    note: null,
    rewrite: null,
    ai: null,
    feedback: null,
    transcript: [],
    metrics: {
      rubric_version: 1,
      outcome: "scored",
      words: [],
      sentences: [],
      word_count: 0,
      speaking_ms: 70_000,
      wpm: 120,
      window: { min_s: 45, max_s: 60 },
      length: "long",
      fillers: { count: 0, per_minute: 0, items: [] },
      pauses: [],
      proof: { matched: [], landed_sentence: null, tail_ms: null },
      unbanked: [],
      restart_at: null,
      checks: [{ id: "length", passed: fix === null, evidence: "", sentences: [], seconds: null }],
    },
  };
}

const scored = (attempt: number, fix: string | null = "length", restart = false): RepOutcome => ({ outcome: "scored", session_id: "ses_a", rep: rep(attempt, fix), delta: null, restart_offered: restart, audio_kept: true, notice: null, transcript_text: null });


const ctx = { targetRole: "Senior Lifecycle Marketing Manager", stories: mockStore.stories, methods: mockStore.methods };

function fake() {
  const finishes: FinishArgs[] = [];
  const ended: string[] = [];
  const api = {
    startRecording: async () => {},
    stopRecording: async () => ({ path: "/tmp/rec.wav", duration_ms: 70_000 }),
    level: async () => null,
    finishRep: async (args: FinishArgs) => (finishes.push(args), scored(finishes.length)),
    aiReady: async () => false,
    discardRecording: async () => {},
    endSession: async (id: string) => void ended.push(id),
  } as unknown as RepApi;
  return { api, finishes, ended };
}

beforeEach(() => resetLive());
afterEach(() => {
  setRepApi(null);
  resetLive();
});

describe("saving where a session got to", () => {
  it("sends the plan with the first answer only, and the question's place with every answer", async () => {
    const { api, finishes } = fake();
    setRepApi(api);
    startLive({ mode: "drill", stage: "hiring_manager", count: 3, source: "stage" }, ctx);
    const plan = getLive().questions;
    await beginRecording();
    await stopAndFinish();
    expect(finishes[0].question_index).toBe(0);
    expect(finishes[0].resume).toEqual({ plan, tries: 3, follow_ups: true, founder_variant: false });
    nextLiveQuestion();
    await beginRecording();
    await stopAndFinish();
    expect(finishes[1].question_index).toBe(1);
    expect(finishes[1].resume).toBeUndefined();
  });

  it("tells the backend when the session is ended or ran to its last question, and not before", async () => {
    const { api, ended } = fake();
    setRepApi(api);
    startLive({ mode: "drill", stage: "hiring_manager", count: 2, source: "stage" }, ctx);
    await beginRecording();
    await stopAndFinish();
    expect(nextLiveQuestion()).toBe("asking");
    expect(ended).toEqual([]);
    await beginRecording();
    await stopAndFinish();
    expect(nextLiveQuestion()).toBe("done");
    await new Promise((r) => setTimeout(r, 0));
    expect(ended).toEqual(["ses_a"]);
    startLive({ mode: "drill", stage: "hiring_manager", count: 2, source: "stage" }, ctx);
    await beginRecording();
    await stopAndFinish();
    await cancelLive();
    await new Promise((r) => setTimeout(r, 0));
    expect(ended).toEqual(["ses_a", "ses_a"]);
  });
});

describe("continuing a session after quitting", () => {
  const saved = (over: Partial<ResumableSession["resume"]> = {}): ResumableSession => {
    startLive({ mode: "mock", stage: "leadership", count: 4, source: "stage", startup: true, applicationId: "app_a", stageId: "stg_2" }, ctx);
    const plan = getLive().questions;
    resetLive();
    return { id: "ses_old", mode: "mock", stage: "leadership", application_id: "app_a", stage_id: "stg_2", target_id: null, started: "2026-10-21T09:00:00Z", resume: { plan, next_index: 2, tries: 3, follow_ups: true, founder_variant: true, ...over } };
  };

  it("starts at the next question with the same plan, mode, stage, application and session", () => {
    const r = saved();
    resumeLive(r, ctx);
    const s = getLive();
    expect(s).toMatchObject({ active: true, phase: "asking", mode: "mock", stage: "leadership", applicationId: "app_a", stageId: "stg_2", sessionId: "ses_old", index: 2, attempt: 1, founderVariant: true });
    expect(s.questions).toEqual(r.resume.plan);
  });

  it("the next answer joins the same session at the right question and does not send the plan again", async () => {
    const { api, finishes } = fake();
    setRepApi(api);
    resumeLive(saved(), ctx);
    await beginRecording();
    await stopAndFinish();
    expect(finishes[0]).toMatchObject({ session_id: "ses_old", question_index: 2, mode: "mock", stage: "leadership", application_id: "app_a" });
    expect(finishes[0].resume).toBeUndefined();
    expect(finishes[0].question_id).toBe(getLive().questions[2].id);
  });

  it("keeps the tries and follow-up choices of the session, and never starts past the last question", () => {
    startLive({ mode: "drill", stage: "hiring_manager", count: 3, source: "stage" }, ctx);
    const plan = getLive().questions;
    resetLive();
    resumeLive({ id: "ses_d", mode: "drill", stage: "hiring_manager", application_id: null, started: "2026-10-21T09:00:00Z", resume: { plan, next_index: 9, tries: 2, follow_ups: false, founder_variant: false } }, ctx);
    expect(getLive()).toMatchObject({ tries: 2, followUps: false, index: 2, stageId: null });
  });

  it("words the card with the question it comes back to", () => {
    const r = saved();
    expect(continueLine(r, (id) => (id === "app_a" ? "Kestrel Pay" : undefined))).toBe("Kestrel Pay · Leadership · Mock · question 3 of 5");
    const html = renderToStaticMarkup(createElement(ContinueCard, { session: r, onContinue: () => {} }));
    expect(html).toContain(CONTINUE_TITLE);
    expect(html).toContain("Continue where you left off");
    expect(html).toContain("question 3 of");
    expect(html).not.toContain("\u2014");
  });
});
