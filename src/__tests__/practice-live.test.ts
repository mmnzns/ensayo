import { beforeEach, describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import type { RepApi } from "../practice/api";
import { anotherFollowUp, checkAi, endFollowUp, requestFollowUp, labelCriteria, savedLabels, cancelLive, getLive, HARD_CAP_SECONDS, liveSession, markWrong, nextLiveQuestion, resetLive, setRepApi, startLive, stopAndFinish, tryAgain, beginRecording, keepAfterRestart, startOverAfterRestart, resultRoute, practiceStory, rehearseQuestion, startStoryDrill, startQuestionDrill, ASKING_SCREEN, rescoreAfterCap, CAP_NOTICE_MARK, noteMeasured, fixTranscript, scoreWithAi, stoppedByUser, STOPPED_NOTICE_MARK } from "../practice/live";
import { liveContextOf } from "../practice/quick";
import { storyFit } from "../practice/questions";
import type { FinishArgs, FullRep, RepOutcome } from "../practice/types";
import { attemptFromOutcome } from "../practice/attempt";
import { FIXED_LINE, lineText, linesChanged } from "../screens/practice/fixWord";

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

let followUpsAsked = 0;
let followUpError: unknown = null;
let clarifyError: unknown = null;
let ready = true;

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
    nextFollowUp: async (_s, parentN) => {
      calls.push(`followup:${parentN}`);
      if (followUpError) throw followUpError;
      return { kind: "ownership_probe", question: "What was your part in that, specifically?", targets: "ownership", number: followUpsAsked++ + 1, of: 2 };
    },
    clarifyReply: async (_s, q, c) => (calls.push(`clarify:${q}|${c}`), clarifyError ? Promise.reject(clarifyError) : "Mostly the rollout."),
    aiReady: async () => ready,
    discardRecording: async () => void calls.push("discard"),
    labelCriteria: async (_s, n, labels) => void calls.push(`labels:${n}:${JSON.stringify(labels)}`),
    repLabels: async () => ({ proof: "pass" }),
    audioAvailable: async () => true,
    readAudio: async () => new ArrayBuffer(4),
    loadSession: async () => null,
    mockDebrief: async () => Promise.reject(new Error("no engine")),
  };
  return { api, calls };
}

const begin = (over = {}) =>
  startLive(
    { mode: "drill", stage: "hiring_manager", count: 3, source: "stage", startup: false, ...over },
    { targetRole: "Senior Lifecycle Marketing Manager", stories: mockStore.stories, methods: mockStore.methods },
  );

beforeEach(() => {
  resetLive();
  followUpsAsked = 0;
  followUpError = null;
  clarifyError = null;
  ready = true;
});

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
    const { api } = fake([{ outcome: "didnt_catch", session_id: "ses_a", rep: null, delta: null, restart_offered: false, audio_kept: false, notice: null, transcript_text: null }]);
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

