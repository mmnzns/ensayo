import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockStore } from "../data/mock";
import { StoreProvider } from "../data/store";
import { resetLive } from "../practice/live";
import { registry } from "../screens/registry";

const app = vi.hoisted(() => ({ on: true }));
vi.mock("../data/real", async (orig) => ({ ...(await orig<Record<string, unknown>>()), isApp: () => app.on }));

const render = (id: string) => renderToStaticMarkup(createElement(StoreProvider, { store: mockStore, children: createElement(registry[id]) }));
const sample = mockStore.screens.results.mock;

afterEach(() => {
  resetLive();
  app.on = true;
});

describe.each(["4-1-mock-in-progress", "4-2-mock-your-questions"])("%s", (id) => {
  it("shows no sample application or questions in the app with no mock running", () => {
    const html = render(id);
    expect(html).toContain("No mock is running.");
    expect(html).not.toContain(mockStore.applications.find((a) => a.id === sample.applicationId)?.company ?? "~none~");
    for (const q of sample.questions) expect(html).not.toContain(q.text.replace(/'/g, "&#x27;"));
  });
  it("keeps the sample in the browser preview", () => {
    app.on = false;
    const html = render(id);
    expect(html).not.toContain("No mock is running.");
    expect(html).toContain("Mock");
  });
});
