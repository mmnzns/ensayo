import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { engineOrder, NO_BROWSER_VOICE, NO_VOICE, PROBE_WAIT_MS, probeBrowserVoices, speakInOrder, voiceMode, type ProbeSource, type Timers } from "../practice/voiceEngine";
import type { VoiceLike } from "../screens/settings/prefs";

const voice = (name: string): VoiceLike => ({ voiceURI: name, name, lang: "en-US" });

/** A fake browser: `voices` is what getVoices() returns now; `fire` is the voiceschanged event. */
function fakeSource(initial: VoiceLike[]) {
  let voices = initial;
  const listeners = new Set<() => void>();
  const source: ProbeSource = {
    getVoices: () => voices,
    onChange: (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
  };
  return {
    source,
    listeners,
    set: (v: VoiceLike[]) => (voices = v),
    fire: () => [...listeners].forEach((cb) => cb()),
  };
}

describe("the voice probe (nothing is spoken)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const timers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };
  const settled = (p: Promise<unknown>) => {
    let done = false;
    void p.then(() => (done = true));
    return () => done;
  };

  it("waits two seconds, no more", () => {
    expect(PROBE_WAIT_MS).toBe(2000);
  });

  it("no speech synthesis at all: none, at once", async () => {
    expect(await probeBrowserVoices(null)).toEqual([]);
  });

  it("voices already listed: those, at once, without listening", async () => {
    const f = fakeSource([voice("Samantha")]);
    expect(await probeBrowserVoices(f.source, 2000, timers)).toEqual([voice("Samantha")]);
    expect(f.listeners.size).toBe(0);
  });

  it("empty list, then voiceschanged brings voices: those, before the time is up", async () => {
    const f = fakeSource([]);
    const p = probeBrowserVoices(f.source, 2000, timers);
    const done = settled(p);
    await vi.advanceTimersByTimeAsync(500);
    expect(done()).toBe(false);
    f.set([voice("Zira")]);
    f.fire();
    expect(await p).toEqual([voice("Zira")]);
    expect(f.listeners.size).toBe(0);
  });

  it("empty list, voiceschanged that is still empty: keeps waiting, then none", async () => {
    const f = fakeSource([]);
    const p = probeBrowserVoices(f.source, 2000, timers);
    const done = settled(p);
    await vi.advanceTimersByTimeAsync(300);
    f.fire();
    await vi.advanceTimersByTimeAsync(1000);
    expect(done()).toBe(false);
    await vi.advanceTimersByTimeAsync(800);
    expect(await p).toEqual([]);
    expect(f.listeners.size).toBe(0);
  });

  it("empty list and no event: none after two seconds", async () => {
    const f = fakeSource([]);
    const p = probeBrowserVoices(f.source, 2000, timers);
    const done = settled(p);
    await vi.advanceTimersByTimeAsync(1999);
    expect(done()).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(await p).toEqual([]);
  });

  it("voices that arrive without an event are still found when time runs out", async () => {
    const f = fakeSource([]);
    const p = probeBrowserVoices(f.source, 2000, timers);
    f.set([voice("Late")]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await p).toEqual([voice("Late")]);
  });

  it("a browser that throws counts as none", async () => {
    const source: ProbeSource = { getVoices: () => { throw new Error("no"); }, onChange: () => () => {} };
    const p = probeBrowserVoices(source, 2000, timers);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await p).toEqual([]);
  });
});

describe("what Settings, Voice says", () => {
  it("browser voices: the list", () => {
    expect(voiceMode(3, 0)).toBe("list");
    expect(voiceMode(1, 12)).toBe("list");
  });
  it("no browser voice but the system has one: the system stands in", () => {
    expect(voiceMode(0, 5)).toBe("system");
  });
  it("neither: none", () => {
    expect(voiceMode(0, 0)).toBe("none");
  });
  it("uses the decided words", () => {
    expect(NO_BROWSER_VOICE).toBe("No voice from the app's browser engine on this computer, so Ensayo uses your system's voice.");
    expect(NO_VOICE).toBe("No voice available. Questions are shown, not spoken.");
  });
});

describe("which engine speaks first", () => {
  it("the saved engine first, the other as the fallback", () => {
    expect(engineOrder("browser", { browser: true, system: true })).toEqual(["browser", "system"]);
    expect(engineOrder("system", { browser: true, system: true })).toEqual(["system", "browser"]);
  });
  it("an engine with no voices is left out", () => {
    expect(engineOrder("browser", { browser: false, system: true })).toEqual(["system"]);
    expect(engineOrder("system", { browser: true, system: false })).toEqual(["browser"]);
    expect(engineOrder("browser", { browser: false, system: false })).toEqual([]);
  });
});

describe("falling back when an engine fails", () => {
  it("stops at the first engine that speaks", async () => {
    const tried: string[] = [];
    const spoke = await speakInOrder(["browser", "system"], async (e) => (tried.push(e), true));
    expect(spoke).toBe(true);
    expect(tried).toEqual(["browser"]);
  });

  it("tries the other engine when the first fails or throws", async () => {
    const tried: string[] = [];
    expect(await speakInOrder(["browser", "system"], async (e) => (tried.push(e), false))).toBe(false);
    expect(tried).toEqual(["browser", "system"]);
    const t2: string[] = [];
    expect(await speakInOrder(["system", "browser"], async (e) => { t2.push(e); if (e === "system") throw new Error("boom"); return true; })).toBe(true);
    expect(t2).toEqual(["system", "browser"]);
  });

  it("tells the attempt which engine is the last one", async () => {
    const last: boolean[] = [];
    await speakInOrder(["browser", "system"], async (_e, isLast) => (last.push(isLast), false));
    expect(last).toEqual([false, true]);
  });

  it("a line that was stopped does not fall through to the next engine", async () => {
    let live = true;
    const tried: string[] = [];
    const spoke = await speakInOrder(["browser", "system"], async (e) => { tried.push(e); live = false; return false; }, () => live);
    expect(tried).toEqual(["browser"]);
    expect(spoke).toBe(true);
  });

  it("no engines: nothing spoke", async () => {
    expect(await speakInOrder([], async () => true)).toBe(false);
  });
});
