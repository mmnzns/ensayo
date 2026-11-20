import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import { StoreProvider } from "../data/store";
import type { RepApi } from "../practice/api";
import { beginRecording, resetLive, restartRecording, setRepApi, startLive } from "../practice/live";
import { liveContextOf } from "../practice/quick";
import PracticeRecording from "../screens/practice/PracticeRecording";
import { runKey } from "../screens/practice/useKeys";

const ctx = liveContextOf({ profile: { targetRole: "Senior Lifecycle Marketing Manager" }, stories: mockStore.stories, methods: mockStore.methods });
const render = () => renderToStaticMarkup(createElement(StoreProvider, { store: mockStore, children: createElement(PracticeRecording) }));

describe("the recording screen", () => {
  it("has a round Start over button with R, no footer link", () => {
    resetLive();
    const html = render();
    expect(html).toContain('aria-label="Start over"');
        expect(html).toMatch(/Start over<\/span><span[^>]*>or press <span class="e-kbd">R</);
    expect(html).not.toContain("e-btn-ghost e-btn-sm\">Start over");
    expect(html).not.toContain("—");
  });

  it("Start over (button and R) throws the take away and records again", async () => {
    const log: string[] = [];
    resetLive();
    setRepApi({
      startRecording: async () => (log.push("start"), "Mic"),
      stopRecording: async () => (log.push("stop"), { path: "/tmp/a.wav", duration_ms: 5000 }),
      discardRecording: async (p: string) => void log.push(`discard:${p}`),
      warmSpeech: async () => {},
      aiReady: async () => true,
      speechReady: async () => true,
    } as unknown as RepApi);
    startLive({ mode: "drill", stage: "hiring_manager", count: 3, source: "stage" }, ctx);
    await beginRecording();
    await restartRecording();
    expect(log).toEqual(["start", "stop", "discard:/tmp/a.wav", "start"]);
  });

  it("R is wired to Start over: the key and the button share one handler", () => {
    let overs = 0;
    const press = (key: string) => runKey({ key, repeat: false, metaKey: false, ctrlKey: false, altKey: false, preventDefault: () => {}, target: { tagName: "DIV" } }, { r: () => void overs++ });
    expect(press("r")).toBe(true);
    expect(press("R")).toBe(true);
    expect(overs).toBe(2);
  });
});
