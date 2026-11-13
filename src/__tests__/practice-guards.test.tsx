import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockStore } from "../data/mock";
import { StoreProvider } from "../data/store";
import type { RepApi } from "../practice/api";
import { errorPage, KEY_REJECTED, NO_SPEECH_MODEL, OFFLINE_ENGINE, providerOfRejection } from "../practice/errorRoute";
import { ASKING_SCREEN, backHomeAfterError, beginRecording, getLive, resetLive, setRepApi, startLive, startQuestionDrill, tryAgainAfterError } from "../practice/live";
import { liveContextOf } from "../practice/quick";
import { SPEECH_WARNING, speechPlan, speechWarningNeeded } from "../screens/first-run/setup";
import { registry } from "../screens/registry";

const opened = vi.hoisted(() => [] as string[]);
vi.mock("../ui/router", async (orig) => ({ ...(await orig<typeof import("../ui/router")>()), go: (id: string) => void opened.push(id) }));

const ctx = liveContextOf({ profile: { targetRole: "Senior Lifecycle Marketing Manager" }, stories: mockStore.stories, methods: mockStore.methods });
const flush = () => new Promise((r) => setTimeout(r, 0));

function api(over: Partial<RepApi> = {}): RepApi {
  return {
    startRecording: async () => {},
    stopRecording: async () => ({ path: "/tmp/r.wav", duration_ms: 1 }),
    level: async () => null,
    finishRep: async () => {
      throw new Error("unused");
    },
    rescoreRep: async () => {
      throw new Error("unused");
    },
    deleteRep: async () => {},
    labelRep: async () => {},
    nextFollowUp: async () => {
      throw new Error("unused");
    },
    clarifyReply: async () => "",
    aiReady: async () => true,
    discardRecording: async () => {},
    labelCriteria: async () => {},
    repLabels: async () => ({}),
    audioAvailable: async () => true,
    readAudio: async () => new ArrayBuffer(0),
    loadSession: async () => null,
    mockDebrief: async () => Promise.reject(new Error("no engine")),
    ...over,
  };
}

const begin = () => startLive({ mode: "drill", stage: "hiring_manager", count: 3, source: "stage" }, ctx);

beforeEach(() => {
  resetLive();
  opened.length = 0;
});

describe("the speech model is checked before the first answer", () => {
  it("opens the no-speech-model page, and the session does not start, when none is on this computer", async () => {
    setRepApi(api({ speechReady: async () => false }));
    begin();
    await flush();
    expect(getLive().active).toBe(false);
    expect(opened).toEqual([NO_SPEECH_MODEL]);
  });

  it("every starter checks, not just startLive", async () => {
    setRepApi(api({ speechReady: async () => false }));
    expect(startQuestionDrill("Why did the launch slip?", ctx)).toBe(true);
    await flush();
    expect(getLive().active).toBe(false);
    expect(opened).toEqual([NO_SPEECH_MODEL]);
  });

  it("starts as usual when a model is there", async () => {
    setRepApi(api({ speechReady: async () => true }));
    begin();
    await flush();
    expect(getLive().active).toBe(true);
    expect(opened).toEqual([]);
  });

  it("does not drop a newer session when an older check comes back late", async () => {
    let answer: (ready: boolean) => void = () => {};
    setRepApi(api({ speechReady: () => new Promise<boolean>((r) => (answer = r)) }));
    begin();
    resetLive();
    setRepApi(api({ speechReady: async () => true }));
    begin();
    answer(false);
    await flush();
    expect(getLive().active).toBe(true);
    expect(opened).toEqual([]);
  });
});

describe("an AI error on the thinking screen", () => {
  it("goes to the page for a rejected key or an unreachable engine, and stays generic otherwise", () => {
    expect(errorPage("Claude didn't accept the API key. Check it in Settings › AI.")).toBe(KEY_REJECTED);
    expect(errorPage("OpenAI didn't accept the API key. Check it in Settings › AI.")).toBe(KEY_REJECTED);
    expect(errorPage("Couldn't reach Ollama at http://localhost:11434. Is it running, and is this computer online?")).toBe(OFFLINE_ENGINE);
    expect(errorPage("Couldn't reach Claude: dns error")).toBe(OFFLINE_ENGINE);
    expect(errorPage("Claude is rate limiting or out of credit. Try again later.")).toBeNull();
    expect(errorPage("Ensayo couldn't save that.")).toBeNull();
    expect(errorPage(null)).toBeNull();
    expect(providerOfRejection("Claude didn't accept the API key. Check it in Settings › AI.")).toBe("Claude");
    expect(providerOfRejection("Something else")).toBeNull();
  });
});

describe("the error pages have working buttons in the app", () => {
  const render = (id: string) => renderToStaticMarkup(createElement(StoreProvider, { store: mockStore, children: createElement(registry[id]) }));
  const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'");

  it("show Settings, Try again and Back home when a session hit the error, naming the real provider", async () => {
    setRepApi(api({ speechReady: async () => true, startRecording: async () => Promise.reject(new Error("Gemini didn't accept the API key. Check it in Settings › AI.")) }));
    begin();
    await beginRecording();
    const key = render("states-error-key-rejected");
    expect(text(key)).toContain("Gemini didn't accept your key");
    expect(key).toContain('href="#/8-5-settings-ai"');
    expect(key).toContain(">Try again<");
    expect(key).toContain(">Back home<");
    const off = render("states-error-offline-engine");
    expect(off).toContain('href="#/8-5-settings-ai"');
    expect(off).toContain(">Try again<");
    expect(off).toContain(">Back home<");
    expect(off).not.toContain("Practice with timing only");
  });

  it("have Back home as a link in the preview too, and the speech page has Settings and Back home", () => {
    expect(render("states-error-key-rejected")).toContain('href="#/2-1-home"');
    expect(render("states-error-offline-engine")).toContain('href="#/2-1-home"');
    const speech = render("states-error-no-speech-model");
    expect(speech).toContain('href="#/8-4-settings-speech"');
    expect(speech).toContain('href="#/2-1-home"');
  });

  it("Try again goes back to the same question, and Back home ends the session", async () => {
    const discarded: string[] = [];
    setRepApi(api({ speechReady: async () => true, discardRecording: async (p) => void discarded.push(p) }));
    begin();
    await flush();
    await tryAgainAfterError((s) => opened.push(s));
    expect(getLive().phase).toBe("asking");
    expect(opened).toEqual([ASKING_SCREEN]);
    await backHomeAfterError((s) => opened.push(s));
    expect(getLive().active).toBe(false);
    expect(opened).toEqual([ASKING_SCREEN, "2-1-home"]);
  });
});

describe("the first-run Speech step", () => {
  const model = (id: string, state: "ready" | "missing") => ({ id, name: id, size_mb: 500, state }) as never;
  it("asks before Continue or Skip when no speech model is downloaded, and not when one is", () => {
    expect(speechWarningNeeded(speechPlan([model("whisper-turbo", "missing")], null))).toBe(true);
    expect(speechWarningNeeded(speechPlan([model("whisper-turbo", "ready")], null))).toBe(false);
    expect(speechWarningNeeded(null)).toBe(false);
    expect(SPEECH_WARNING).toBe("Practice won't work until a speech model is downloaded. Continue anyway?");
  });
});
