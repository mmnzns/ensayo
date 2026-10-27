import { beforeEach, describe, expect, it } from "vitest";
import { bannerVisible, checkNow, checkText, found, install, later, liveText, phaseText, progressed, resetUpdateForTests, showBanner, start, updateSnapshot, type UpdateBridge } from "../data/updates";

const bridge = (over: Partial<UpdateBridge> = {}): UpdateBridge => ({
  pending: () => Promise.resolve(null),
  check: () => Promise.resolve(null),
  install: () => Promise.resolve(),
  onAvailable: () => {},
  onProgress: () => {},
  ...over,
});

describe("the pending update", () => {
  beforeEach(() => resetUpdateForTests());

  it("shows the banner when a check finds a version", () => {
    expect(bannerVisible(updateSnapshot())).toBe(false);
    found({ version: "0.2.0" });
    expect(bannerVisible(updateSnapshot())).toBe(true);
  });

  it("Later hides it for that version only, and a newer one shows again", () => {
    found({ version: "0.2.0" });
    later();
    expect(bannerVisible(updateSnapshot())).toBe(false);
    expect(updateSnapshot().pending?.version).toBe("0.2.0");
    found({ version: "0.2.0" }); // the next 6-hour check
    expect(bannerVisible(updateSnapshot())).toBe(false);
    found({ version: "0.3.0" });
    expect(bannerVisible(updateSnapshot())).toBe(true);
  });

  it("See what's new brings it back", () => {
    found({ version: "0.2.0" });
    later();
    showBanner();
    expect(bannerVisible(updateSnapshot())).toBe(true);
  });

  it("asks Rust once at start and listens for the rest", async () => {
    let available!: (p: { version: string }) => void;
    let progress!: (p: { percent: number }) => void;
    start(bridge({ pending: () => Promise.resolve({ version: "0.2.0" }), onAvailable: (cb) => (available = cb), onProgress: (cb) => (progress = cb) }));
    await Promise.resolve();
    await Promise.resolve();
    expect(updateSnapshot().pending?.version).toBe("0.2.0");
    available({ version: "0.3.0" });
    expect(updateSnapshot().pending?.version).toBe("0.3.0");
    progress({ percent: 12 });
    expect(updateSnapshot().phase).toEqual({ state: "installing", percent: 12 });
  });

  it("Update now shows progress, then Restarting", async () => {
    found({ version: "0.2.0" });
    let finish!: () => void;
    const running = install(bridge({ install: () => new Promise<void>((r) => (finish = r)) }));
    expect(updateSnapshot().phase).toEqual({ state: "installing", percent: null });
    finish();
    await running;
    expect(updateSnapshot().phase).toEqual({ state: "restarting" });
  });

  it("a refusal (recording) or failure is shown in plain words, and Later clears it", async () => {
    found({ version: "0.2.0" });
    await install(bridge({ install: () => Promise.reject("Finish or stop your recording first, then update.") }));
    expect(updateSnapshot().phase).toEqual({ state: "error", message: "Finish or stop your recording first, then update." });
    expect(bannerVisible(updateSnapshot())).toBe(true);
    later();
    expect(updateSnapshot().phase).toEqual({ state: "idle" });
    expect(bannerVisible(updateSnapshot())).toBe(false);
  });

  it("a second click while installing does nothing", async () => {
    found({ version: "0.2.0" });
    let calls = 0;
    const b = bridge({ install: () => (calls++, new Promise<void>(() => {})) });
    void install(b);
    void install(b);
    expect(calls).toBe(1);
  });

  it("does nothing without the app (browser preview)", async () => {
    await install(null);
    await checkNow(null);
    start(null);
    expect(updateSnapshot().phase).toEqual({ state: "idle" });
    expect(updateSnapshot().check).toEqual({ state: "idle" });
    expect(bannerVisible(updateSnapshot())).toBe(false);
  });

  it("progress events set the phase, and an error ends it", () => {
    progressed({ percent: 40 });
    expect(updateSnapshot().phase).toEqual({ state: "installing", percent: 40 });
    progressed({ error: "The update didn't install" });
    expect(updateSnapshot().phase).toEqual({ state: "error", message: "The update didn't install" });
    progressed({ percent: 100, restarting: true });
    expect(updateSnapshot().phase).toEqual({ state: "restarting" });
  });
});

describe("Check for updates", () => {
  beforeEach(() => resetUpdateForTests());

  it("says up to date", async () => {
    await checkNow(bridge());
    expect(checkText(updateSnapshot().check)).toBe("You're up to date");
  });

  it("names the version it found and makes it the pending one", async () => {
    await checkNow(bridge({ check: () => Promise.resolve({ version: "0.2.0" }) }));
    expect(checkText(updateSnapshot().check)).toBe("Ensayo 0.2.0 is ready to install");
    expect(updateSnapshot().pending?.version).toBe("0.2.0");
  });

  it("says plainly when it can't reach the server", async () => {
    await checkNow(bridge({ check: () => Promise.reject("Couldn't reach the update server. Check your internet connection.") }));
    expect(checkText(updateSnapshot().check)).toBe("Couldn't reach the update server. Check your internet connection.");
    await checkNow(bridge({ check: () => Promise.reject(new Error("")) }));
    expect(checkText(updateSnapshot().check)).toBe("The update check failed. Check your connection and try again.");
  });
});

describe("the words", () => {
  it("what a screen reader hears: the start, every 25%, Restarting and a failure", () => {
    const heard = new Set<string>();
    for (let p = 0; p <= 100; p++) heard.add(liveText({ state: "installing", percent: p }) ?? "");
    heard.add(liveText({ state: "restarting" }) ?? "");
    expect([...heard]).toEqual(["Downloading the update", "Downloading the update, 25%", "Downloading the update, 50%", "Downloading the update, 75%", "Restarting Ensayo"]);
    expect(liveText({ state: "idle" })).toBeNull();
  });

  it("plain copy: no exclamation marks, no em dashes", () => {
    const all = [phaseText({ state: "installing", percent: 5 }), phaseText({ state: "installing", percent: null }), phaseText({ state: "restarting" }), checkText({ state: "up-to-date" }), checkText({ state: "found", version: "1.0.0" })];
    for (const t of all) expect(t).not.toMatch(/[!—]/);
  });
});

describe("where the banner lives", () => {
  it("is in the app shell and never in the practice (focus) shell", async () => {
    const { readFileSync } = await import("node:fs");
    const read = (f: string) => readFileSync(new URL(`../ui/${f}`, import.meta.url), "utf8");
    expect(read("AppShell.tsx")).toContain("<UpdateBanner />");
    expect(read("FocusShell.tsx")).not.toContain("UpdateBanner");
  });
});
