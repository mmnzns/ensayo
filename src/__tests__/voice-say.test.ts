// say() with a fake speechSynthesis and a fake backend: the saved engine speaks first, the other is the fallback.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PREFS_KEY } from "../screens/settings/prefs";

type Utter = { text: string; rate: number; voice?: unknown; lang?: string; onstart?: () => void; onend?: () => void; onerror?: (e: { error: string }) => void };

let calls: { cmd: string; args?: Record<string, unknown> }[] = [];
let backend: Record<string, (args?: Record<string, unknown>) => unknown> = {};
let spoken: Utter[] = [];
let browserBehaviour: "speak" | "fail" | "silent" = "speak";
let browserVoices: { voiceURI: string; name: string; lang: string }[] = [];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args?: Record<string, unknown>) => {
    calls.push({ cmd, args });
    const h = backend[cmd];
    if (!h) throw new Error("no such command " + cmd);
    return h(args);
  },
}));

function installWindow(saved: object | null, app: boolean) {
  const store = new Map<string, string>();
  if (saved) store.set(PREFS_KEY, JSON.stringify({ voice: saved }));
  const synth = {
    getVoices: () => browserVoices,
    cancel: vi.fn(),
    speak: (u: Utter) => {
      spoken.push(u);
      if (browserBehaviour === "speak") queueMicrotask(() => { u.onstart?.(); u.onend?.(); });
      if (browserBehaviour === "fail") queueMicrotask(() => u.onerror?.({ error: "synthesis-failed" }));
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const win: Record<string, unknown> = {
    speechSynthesis: synth,
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
  };
  if (app) win.__TAURI_INTERNALS__ = {};
  vi.stubGlobal("window", win);
  vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(public text: string) {} rate = 1; } );
}

const loadVoice = async () => (await import("../practice/voice"));
const ended = (say: (t: string, cb: (s: boolean) => void) => boolean, text = "Hello") => new Promise<{ started: boolean; spoke: boolean }>((resolve) => { const started = say(text, (spoke) => resolve({ started, spoke })); if (!started) resolve({ started, spoke: false }); });

beforeEach(() => {
  vi.resetModules();
  calls = [];
  spoken = [];
  browserBehaviour = "speak";
  browserVoices = [{ voiceURI: "Samantha", name: "Samantha", lang: "en-US" }];
  backend = { native_voices: () => [{ id: "Alex", name: "Alex", language: "en_US" }], speak_native: () => "finished", stop_speaking_native: () => undefined };
});
afterEach(() => vi.unstubAllGlobals());

describe("say(): engine choice and fallback", () => {
  it("an old save (no engine) speaks with the browser first", async () => {
    installWindow({ voiceUri: "Samantha" }, true);
    const { say } = await loadVoice();
    expect(await ended(say)).toEqual({ started: true, spoke: true });
    expect(spoken).toHaveLength(1);
    expect(calls.filter((c) => c.cmd === "speak_native")).toHaveLength(0);
  });

  it("a saved system voice speaks through the backend, with the speed multiplier and the voice id", async () => {
    installWindow({ engine: "system", voiceUri: "Alex", speed: "Faster" }, true);
    const { say, loadNativeVoices } = await loadVoice();
    await loadNativeVoices();
    expect(await ended(say, "A question")).toEqual({ started: true, spoke: true });
    expect(calls.find((c) => c.cmd === "speak_native")?.args).toEqual({ text: "A question", voiceId: "Alex", rate: 1.2 });
    expect(spoken).toHaveLength(0);
  });

  it("falls back to the system when the browser engine fails", async () => {
    installWindow({ voiceUri: "" }, true);
    browserBehaviour = "fail";
    const { say } = await loadVoice();
    expect(await ended(say)).toEqual({ started: true, spoke: true });
    expect(spoken).toHaveLength(1);
    expect(calls.find((c) => c.cmd === "speak_native")?.args).toMatchObject({ voiceId: "" });
  });

  it("falls back to the browser when the system voice fails", async () => {
    installWindow({ engine: "system", voiceUri: "Alex" }, true);
    backend.speak_native = () => { throw new Error("say not found"); };
    const { say } = await loadVoice();
    expect(await ended(say)).toEqual({ started: true, spoke: true });
    expect(spoken).toHaveLength(1);
  });

  it("with no browser voices, the system speaks", async () => {
    installWindow({}, true);
    browserVoices = [];
    const { say, loadNativeVoices } = await loadVoice();
    await loadNativeVoices();
    expect(await ended(say)).toEqual({ started: true, spoke: true });
    expect(spoken).toHaveLength(0);
    expect(calls.some((c) => c.cmd === "speak_native")).toBe(true);
  });

  it("with no voice listed anywhere, the browser is still tried as a last resort, as before", async () => {
    installWindow({}, true);
    browserVoices = [];
    backend.native_voices = () => [];
    const { say, loadNativeVoices } = await loadVoice();
    await loadNativeVoices();
    expect(await ended(say)).toEqual({ started: true, spoke: true });
    expect(spoken).toHaveLength(1);
    expect(calls.some((c) => c.cmd === "speak_native")).toBe(false);
  });

  it("with no speech engine at all, say() returns false", async () => {
    installWindow({}, false);
    vi.stubGlobal("SpeechSynthesisUtterance", undefined);
    const { say } = await loadVoice();
    expect((await ended(say)).started).toBe(false);
  });

  it("in the browser preview (no app) nothing changes: the browser speaks, the backend is never asked", async () => {
    installWindow({ engine: "system", voiceUri: "Alex" }, false);
    const { say } = await loadVoice();
    expect(await ended(say)).toEqual({ started: true, spoke: true });
    expect(calls).toEqual([]);
    expect(spoken).toHaveLength(1);
  });

  it("both engines failing reports that nothing spoke", async () => {
    installWindow({}, true);
    browserBehaviour = "fail";
    backend.speak_native = () => { throw new Error("no"); };
    const { say } = await loadVoice();
    expect(await ended(say)).toEqual({ started: true, spoke: false });
  });

  it("stopSaying stops the system voice while it is speaking", async () => {
    installWindow({ engine: "system", voiceUri: "Alex" }, true);
    let release: (v: string) => void = () => {};
    backend.speak_native = () => new Promise((r) => (release = r));
    const { say, stopSaying } = await loadVoice();
    const done = ended(say);
    await new Promise((r) => setTimeout(r, 0));
    stopSaying();
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.some((c) => c.cmd === "stop_speaking_native")).toBe(true);
    release("stopped");
    expect(await done).toEqual({ started: true, spoke: true });
  });
});
