import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Working, { clock, MAX_WHILE_RUNNING, stepsPercent, stepTime, usualTime, workPercent } from "../screens/applications/Working";
import { workSteps } from "../screens/applications/NewApplication";

describe("Saving a new application: what it's doing and for how long", () => {
  it("lists only the steps this save runs, in order", () => {
    expect(workSteps(true, "attach")).toEqual(["save", "posting", "resume"]);
    expect(workSteps(false, "attach")).toEqual(["save", "resume"]);
    expect(workSteps(true, "none")).toEqual(["save", "posting"]);
  });

  it("says how long a read usually takes with each engine", () => {
    expect(stepTime("posting", "key")).toBe("Usually under a minute with your AI key.");
    expect(stepTime("resume", "local")).toBe("Usually about 3 minutes with the local AI.");
    expect(stepTime("posting", "timing")).toBe("Usually a few seconds.");
    expect(stepTime("save", "key")).toBe("");
    expect(usualTime(["save", "posting", "resume"], "key")).toBe("Usually under 2 minutes with your AI key.");
  });

  it("counts minutes and seconds", () => {
    expect(clock(7)).toBe("0:07");
    expect(clock(84)).toBe("1:24");
  });

  it("shows the step running now, the ones done, the clock and the reassurance", () => {
    const html = renderToString(<Working steps={["save", "posting", "resume"]} current="posting" kind="local" />);
    expect(html).toContain("Reading the posting…");
    expect(html).toContain("Saving the application · done");
    expect(html).toContain("0:00");
    expect(html).toContain("Usually about 6 minutes with the local AI.");
    expect(html).toContain("0%");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="0"');
    expect(html).toContain("Keep this screen open");
    expect(html).not.toContain("—");
  });

  it("jumps to 100 and marks every step done when the work finishes", () => {
    const html = renderToString(<Working steps={["resume"]} current="resume" kind="key" done />);
    expect(html).toContain("100%");
    expect(html).toContain("Reading the resume · done");
  });
});

describe("the estimated percentage", () => {
  it("starts at 0, only goes up, stays at or under 95 while running, and is 100 when done", () => {
    expect(workPercent(0, 45)).toBe(0);
    let last = 0;
    for (let t = 1; t <= 600; t++) {
      const p = workPercent(t, 45);
      expect(p).toBeGreaterThanOrEqual(last);
      expect(p).toBeLessThanOrEqual(MAX_WHILE_RUNNING);
      last = p;
    }
    expect(last).toBeGreaterThanOrEqual(90);
    expect(workPercent(10, 45, true)).toBe(100);
  });

  it("moves fast at the start and slows near the expected time", () => {
    const first = workPercent(10, 45);
    const later = workPercent(55, 45) - workPercent(45, 45);
    expect(first).toBeGreaterThan(later);
    expect(workPercent(45, 45)).toBeGreaterThan(75);
    expect(workPercent(45, 45)).toBeLessThan(90);
  });

  it("never shows less than the steps already done", () => {
    expect(stepsPercent(["save", "posting", "resume"], "resume", "key", 0)).toBeGreaterThan(40);
    expect(stepsPercent(["save", "posting", "resume"], "resume", "key", 0)).toBeLessThanOrEqual(MAX_WHILE_RUNNING);
    expect(stepsPercent(["save"], "save", "key", 3, true)).toBe(100);
  });
});
