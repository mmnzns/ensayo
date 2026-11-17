import { describe, expect, it } from "vitest";
import { MOCK_NOW, mockStore } from "../data/mock";
import { storeClock } from "../data/real";

describe("the store's clock", () => {
  it("is the real time in the app, never the sample moment", () => {
    const before = Date.now();
    const t = storeClock(true)().getTime();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).not.toBe(MOCK_NOW.getTime());
    expect(Math.abs(Date.now() - t)).toBeLessThan(5000);
  });

  it("keeps the sample moment in the browser preview", () => {
    expect(storeClock(false)()).toBe(MOCK_NOW);
    expect(mockStore.now()).toBe(MOCK_NOW);
  });
});
