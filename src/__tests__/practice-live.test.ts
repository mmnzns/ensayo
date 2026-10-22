import { beforeEach, describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import type { RepApi } from "../practice/api";
import { cancelLive, getLive, HARD_CAP_SECONDS, liveSession, markWrong, nextLiveQuestion, resetLive, setRepApi, startLive, stopAndFinish, tryAgain, beginRecording, keepAfterRestart, startOverAfterRestart, resultRoute } from "../practice/live";
import type { FullRep, RepOutcome } from "../practice/types";

function rep(attempt: number, fix: string | null = "length"): FullRep {
  return {
    session_id: "ses_a",
    n: attempt,
    question_id: "q",
    question_text: "Q",
    question_type: "behavioral",
    attempt,
    recorded_at: "2026-10-21T10:00:00Z",
    story_ids: [],
    fix,
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
      checks: [{ id: "length", passed: fix === null, evidence: "" }],
    },
  };
}

const scored = (attempt: number, fix: string | null = "length", restart = false): RepOutcome => ({ outcome: "scored", session_id: "ses_a", rep: rep(attempt, fix), delta: null, restart_offered: restart, audio_kept: true });

function fake(outcomes: RepOutcome[]) {
  const calls: string[] = [];
  const queue = [...outcomes];
  const api: RepApi = {
    startRecording: async () => void calls.push("start"),
    stopRecording: async () => (calls.push("stop"), { path: "/tmp/rec.wav", duration_ms: 70_000 }),
    level: async () => ({ level: 0.4, elapsed_ms: 1000 }),
    finishRep: async (args) => (calls.push(`finish:${args.attempt}:${args.session_id ?? "new"}`), queue.shift()!),
    rescoreRep: async (_s, _n, keep) => (calls.push(`rescore:${keep}`), scored(1, null)),
    deleteRep: async () => void calls.push("delete"),
    labelRep: async (_s, n, wrong) => void calls.push(`label:${n}:${wrong}`),
    discardRecording: async () => void calls.push("discard"),
    audioAvailable: async () => true,
    readAudio: async () => new ArrayBuffer(4),
  };
  return { api, calls };
}

const begin = (over = {}) =>
  startLive(
    { mode: "drill", stage: "hiring_manager", count: 3, source: "stage", startup: false, ...over },
    { targetRole: "Senior Lifecycle Marketing Manager", stories: mockStore.stories, methods: mockStore.methods },
  );

beforeEach(() => resetLive());

describe("starting a live session", () => {
  it("picks the questions and waits on the first one", () => {
    begin();
    const s = getLive();
    expect(s.active).toBe(true);
    expect(s.questions).toHaveLength(3);
    expect(s.index).toBe(0);
    expect(s.attempt).toBe(1);
    expect(s.phase).toBe("asking");
    expect(liveSession()).toMatchObject({ mode: "Drill", stage: "Hiring manager", position: 1, total: 3 });
  });

  it("a story session asks about that story, and an own question is the only question", () => {
    begin({ source: "story", storyId: mockStore.stories[0].id });
    expect(getLive().questions.length).toBeGreaterThan(0);
    resetLive();
    begin({ source: "own", ownQuestion: "Why did the launch slip?" });
    expect(getLive().questions.map((q) => q.text)).toEqual(["Why did the launch slip?"]);
  });
});

