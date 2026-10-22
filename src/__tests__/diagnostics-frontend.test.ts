import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

import { clip, describeError, installErrorLogging, MAX_LOG_CHARS, startErrorLogging, tauriDiagnostics } from "../data/diagnostics";

/** A stand-in for `window`: remembers the listeners so a test can fire an event. */
function fakeWindow() {
  const listeners: Record<string, (e: unknown) => void> = {};
  return {
    target: { addEventListener: (type: string, fn: (e: unknown) => void) => void (listeners[type] = fn) } as never,
    fire: (type: string, event: unknown) => listeners[type](event),
    has: (type: string) => type in listeners,
  };
}

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
  delete (globalThis as { window?: unknown }).window;
});

describe("errors in the window reach the log", () => {
  it("sends a window error with its message, where it happened and its stack", () => {
    const w = fakeWindow();
    const send = vi.fn();
    installErrorLogging(w.target, send);
    const error = new Error("Cannot read properties of undefined");
    w.fire("error", { message: "Uncaught Error: Cannot read properties of undefined", filename: "tauri://localhost/assets/index-abc.js", lineno: 12, colno: 7, error });
    expect(send).toHaveBeenCalledTimes(1);
    const [level, message, origin] = send.mock.calls[0];
    expect(level).toBe("error");
    expect(origin).toBe("window.onerror");
    expect(message).toContain("Cannot read properties of undefined");
    expect(message).toContain("index-abc.js:12:7");
    expect(message).not.toContain("tauri://localhost");
  });

  it("sends an unhandled promise rejection, whether it is an Error or plain text", () => {
    const w = fakeWindow();
    const send = vi.fn();
    installErrorLogging(w.target, send);
    w.fire("unhandledrejection", { reason: new Error("load_all failed") });
    w.fire("unhandledrejection", { reason: "The data folder isn't available" });
    expect(send.mock.calls.map((c) => [c[0], c[2]])).toEqual([["error", "unhandledrejection"], ["error", "unhandledrejection"]]);
    expect(send.mock.calls[0][1]).toContain("load_all failed");
    expect(send.mock.calls[1][1]).toBe("The data folder isn't available");
  });

  it("cuts a long message to 2 KB before it crosses over", () => {
    const w = fakeWindow();
    const send = vi.fn();
    installErrorLogging(w.target, send);
    w.fire("unhandledrejection", { reason: "x".repeat(10_000) });
    expect(send.mock.calls[0][1].length).toBeLessThanOrEqual(MAX_LOG_CHARS + 3);
    expect(clip("short")).toBe("short");
  });

  it("never throws back into the page, even when the log command fails", async () => {
    const w = fakeWindow();
    installErrorLogging(w.target, () => Promise.reject(new Error("no backend")));
    expect(() => w.fire("error", { message: "boom" })).not.toThrow();
    const sync = fakeWindow();
    installErrorLogging(sync.target, () => {
      throw new Error("sync failure");
    });
    expect(() => sync.fire("unhandledrejection", { reason: "x" })).not.toThrow();
    await Promise.resolve();
  });

  it("describes anything thrown", () => {
    expect(describeError({ code: 7 })).toBe('{"code":7}');
    expect(describeError(undefined)).toBe("undefined");
    expect(describeError(new Error("plain"))).toContain("plain");
  });
});

describe("the hook reaches the log command", () => {
  it("in the app, window errors call log_frontend with level, message and origin", async () => {
    const w = fakeWindow();
    (globalThis as { window?: unknown }).window = Object.assign(w.target, { __TAURI_INTERNALS__: {} });
    startErrorLogging();
    expect(w.has("error") && w.has("unhandledrejection")).toBe(true);
    w.fire("unhandledrejection", { reason: new Error("Couldn't read the story") });
    await Promise.resolve();
    expect(invoke).toHaveBeenCalledTimes(1);
    const [command, args] = invoke.mock.calls[0];
    expect(command).toBe("log_frontend");
    expect(args).toMatchObject({ level: "error", origin: "unhandledrejection" });
    expect(args.message).toContain("Couldn't read the story");
  });

  it("in the browser preview there is no bridge and nothing is installed", () => {
    const w = fakeWindow();
    (globalThis as { window?: unknown }).window = w.target;
    expect(tauriDiagnostics()).toBeNull();
    startErrorLogging();
    expect(w.has("error")).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("asks for the diagnostics, the log folder and the log through their commands", async () => {
    (globalThis as { window?: unknown }).window = { __TAURI_INTERNALS__: {} };
    invoke.mockResolvedValue("the block");
    const bridge = tauriDiagnostics()!;
    expect(await bridge.text("whisper-turbo")).toBe("the block");
    expect(invoke).toHaveBeenLastCalledWith("diagnostics", { speechModel: "whisper-turbo" });
    await bridge.text("");
    expect(invoke).toHaveBeenLastCalledWith("diagnostics", { speechModel: null });
    await bridge.reveal();
    expect(invoke).toHaveBeenLastCalledWith("reveal_logs");
  });
});
