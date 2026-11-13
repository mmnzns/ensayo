import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockStore } from "../data/mock";
import type { RepApi } from "../practice/api";
import { beginRecording, getLive, resetLive, setRepApi, startLive, restartRecording } from "../practice/live";
import { liveContextOf } from "../practice/quick";
import { micChoices } from "../screens/settings/MicrophoneCard";
import { DEFAULT_PREFS, PREFS_KEY, readPrefs, updateMic } from "../screens/settings/prefs";

const invoked = vi.hoisted(() => [] as { cmd: string; args: unknown }[]);
vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args: unknown) => {
    invoked.push({ cmd, args });
    return cmd === "start_recording" ? "Studio Mic" : cmd === "model_status" ? { state: "ready" } : undefined;
  },
}));

function storage(initial?: string) {
  const data = new Map<string, string>(initial === undefined ? [] : [[PREFS_KEY, initial]]);
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

beforeEach(() => {
  invoked.length = 0;
  resetLive();
});

describe("the chosen microphone", () => {
  it("is saved in prefs, empty by default, and survives a damaged value", () => {
    const s = storage();
    expect(readPrefs(s).mic).toEqual(DEFAULT_PREFS.mic);
    updateMic({ device: "USB Mic" }, s);
    expect(readPrefs(s).mic.device).toBe("USB Mic");
    expect(readPrefs(storage(JSON.stringify({ mic: { device: 4 } }))).mic.device).toBe("");
  });

  it("reaches start_recording as `device`, and the name that opened comes back", async () => {
    vi.stubGlobal("window", { localStorage: storage(JSON.stringify({ mic: { device: "USB Mic" } })) });
    const { tauriApi } = await import("../practice/api");
    const api = await tauriApi();
    expect(await api.startRecording()).toBe("Studio Mic");
    expect(invoked.find((i) => i.cmd === "start_recording")?.args).toEqual({ device: "USB Mic" });
    invoked.length = 0;
    vi.stubGlobal("window", { localStorage: storage() });
    await api.startRecording();
    expect(invoked.find((i) => i.cmd === "start_recording")?.args).toEqual({ device: null });
    vi.unstubAllGlobals();
  });

  it("is listed with System default first, and a saved one that is unplugged stays visible", () => {
    expect(micChoices(["A", "B"], "")).toEqual([{ value: "", label: "System default" }, { value: "A", label: "A" }, { value: "B", label: "B" }]);
    expect(micChoices(["A"], "Gone")[2]).toEqual({ value: "Gone", label: "Gone (not connected)" });
  });

  it("its name is kept for the recording screen", async () => {
    const api = { startRecording: async () => "Studio Mic", stopRecording: async () => ({ path: "p", duration_ms: 1 }), discardRecording: async () => {}, warmSpeech: async () => {}, speechReady: async () => true, aiReady: async () => true } as unknown as RepApi;
    setRepApi(api);
    startLive({ mode: "drill", stage: "hiring_manager", count: 3, source: "stage" }, liveContextOf({ profile: { targetRole: "Senior Lifecycle Marketing Manager" }, stories: mockStore.stories, methods: mockStore.methods }));
    await beginRecording();
    expect(getLive().micName).toBe("Studio Mic");
    await restartRecording();
    expect(getLive().micName).toBe("Studio Mic");
  });
});
