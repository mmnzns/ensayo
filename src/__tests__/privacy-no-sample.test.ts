import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockStore } from "../data/mock";
import { StoreProvider } from "../data/store";
import { registry } from "../screens/registry";

const app = vi.hoisted(() => ({ on: true }));
vi.mock("../data/real", async (orig) => ({ ...(await orig<Record<string, unknown>>()), isApp: () => app.on }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: () => new Promise(() => {}) }));

const render = () => renderToStaticMarkup(createElement(StoreProvider, { store: mockStore, children: createElement(registry["8-6-settings-privacy"]) }));

afterEach(() => {
  app.on = true;
});

describe("Settings, Privacy before the real values are known", () => {
  it("shows none of the sample setup in the app", () => {
    const html = render();
    expect(html).not.toContain("412 MB");
    expect(html).not.toContain("Anthropic");
    expect(html).not.toContain("Whisper");
    expect(html).toContain("Loading");
    expect(html).not.toContain("Sent to");
    expect(html).toContain("Reading your setup.");
  });
  it("keeps the sample in the browser preview", () => {
    app.on = false;
    const html = render();
    expect(html).toContain("412 MB");
    expect(html).toContain("Anthropic");
  });
});
