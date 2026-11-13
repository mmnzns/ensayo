import { beforeEach, describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import type { RepApi } from "../practice/api";
import { takeOverOnFirstStart } from "../practice/api";
import { beginRecording, getLive, MIC_LOST, micLost, recordAgainAfterLoss, resetLive, retryFinish, SCORE_LOST_MIN_MS, setRepApi, startLive } from "../practice/live";
import { liveContextOf } from "../practice/quick";
import type { RepOutcome } from "../practice/types";

const ctx = liveContextOf({ profile: { targetRole: "Senior Lifecycle Marketing Manager" }, stories: mockStore.stories, methods: mockStore.methods });
const caught: RepOutcome = { outcome: "didnt_catch", session_id: "s", rep: null, delta: null, restart_offered: false, audio_kept: false, notice: null, transcript_text: null };

function setup(stop: RepApi["stopRecording"]) {
  const log: string[] = [];
  resetLive();
  setRepApi({
    startRecording: async () => (log.push("start"), "Mic"),
    stopRecording: stop,
    level: async () => ({ level: 0, elapsed_ms: 5000, failed: true }),
    finishRep: async (a: { audio_path: string }) => (log.push(`finish:${a.audio_path}`), caught),
    discardRecording: async (p: string) => void log.push(`discard:${p}`),
    warmSpeech: async () => {},
    aiReady: async () => true,
    speechReady: async () => true,
  } as unknown as RepApi);
  startLive({ mode: "drill", stage: "hiring_manager", count: 3, source: "stage" }, ctx);
  return log;
}

describe("a lost microphone", () => {
  beforeEach(() => resetLive());

  it("stops the answer with the plain message and keeps the audio so far", async () => {
    setup(async () => ({ path: "/tmp/part.wav", duration_ms: 7000 }));
    await beginRecording();
    await micLost();
    const s = getLive();
    expect(s.phase).toBe("mic_lost");
    expect(s.error).toBe("The microphone went away. Plug it back in and press Record again.");
    expect(MIC_LOST).toBe(s.error);
    expect(s.recordingPath).toBe("/tmp/part.wav");
    expect(s.lostMs).toBeGreaterThan(SCORE_LOST_MIN_MS);
  });

  it("Score what I said runs the normal finish on that file", async () => {
    const log = setup(async () => ({ path: "/tmp/part.wav", duration_ms: 7000 }));
    await beginRecording();
    await micLost();
    await retryFinish();
    expect(log).toContain("finish:/tmp/part.wav");
    expect(log.some((l) => l.startsWith("discard"))).toBe(false);
  });

  it("a short answer is not offered for scoring, and Record again throws it away and starts again", async () => {
    const log = setup(async () => ({ path: "/tmp/short.wav", duration_ms: 1500 }));
    await beginRecording();
    await micLost();
    expect(getLive().lostMs).toBeLessThanOrEqual(SCORE_LOST_MIN_MS);
    await recordAgainAfterLoss();
    expect(log).toContain("discard:/tmp/short.wav");
    expect(getLive().phase).toBe("recording");
    expect(getLive().recordingPath).toBeNull();
  });

  it("with no audio at all there is nothing to keep", async () => {
    setup(async () => {
      throw new Error("No audio came");
    });
    await beginRecording();
    await micLost();
    expect(getLive().phase).toBe("mic_lost");
    expect(getLive().recordingPath).toBeNull();
  });

  it("only acts while recording", async () => {
    setup(async () => ({ path: "/tmp/x.wav", duration_ms: 9000 }));
    await micLost();
    expect(getLive().phase).toBe("asking");
  });
});

describe("taking over after a reload", () => {
  it("only the first start of a window asks to take over", () => {
    const first = takeOverOnFirstStart();
    expect(typeof first).toBe("boolean");
    expect(takeOverOnFirstStart()).toBe(false);
  });
});
