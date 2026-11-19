import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as unknown[]);
vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args: { takeOver?: boolean }) => {
    if (cmd !== "start_recording") return undefined;
    calls.push(args.takeOver);
    if (!args.takeOver) throw new Error("Already recording");
    return "Mic";
  },
}));

describe("start_recording when the recorder still holds an unowned capture", () => {
  it("retries once taking it over instead of failing", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => {} } });
    const { tauriApi, takeOverOnFirstStart } = await import("../practice/api");
    takeOverOnFirstStart(); // the first start of the window is spent
    const api = await tauriApi();
    expect(await api.startRecording()).toBe("Mic");
    expect(calls).toEqual([false, true]);
    vi.unstubAllGlobals();
  });
});