describe("keeping going at the spending limit", () => {
  it("judges again the rep that was refused at the limit, and leaves one that was judged", async () => {
    const refused = { ...scored(1, "length"), notice: `This session has spent about $1.02 of its $1.00 limit, and ${CAP_NOTICE_MARK}. Change the limit in Settings › AI.` };
    const a = fake([refused]);
    setRepApi(a.api);
    begin();
    await beginRecording();
    await stopAndFinish();
    expect(await rescoreAfterCap("another_session")).toBe(false);
    expect(await rescoreAfterCap("ses_a")).toBe(true);
    expect(a.calls).toContain("rescore:false");
    expect(getLive()).toMatchObject({ phase: "result", notice: null });

    resetLive();
    const b = fake([scored(1, "length")]);
    setRepApi(b.api);
    begin();
    await beginRecording();
    await stopAndFinish();
    expect(await rescoreAfterCap("ses_a")).toBe(false);
    expect(b.calls.some((c) => c.startsWith("rescore"))).toBe(false);
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

  it("labels go to the eval set for the current rep and the saved ones can be read back", async () => {
    const { api, calls } = fake([scored(1)]);
    setRepApi(api);
    begin();
    await beginRecording();
    await stopAndFinish();
    await labelCriteria({ proof: "pass", answer_first: "fail" });
    expect(calls).toContain('labels:1:{"proof":"pass","answer_first":"fail"}');
    expect(await savedLabels()).toEqual({ proof: "pass" });
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

describe("follow-ups", () => {
  const followScored = (n: number, fix: string | null = "f5_held_position"): RepOutcome => {
    const o = scored(1, fix);
    o.rep = { ...o.rep!, n, attempt: 1, follow_up: { parent_n: 1, kind: "ownership_probe", question: "What was your part in that, specifically?", number: 1 } };
    return o;
  };

  async function firstAnswer(extra: RepOutcome[] = []) {
    const f = fake([scored(1), ...extra]);
    setRepApi(f.api);
    begin();
    await beginRecording();
    await stopAndFinish();
    return f;
  }

  it("asking for one fetches the question for the kept answer and moves to the follow-up screen", async () => {
    const { calls } = await firstAnswer();
    expect(await requestFollowUp()).toBe("3-6-follow-up");
    expect(calls).toContain("followup:1");
    const s = getLive();
    expect(s.view).toBe("followup");
    expect(s.followUp).toMatchObject({ question: "What was your part in that, specifically?", number: 1, of: 2, parentN: 1 });
    expect(s.phase).toBe("asking");
  });

  it("answering it sends the follow-up details and keeps the first answer's result untouched", async () => {
    const { api } = await firstAnswer([followScored(2)]);
    let sent: FinishArgs | undefined;
    const original = api.finishRep;
    api.finishRep = async (a) => ((sent = a), original(a));
    await requestFollowUp();
    await beginRecording();
    await stopAndFinish();
    expect(sent).toMatchObject({ question_text: "What was your part in that, specifically?", attempt: 1, follow_up: { parent_n: 1, kind: "ownership_probe", number: 1 } });
    const s = getLive();
    expect(s.phase).toBe("result");
    expect(s.attempts).toHaveLength(1);
    expect(s.followUpAttempt).not.toBeNull();
    expect(resultRoute()).toBe("3-5-result-attempt-2");
  });

  it("a second follow-up comes from the same kept answer, and ending them goes back to the first result", async () => {
    await firstAnswer([followScored(2)]);
    await requestFollowUp();
    await beginRecording();
    await stopAndFinish();
    expect(await anotherFollowUp()).toBe("3-6-follow-up");
    expect(getLive().followUp?.number).toBe(2);
    endFollowUp();
    expect(getLive()).toMatchObject({ view: "attempt", followUp: null, phase: "result" });
    expect(getLive().attempts).toHaveLength(1);
  });

  it("the next question clears the follow-up", async () => {
    await firstAnswer([followScored(2)]);
    await requestFollowUp();
    nextLiveQuestion();
    expect(getLive()).toMatchObject({ view: "attempt", followUp: null, followUpAttempt: null });
  });

  it("no follow-up means the plain reason shows on the result and nothing changes", async () => {
    await firstAnswer();
    followUpError = "A follow-up needs a feedback engine. Choose one in Settings › AI.";
    expect(await requestFollowUp()).toBeNull();
    expect(getLive()).toMatchObject({ view: "attempt", phase: "result", notice: "A follow-up needs a feedback engine. Choose one in Settings › AI." });
  });

  it("labels and the wrong-note tap go to the follow-up rep while its result is showing", async () => {
    const { calls } = await firstAnswer([followScored(2)]);
    await requestFollowUp();
    await beginRecording();
    await stopAndFinish();
    await markWrong(true);
    expect(calls).toContain("label:2:true");
  });

  it("knows whether a feedback engine is ready, so the follow-up buttons can hide when it is not", async () => {
    setRepApi(fake([]).api);
    begin();
    ready = false;
    await checkAi();
    expect(getLive().aiReady).toBe(false);
    ready = true;
    await checkAi();
    expect(getLive().aiReady).toBe(true);
  });
});

describe("a clarifying question back to the interviewer", () => {
  const clarifying = (): RepOutcome => ({ outcome: "clarifying", session_id: "ses_a", rep: null, delta: null, restart_offered: false, audio_kept: false, notice: null, transcript_text: "Do you mean the strategy or the rollout?" });

  it("gets the interviewer's reply and then waits for the real answer", async () => {
    const { api, calls } = fake([clarifying(), scored(1)]);
    setRepApi(api);
    begin();
    await beginRecording();
    await stopAndFinish();
    const s = getLive();
    expect(s.phase).toBe("clarify");
    expect(s.clarify?.map((m) => m.from)).toEqual(["interviewer", "you", "interviewer"]);
    expect(s.clarify?.[1].text).toBe("Do you mean the strategy or the rollout?");
    expect(s.clarify?.[2].text).toBe("Mostly the rollout.");
    expect(calls.some((c) => c.startsWith("clarify:"))).toBe(true);
    await beginRecording();
    await stopAndFinish();
    expect(getLive().phase).toBe("result");
    expect(getLive().clarify).toBeNull();
  });

  it("without a reply (no engine) it says so and lets you answer", async () => {
    clarifyError = "A follow-up needs a feedback engine. Choose one in Settings › AI.";
    const { api } = fake([clarifying()]);
    setRepApi(api);
    begin();
    await beginRecording();
    await stopAndFinish();
    expect(getLive().phase).toBe("notice");
    expect(getLive().notice).toContain("question back to the interviewer");
  });
});

describe("a Mock", () => {
  const beginMock = (over = {}) => begin({ mode: "mock", stage: "hiring_manager", count: 2, ...over });

  it("ends with the interviewer asking for the candidate's own questions", () => {
    beginMock();
    const s = getLive();
    expect(s.questions).toHaveLength(3);
    expect(s.questions[2].type).toBe("candidate_questions");
    expect(liveSession()).toMatchObject({ mode: "Mock", total: 3 });
  });

  it("gives no note after an answer: it moves on to the next question", async () => {
    const { api, calls } = fake([scored(1)]);
    setRepApi(api);
    ready = false;
    beginMock();
    await stopAndFinish();
    const s = getLive();
    expect(s.index).toBe(1);
    expect(s.phase).toBe("asking");
    expect(calls.some((c) => c.startsWith("followup"))).toBe(false);
  });

  it("asks one follow-up when an engine is set up, then moves on after it is answered", async () => {
    const { api, calls } = fake([scored(1), scored(1)]);
    setRepApi(api);
    beginMock();
    await checkAi();
    await stopAndFinish();
    expect(calls).toContain("followup:1");
    expect(getLive()).toMatchObject({ view: "followup", phase: "asking", mockFollowUps: 1, index: 0 });
    await stopAndFinish();
    const s = getLive();
    expect(s.view).toBe("attempt");
    expect(s.index).toBe(1);
  });

  it("finishes when the own questions are answered, so the debrief can open", async () => {
    const { api } = fake([scored(1)]);
    setRepApi(api);
    ready = false;
    beginMock({ count: 1 });
    nextLiveQuestion();
    expect(getLive().questions[getLive().index].type).toBe("candidate_questions");
    await stopAndFinish();
    const s = getLive();
    expect(s.mockFinished).toBe(true);
    expect(s.phase).toBe("idle");
    expect(s.lastSessionId).toBe("ses_a");
  });
});

describe("controls that start a session", () => {
  const ctx = liveContextOf({ profile: { targetRole: "Senior Lifecycle Marketing Manager" }, stories: mockStore.stories, methods: mockStore.methods });

  it("Practice this story starts a Drill of the three questions that fit it best, then opens the asking screen", () => {
    setRepApi(fake([]).api);
    const story = mockStore.stories[0];
    const opened: string[] = [];
    practiceStory(story, ctx, (screen) => opened.push(screen));
    const s = getLive();
    expect(s.active).toBe(true);
    expect(s.mode).toBe("drill");
    expect(s.questions).toHaveLength(3);
    const fits = s.questions.map((q) => storyFit(q, story));
    expect([...fits].sort((a, b) => b - a)).toEqual(fits);
    expect(opened).toEqual([ASKING_SCREEN]);
  });

  it("Rehearse starts a one-question Drill on that exact question, then opens the asking screen", () => {
    setRepApi(fake([]).api);
    const opened: string[] = [];
    rehearseQuestion("Why did the launch slip?", ctx, (screen) => opened.push(screen));
    const s = getLive();
    expect(s.questions.map((q) => q.text)).toEqual(["Why did the launch slip?"]);
    expect(s.phase).toBe("asking");
    expect(opened).toEqual([ASKING_SCREEN]);
  });

  it("in the browser preview nothing starts, and the screen still opens with its sample", () => {
    setRepApi(null);
    const opened: string[] = [];
    expect(startStoryDrill(mockStore.stories[0], ctx)).toBe(false);
    expect(startQuestionDrill("Anything", ctx)).toBe(false);
    practiceStory(mockStore.stories[0], ctx, (screen) => opened.push(screen));
    expect(getLive().active).toBe(false);
    expect(opened).toEqual([ASKING_SCREEN]);
  });

  it("a story that is not in the list yet is still practised, and a blank question starts nothing", () => {
    setRepApi(fake([]).api);
    const fresh = { ...mockStore.stories[0], id: "new-one" };
    expect(startStoryDrill(fresh, ctx)).toBe(true);
    expect(startQuestionDrill("   ", ctx)).toBe(false);
  });
});

const STOP_NOTICE = "You stopped the AI. This answer got the measured checks only.";

describe("real progress and Stop", () => {
  it("ticks the measured rows only when the backend said so, not on thinking", async () => {
    let release: (o: RepOutcome) => void = () => {};
    const a = fake([]);
    a.api.finishRep = () => new Promise<RepOutcome>((r) => void (release = r));
    setRepApi(a.api);
    begin();
    await beginRecording();
    const done = stopAndFinish();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(getLive()).toMatchObject({ phase: "thinking", measured: null });
    expect(getLive().thinkingSince).toEqual(expect.any(Number));
    noteMeasured(87);
    expect(getLive().measured).toBe(87);
    // A second event does not move it, and an event outside a wait is ignored.
    noteMeasured(5);
    expect(getLive().measured).toBe(87);
    release(scored(1, "length"));
    await done;
    expect(getLive().phase).toBe("result");
    noteMeasured(9);
    expect(getLive().measured).toBe(87);
  });

  it("a stopped answer shows its notice, and Score with AI judges it again without keeping a restart", async () => {
    const stopped = { ...scored(1, "length"), notice: STOP_NOTICE };
    const a = fake([stopped]);
    setRepApi(a.api);
    begin();
    await beginRecording();
    await stopAndFinish();
    expect(STOPPED_NOTICE_MARK).toBe("You stopped the AI.");
    expect(getLive()).toMatchObject({ phase: "result" });
    expect(stoppedByUser()).toBe(true);
    const run = scoreWithAi();
    // The screen is waiting again at once, with the measured part already known.
    expect(getLive()).toMatchObject({ phase: "thinking", measured: 0 });
    await run;
    expect(a.calls).toContain("rescore:false");
    expect(getLive()).toMatchObject({ phase: "result", notice: null });
    expect(stoppedByUser()).toBe(false);
  });

  it("offers Score with AI only for a stopped Drill answer", async () => {
    const a = fake([scored(1, "length")]);
    setRepApi(a.api);
    begin();
    await beginRecording();
    await stopAndFinish();
    expect(stoppedByUser()).toBe(false);
    expect(await scoreWithAi()).toBe(false);
    expect(a.calls.some((c) => c.startsWith("rescore"))).toBe(false);
  });
});

describe("fixing a mis-heard word", () => {
  it("sends the edited lines for the rep on screen, then shows the rescored answer marked as fixed", async () => {
    const a = fake([scored(1, "length")]);
    const sent: { n: number; lines: string[] }[] = [];
    a.api.rescoreRepWithText = async (_s, n, lines) => (sent.push({ n, lines }), { ...scored(1, null), transcript_edited: true });
    setRepApi(a.api);
    begin();
    await beginRecording();
    await stopAndFinish();
    expect(getLive().attempts[0].details.transcriptEdited).toBeUndefined();
    const run = fixTranscript(["We cut churn by 18%.", "Done."]);
    expect(getLive()).toMatchObject({ phase: "thinking", measured: 0 });
    await run;
    expect(sent).toEqual([{ n: 1, lines: ["We cut churn by 18%.", "Done."] }]);
    expect(getLive().phase).toBe("result");
    expect(getLive().attempts[0].details.transcriptEdited).toBe(true);
    expect(FIXED_LINE).toBe("You fixed the transcript.");
  });

  it("stays on the result with the reason when the scoring fails", async () => {
    const a = fake([scored(1, "length")]);
    a.api.rescoreRepWithText = async () => Promise.reject(new Error("The transcript changed while you were editing it. Open it again."));
    setRepApi(a.api);
    begin();
    await beginRecording();
    await stopAndFinish();
    await fixTranscript(["x"]);
    expect(getLive()).toMatchObject({ phase: "result", notice: "The transcript changed while you were editing it. Open it again." });
    expect(getLive().attempts).toHaveLength(1);
  });

  it("does nothing when there is no answer on screen", async () => {
    begin();
    expect(await fixTranscript(["x"])).toBe(false);
  });

  it("knows when the lines were changed, and reads a line with pieces as plain text", () => {
    expect(linesChanged(["a b", "c"], ["a  b", "c "])).toBe(false);
    expect(linesChanged(["a b", "c"], ["a b", "d"])).toBe(true);
    expect(linesChanged(["a"], ["a", "b"])).toBe(true);
    expect(lineText({ text: [{ text: "um" }, { text: " so", circle: true }], tone: "normal" })).toBe("um so");
    expect(attemptFromOutcome(scored(1, "length")).details.transcriptEdited).toBeUndefined();
    expect(attemptFromOutcome({ ...scored(1, "length"), transcript_edited: false }).details.transcriptEdited).toBeUndefined();
  });
});
