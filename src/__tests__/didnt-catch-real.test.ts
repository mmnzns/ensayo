import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockStore } from "../data/mock";
import { StoreProvider } from "../data/store";
import { resetLive, setRepApi, startLive } from "../practice/live";
import { liveContextOf } from "../practice/quick";
import { registry } from "../screens/registry";

const app = vi.hoisted(() => ({ on: true }));
vi.mock("../data/real", async (orig) => ({ ...(await orig<Record<string, unknown>>()), isApp: () => app.on }));

const render = () => renderToStaticMarkup(createElement(StoreProvider, { store: mockStore, children: createElement(registry["states-didnt-catch-that"]) }));
const ctx = liveContextOf({ profile: { targetRole: "Lead" }, stories: mockStore.stories, methods: mockStore.methods });

afterEach(() => {
  resetLive();
  setRepApi(null);
  app.on = true;
});

describe("Didn't catch that in the app", () => {
  it("shows no sample numbers or labels with no live session", () => {
    const html = render();
    expect(html).not.toContain("1.8");
    expect(html).not.toContain("2 of 5");
    expect(html).toContain("too little speech");
  });
  it("shows the live session's own header and the real minimum", () => {
    setRepApi({ aiReady: async () => true } as never);
    startLive({ mode: "drill", stage: "hiring_manager", count: 3, source: "stage" }, ctx);
    const html = render();
    expect(html).not.toContain("1.8");
    expect(html).not.toContain("Hiring manager · 2 of 5");
    expect(html).toContain("1 of 3");
    expect(html).toContain("at least 3 seconds");
  });
  it("keeps the sample in the browser preview", () => {
    app.on = false;
    expect(render()).toContain("1.8 seconds");
  });
});
