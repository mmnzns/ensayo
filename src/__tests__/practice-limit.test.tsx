import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import type { RepApi } from "../practice/api";
import { LIMIT_SECONDS, LIMIT_STOPPED, LIMIT_WARNING, WARN_AT_SECONDS, limitState } from "../practice/limit";
import { beginRecording, getLive, recordingStatus, resetLive, setRecordingPaused, setRepApi, startLive, stopAndFinish } from "../practice/live";
import { liveContextOf } from "../practice/quick";
import type { RepOutcome } from "../practice/types";
import { LimitNotice } from "../screens/practice/PracticeRecording";
import { runKey } from "../screens/practice/useKeys";

describe("the four minute limit", () => {
  it("warns at 3:30 and not before", () => {
    expect(WARN_AT_SECONDS).toBe(210);
    expect(limitState(209)).toBe("ok");
    expect(limitState(210)).toBe("warn");
    expect(renderToStaticMarkup(createElement(LimitNotice, { seconds: 209 }))).toBe("");
    const shown = renderToStaticMarkup(createElement(LimitNotice, { seconds: 210 }));
    expect(shown).toContain("30 seconds left");
    expect(shown).toContain('role="status"');
    expect(LIMIT_WARNING).toBe("30 seconds left");
  });

  it("stops at 4:00 and says why in plain words", () => {
    expect(limitState(LIMIT_SECONDS - 1)).toBe("warn");
    expect(limitState(LIMIT_SECONDS)).toBe("stop");
    expect(LIMIT_STOPPED).toBe("The answer reached the 4 minute limit, so recording stopped.");
  });

  it("P pauses, and does not fire inside a field", () => {
    let paused = 0;
    const press = (key: string, target: unknown) => runKey({ key, repeat: false, metaKey: false, ctrlKey: false, altKey: false, preventDefault: () => {}, target }, { p: () => void paused++ });
    expect(press("p", { tagName: "DIV" })).toBe(true);
    expect(press("P", { tagName: "BODY" })).toBe(true);
    expect(press("p", { tagName: "TEXTAREA" })).toBe(false);
    expect(paused).toBe(2);
  });
});

const ctx = liveContextOf({ profile: { targetRole: "Senior Lifecycle Marketing Manager" }, stories: mockStore.stories, methods: mockStore.methods });
const scored: RepOutcome = { outcome: "didnt_catch", session_id: "s", rep: null, delta: null, restart_offered: false, audio_kept: false, notice: null, transcript_text: null };

describe("pausing and stopping at the limit from the live loop", () => {
  const calls: string[] = [];
  beforeEach(() => {
    calls.length = 0;
    resetLive();
    setRepApi({
      startRecording: async () => "Mic",
      stopRecording: async () => ({ path: "/tmp/a.wav", duration_ms: 240_000 }),
      level: async () => ({ level: 0.3, elapsed_ms: 12_000, paused: true }),
      pauseRecording: async () => void calls.push("pause"),
      resumeRecording: async () => void calls.push("resume"),
      finishRep: async () => scored,
      discardRecording: async () => {},
      aiReady: async () => true,
      speechReady: async () => true,
    } as unknown as RepApi);
    startLive({ mode: "drill", stage: "hiring_manager", count: 3, source: "stage" }, ctx);
  });

  it("asks the recorder to pause and resume, and reads recorded time and the pause state back", async () => {
    await beginRecording();
    await setRecordingPaused(true);
    await setRecordingPaused(false);
    expect(calls).toEqual(["pause", "resume"]);
    expect(await recordingStatus()).toEqual({ level: 0.3, elapsed_ms: 12_000, paused: true });
  });

  it("keeps why it stopped for the next screen, and clears it for the next recording", async () => {
    await beginRecording();
    await stopAndFinish(LIMIT_STOPPED);
    expect(getLive().stopNote).toBe(LIMIT_STOPPED);
    await beginRecording();
    expect(getLive().stopNote).toBeNull();
  });
});
