import { beforeEach, describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import type { RepApi } from "../practice/api";
import { beginRecording, cancelLive, getLive, recordingScreenShown, resetLive, restartRecording, setRepApi, startLive, stopAndFinish } from "../practice/live";
import { liveContextOf } from "../practice/quick";
import type { RepOutcome } from "../practice/types";

const ctx = liveContextOf({ profile: { targetRole: "Senior Lifecycle Marketing Manager" }, stories: mockStore.stories, methods: mockStore.methods });
const outcome: RepOutcome = { outcome: "didnt_catch", session_id: "s", rep: null, delta: null, restart_offered: false, audio_kept: false, notice: null, transcript_text: null };
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** A recorder that behaves like the backend: one capture at a time, "Already recording" on a second start. */
function fakeRecorder(opts: { startDelay?: number; orphan?: boolean } = {}) {
  const log: string[] = [];
  let capturing = !!opts.orphan;
  let n = 0;
  const api = {
    startRecording: async () => {
      log.push("start");
      if (capturing) throw new Error("Already recording");
      capturing = true;
      if (opts.startDelay) await new Promise((r) => setTimeout(r, opts.startDelay));
      return "Mic";
    },
    stopRecording: async () => {
      log.push("stop");
      if (!capturing) throw new Error("Not recording");
      capturing = false;
      return { path: `/tmp/r${++n}.wav`, duration_ms: 9000 };
    },
    discardRecording: async (p: string) => void log.push(`discard:${p}`),
    finishRep: async () => (log.push("finish"), outcome),
    level: async () => ({ level: 0, elapsed_ms: 0 }),
    warmSpeech: async () => {},
    aiReady: async () => true,
    speechReady: async () => true,
  } as unknown as RepApi;
  return { api, log, capturing: () => capturing };
}

function begin(rec: ReturnType<typeof fakeRecorder>, mode: "drill" | "mock" = "drill", count = 3) {
  resetLive();
  setRepApi(rec.api);
  startLive({ mode, stage: "hiring_manager", count, source: "stage" }, ctx);
}

describe("one capture at a time", () => {
  beforeEach(() => resetLive());

  it("a double start opens one capture and shows no error", async () => {
    const rec = fakeRecorder({ startDelay: 20 });
    begin(rec);
    await Promise.all([beginRecording(), beginRecording()]);
    await beginRecording();
    expect(rec.log.filter((l) => l === "start")).toHaveLength(1);
    expect(getLive().phase).toBe("recording");
    expect(getLive().error).toBeNull();
  });

  it("an orphan capture is stopped, thrown away and replaced instead of showing Already recording", async () => {
    const rec = fakeRecorder({ orphan: true });
    begin(rec);
    await beginRecording();
    expect(getLive().phase).toBe("recording");
    expect(getLive().error).toBeNull();
    expect(rec.log).toEqual(["start", "stop", "discard:/tmp/r1.wav", "start"]);
  });

  it("restart vs restart: the second press is the same restart", async () => {
    const rec = fakeRecorder({ startDelay: 10 });
    begin(rec);
    await beginRecording();
    rec.log.length = 0;
    await Promise.all([restartRecording(), restartRecording()]);
    expect(rec.log.filter((l) => l === "start")).toHaveLength(1);
    expect(rec.log.filter((l) => l === "stop")).toHaveLength(1);
    expect(getLive().phase).toBe("recording");
  });

  it("restart vs stop: a stale restart does not start a capture after the answer was stopped", async () => {
    const rec = fakeRecorder();
    begin(rec);
    await beginRecording();
    const restart = restartRecording();
    const stop = stopAndFinish();
    await Promise.all([restart, stop]);
    expect(rec.capturing()).toBe(false);
    expect(rec.log.filter((l) => l === "start")).toHaveLength(1);
  });

  it("restart that waits behind a start does not start again once stopped", async () => {
    const rec = fakeRecorder({ startDelay: 20 });
    begin(rec);
    const first = beginRecording();
    const restart = restartRecording();
    const stop = stopAndFinish();
    await Promise.all([first, restart, stop]);
    expect(rec.log.filter((l) => l === "start")).toHaveLength(1);
    expect(rec.log).toContain("finish");
    expect(rec.capturing()).toBe(false);
  });

  it("a stop while the capture is still opening waits for it", async () => {
    const rec = fakeRecorder({ startDelay: 20 });
    begin(rec);
    void beginRecording();
    await stopAndFinish();
    expect(rec.log.slice(0, 2)).toEqual(["start", "stop"]);
    expect(getLive().error).toBeNull();
  });
});

describe("leaving the recording screen", () => {
  beforeEach(() => resetLive());

  it("ending the session mid-recording stops and discards the capture", async () => {
    const rec = fakeRecorder();
    begin(rec);
    await beginRecording();
    await cancelLive();
    expect(rec.capturing()).toBe(false);
    expect(rec.log).toContain("discard:/tmp/r1.wav");
  });

  it("ending the session while the capture is still opening leaves nothing running", async () => {
    const rec = fakeRecorder({ startDelay: 20 });
    begin(rec);
    void beginRecording();
    await cancelLive();
    expect(rec.capturing()).toBe(false);
  });

  it("the screen going away mid-recording stops the capture, but a remount does not", async () => {
    const rec = fakeRecorder();
    begin(rec);
    const left = recordingScreenShown();
    await beginRecording();
    left();
    const back = recordingScreenShown();
    await tick();
    expect(rec.capturing()).toBe(true);
    back();
    await tick();
    expect(rec.capturing()).toBe(false);
    expect(rec.log).toContain("discard:/tmp/r1.wav");
    expect(getLive().phase).toBe("asking");
  });

  it("stopping to score is not treated as leaving", async () => {
    const rec = fakeRecorder();
    begin(rec);
    const left = recordingScreenShown();
    await beginRecording();
    const done = stopAndFinish();
    left();
    await done;
    expect(rec.log.filter((l) => l.startsWith("discard"))).toEqual([]);
  });
});

