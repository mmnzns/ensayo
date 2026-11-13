import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

import { LOCK_LOST_EVENT, OTHER_COMPUTER_PREFIX, invokeGuarded, isLockLost } from "../data/lockGuard";

beforeEach(() => vi.stubGlobal("window", new EventTarget()));
afterEach(() => {
  invoke.mockReset();
  vi.unstubAllGlobals();
});

describe("a save refused because another computer has the folder", () => {
  it("is recognised from the backend's line, as a string or an error", () => {
    expect(isLockLost(`${OTHER_COMPUTER_PREFIX} on this data folder, so this change was not saved.`)).toBe(true);
    expect(isLockLost(new Error(`${OTHER_COMPUTER_PREFIX} on this data folder`))).toBe(true);
    expect(isLockLost("The data folder isn't available")).toBe(false);
    expect(isLockLost(undefined)).toBe(false);
  });

  it("tells the window and still rejects", async () => {
    const seen = vi.fn();
    window.addEventListener(LOCK_LOST_EVENT, seen);
    invoke.mockRejectedValueOnce(`${OTHER_COMPUTER_PREFIX} on this data folder`);
    await expect(invokeGuarded("save_story", { story: {} })).rejects.toContain("Another computer");
    expect(seen).toHaveBeenCalledTimes(1);
    window.removeEventListener(LOCK_LOST_EVENT, seen);
  });

  it("passes other answers and errors through without the event", async () => {
    const seen = vi.fn();
    window.addEventListener(LOCK_LOST_EVENT, seen);
    invoke.mockResolvedValueOnce(5);
    await expect(invokeGuarded("x")).resolves.toBe(5);
    invoke.mockRejectedValueOnce("Some other problem");
    await expect(invokeGuarded("x")).rejects.toBe("Some other problem");
    expect(seen).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("x", undefined);
    window.removeEventListener(LOCK_LOST_EVENT, seen);
  });
});