describe("one rep", () => {
  it("records, stops, measures and lands on the result with the attempt", async () => {
    const { api, calls } = fake([scored(1)]);
    setRepApi(api);
    begin();
    await beginRecording();
    expect(getLive().phase).toBe("recording");
    await stopAndFinish();
    expect(calls).toEqual(["start", "stop", "finish:1:new"]);
    const s = getLive();
    expect(s.phase).toBe("result");
    expect(s.sessionId).toBe("ses_a");
    expect(s.attempts).toHaveLength(1);
    expect(s.attempts[0].number).toBe(1);
    expect(resultRoute()).toBe("3-4-result-attempt-1-details-open");
  });

  it("again is one more attempt at the same question, up to three, in the same session", async () => {
    const { api, calls } = fake([scored(1), scored(2), scored(3)]);
    setRepApi(api);
    begin();
    for (let i = 0; i < 3; i++) {
      await beginRecording();
      await stopAndFinish();
      if (i < 2) tryAgain();
    }
    expect(calls.filter((c) => c.startsWith("finish"))).toEqual(["finish:1:new", "finish:2:ses_a", "finish:3:ses_a"]);
    expect(getLive().attempt).toBe(3);
    tryAgain();
    expect(getLive().attempt).toBe(3);
    expect(resultRoute()).toBe("3-5-result-attempt-2");
  });

  it("a clean answer goes to the everything-worked screen", async () => {
    const { api } = fake([scored(1, null)]);
    setRepApi(api);
    begin();
    await beginRecording();
    await stopAndFinish();
    expect(resultRoute()).toBe("3-8-result-everything-worked");
  });

  it("next question starts again at attempt 1 and ends after the last one", async () => {
    const { api } = fake([scored(1)]);
    setRepApi(api);
    begin({ count: 2 });
    await beginRecording();
    await stopAndFinish();
    expect(nextLiveQuestion()).toBe("asking");
    expect(getLive()).toMatchObject({ index: 1, attempt: 1, phase: "asking" });
    expect(getLive().attempts).toEqual([]);
    expect(nextLiveQuestion()).toBe("done");
  });

  it("something too short to hear is not a result", async () => {
    const { api } = fake([{ outcome: "didnt_catch", session_id: "ses_a", rep: null, delta: null, restart_offered: false, audio_kept: false }]);
    setRepApi(api);
    begin();
    await beginRecording();
    await stopAndFinish();
    expect(getLive().phase).toBe("didnt_catch");
    expect(getLive().attempts).toEqual([]);
  });

  it("an engine error is kept in plain words and the rep can be tried again", async () => {
    const { api } = fake([]);
    api.finishRep = async () => {
      throw "That speech model isn't downloaded yet";
    };
    setRepApi(api);
    begin();
    await beginRecording();
    await stopAndFinish();
    expect(getLive()).toMatchObject({ phase: "error", error: "That speech model isn't downloaded yet" });
  });

  it("a recording that cannot start is an error, not a stuck screen", async () => {
    const { api } = fake([]);
    api.startRecording = async () => {
      throw new Error("Microphone permission denied");
    };
    setRepApi(api);
    begin();
    await beginRecording();
    expect(getLive()).toMatchObject({ phase: "error", error: "Microphone permission denied" });
  });
});

describe("restart, notes and ending", () => {
  it("offers a restart, then keeps it (rescored) or starts over (deleted)", async () => {
    const a = fake([scored(1, "length", true)]);
    setRepApi(a.api);
    begin();
    await beginRecording();
    await stopAndFinish();
    expect(getLive().restartOffered).toBe(true);
    await keepAfterRestart();
    expect(a.calls).toContain("rescore:true");
    expect(getLive().restartOffered).toBe(false);

    resetLive();
    const b = fake([scored(1, "length", true)]);
    setRepApi(b.api);
    begin();
    await beginRecording();
    await stopAndFinish();
    await startOverAfterRestart();
    expect(b.calls).toContain("delete");
    expect(getLive()).toMatchObject({ phase: "asking", attempt: 1, restartOffered: false });
    expect(getLive().attempts).toEqual([]);
  });

  it("that note was wrong labels the current rep and can be taken back", async () => {
    const { api, calls } = fake([scored(1)]);
    setRepApi(api);
    begin();
    await beginRecording();
    await stopAndFinish();
    await markWrong(true);
    await markWrong(false);
    expect(calls.filter((c) => c.startsWith("label"))).toEqual(["label:1:true", "label:1:false"]);
    expect(getLive().noteWrong).toBe(false);
  });

  it("cancelling mid-recording discards the file and ends the session", async () => {
    const { api, calls } = fake([]);
    setRepApi(api);
    begin();
    await beginRecording();
    await cancelLive();
    expect(calls).toEqual(["start", "stop", "discard"]);
    expect(getLive().active).toBe(false);
  });

  it("the hard cap is four minutes", () => {
    expect(HARD_CAP_SECONDS).toBe(240);
  });
});
