import { describe, expect, it } from "vitest";
import { estimateLine, estimateSeconds, estimateUsd, timeWords, NO_ENGINE_LINE } from "../screens/stories/bulkEstimate";

describe("the estimate before reading", () => {
  it("adds up tokens at the listed price", () => {
    // 10 stories: input 10*1400 + 5000/4 = 15250 tokens, output 8000 tokens, at 2 and 10 dollars per million.
    expect(estimateUsd(10, 5000, [2, 10])).toBeCloseTo((15250 * 2 + 8000 * 10) / 1e6, 8);
  });
  it("takes a story read's usual time, one after another", () => {
    expect(estimateSeconds(12, "key")).toBe(180);
    expect(estimateSeconds(12, "local")).toBe(720);
  });
  it("says time in plain words", () => {
    expect(timeWords(10)).toBe("a few seconds");
    expect(timeWords(45)).toBe("under a minute");
    expect(timeWords(100)).toBe("under 2 minutes");
    expect(timeWords(180)).toBe("about 3 minutes");
    expect(timeWords(7200)).toBe("about 2 hours");
  });
  it("names cost and time with a cloud key, and says it is rough", () => {
    const line = estimateLine({ count: 12, totalChars: 24000, kind: "key", price: [2, 10] });
    expect(line).toMatch(/should cost about \d+ cents? and take about 3 minutes with your AI key/);
    expect(line).toContain("rough guess");
  });
  it("gives only the time with local AI, and says it costs nothing", () => {
    const line = estimateLine({ count: 12, totalChars: 24000, kind: "local", price: null });
    expect(line).toContain("about 12 minutes on this computer");
    expect(line).toContain("costs nothing");
  });
  it("does not make up a cost for a model with no listed price", () => {
    const line = estimateLine({ count: 3, totalChars: 3000, kind: "key", price: null });
    expect(line).toContain("can't guess the cost");
    expect(line).not.toMatch(/cent|\$/);
  });
  it("points to Settings when there is no engine", () => {
    expect(estimateLine({ count: 3, totalChars: 3000, kind: "timing", price: null })).toBe(NO_ENGINE_LINE);
  });
  it("has no em dashes or exclamation marks", () => {
    for (const k of ["key", "local", "timing"] as const) expect(estimateLine({ count: 2, totalChars: 100, kind: k, price: null })).not.toMatch(/[—!]/);
  });
});
