import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Working, { clock, stepTime } from "../screens/applications/Working";
import { workSteps } from "../screens/applications/NewApplication";

describe("Saving a new application: what it's doing and for how long", () => {
  it("lists only the steps this save runs, in order", () => {
    expect(workSteps(true, "attach")).toEqual(["save", "posting", "resume"]);
    expect(workSteps(false, "attach")).toEqual(["save", "resume"]);
    expect(workSteps(true, "none")).toEqual(["save", "posting"]);
  });

  it("says how long a read usually takes with each engine", () => {
    expect(stepTime("posting", "key")).toBe("Usually under a minute.");
    expect(stepTime("resume", "local")).toContain("a few minutes");
    expect(stepTime("posting", "timing")).toBe("");
    expect(stepTime("save", "key")).toBe("");
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
    expect(html).toContain("a few minutes");
    expect(html).toContain("still working while the clock moves");
    expect(html).not.toContain("—");
  });
});
