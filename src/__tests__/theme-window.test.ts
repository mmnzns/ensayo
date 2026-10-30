import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setTheme = vi.fn().mockResolvedValue(undefined);
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ setTheme }) }));

import { applyStoredTheme, applyTheme } from "../screens/settings/theme";

// The test environment is Node, so the window and the page are small stand-ins.
const store = new Map<string, string>();
const localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
const stubWindow = (inApp: boolean) => vi.stubGlobal("window", inApp ? { localStorage, __TAURI_INTERNALS__: {} } : { localStorage });

describe("window theme", () => {
  beforeEach(() => {
    setTheme.mockClear();
    store.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("does nothing in a browser", async () => {
    stubWindow(false);
    applyTheme("dark");
    await Promise.resolve();
    expect(setTheme).not.toHaveBeenCalled();
  });

  it("forces the native theme for Light and Dark and releases it for Auto", async () => {
    stubWindow(true);
    for (const [i, mode] of (["dark", "light", "auto"] as const).entries()) {
      applyTheme(mode);
      await vi.waitFor(() => expect(setTheme.mock.calls.length).toBe(i + 1));
    }
    expect(setTheme.mock.calls.map((c) => c[0])).toEqual(["dark", "light", null]);
  });

  it("applies the saved choice at start", async () => {
    stubWindow(true);
    store.set("ensayo.theme", "dark");
    applyStoredTheme();
    await vi.waitFor(() => expect(setTheme).toHaveBeenCalledWith("dark"));
  });
});
