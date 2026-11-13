import { beforeEach, describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import type { RepApi } from "../practice/api";
import { beginRecording, cancelLive, getLive, resetLive, retryFinish, retryQuestion, setRepApi, startLive, stopAndFinish } from "../practice/live";
import { liveContextOf } from "../practice/quick";
import type { RepOutcome } from "../practice/types";

const ctx = liveContextOf({ profile: { targetRole: "Senior Lifecycle Marketing Manager" }, stories: mockStore.stories, methods: mockStore.methods });
const flush = () => new Promise((r) => setTimeout(r, 0));
const caught: RepOutcome = { outcome: "didnt_catch", session_id: "ses_late", rep: null, delta: null, restart_offered: false, audio_kept: false, notice: null, transcript_text: null };

function setup(finish: RepApi["finishRep"]) {
  const log: string[] = [];
  const api = {
    startRecording: async () => {},
    stopRecording: async () => ({ path: "/tmp/kept.wav", duration_ms: 5000 }),
    level: async () => null,
    finishRep: finish,
    rescoreRep: async () => caught,
    deleteRep: async () => {},
    discardRecording: async (p: string) => void log.push(`discard:${p}`),
    aiReady: async () => true,
    speechReady: async () => true,
  } as unknown as RepApi;
  setRepApi(api);
  startLive({ mode: "drill", stage: "hiring_manager", count: 3, source: "stage" }, ctx);
  return log;
}

beforeEach(() => resetLive());

describe("a failed step keeps the recording", () => {
  it("Try again scores the same path and does not discard it", async () => {
    const paths: string[] = [];
    const tokens: (string | undefined)[] = [];
    let n = 0;
    const log = setup(async (args, run) => {
      paths.push(args.audio_path);
      tokens.push(run);
      if (n++ === 0) throw new Error("The AI is busy.");
      return caught;
    });
    await beginRecording();
    await stopAndFinish();
    expect(getLive().phase).toBe("error");
    expect(getLive().recordingPath).toBe("/tmp/kept.wav");
    expect(await retryFinish()).toBe(true);
    expect(paths).toEqual(["/tmp/kept.wav", "/tmp/kept.wav"]);
    expect(tokens[0]).not.toBe(tokens[1]);
    expect(getLive().phase).toBe("didnt_catch");
    expect(log).toEqual([]);
  });

  it("Record again discards it and goes back to asking", async () => {
    const log = setup(async () => {
      throw new Error("x");
    });
    await beginRecording();
    await stopAndFinish();
    await retryQuestion();
    expect(log).toEqual(["discard:/tmp/kept.wav"]);
    expect(getLive().phase).toBe("asking");
    expect(getLive().recordingPath).toBeNull();
  });
});

describe("late results", () => {
  it("a result that arrives after End session does not change the next session", async () => {
    let release: (o: RepOutcome) => void = () => {};
    const log = setup(() => new Promise<RepOutcome>((r) => (release = r)));
    await beginRecording();
    const finishing = stopAndFinish();
    await flush();
    expect(getLive().phase).toBe("thinking");
    await cancelLive();
    expect(log).toEqual([]);
    startLive({ mode: "drill", stage: "hiring_manager", count: 3, source: "stage" }, ctx);
    const before = getLive();
    release(caught);
    await finishing;
    expect(getLive()).toBe(before);
    expect(getLive().phase).toBe("asking");
    expect(getLive().sessionId).toBeNull();
  });

  it("a late failure is ignored too", async () => {
    let fail: (e: Error) => void = () => {};
    setup(() => new Promise<RepOutcome>((_, r) => (fail = r)));
    await beginRecording();
    const finishing = stopAndFinish();
    await flush();
    await cancelLive();
    startLive({ mode: "drill", stage: "hiring_manager", count: 3, source: "stage" }, ctx);
    fail(new Error("late"));
    await finishing;
    expect(getLive().phase).toBe("asking");
    expect(getLive().error).toBeNull();
  });

  it("End session on an error screen throws the kept recording away", async () => {
    const log = setup(async () => {
      throw new Error("x");
    });
    await beginRecording();
    await stopAndFinish();
    await cancelLive();
    expect(log).toEqual(["discard:/tmp/kept.wav"]);
  });
});
