import { describe, expect, it } from "vitest";
import { QUIET_LEVEL, SILENCE_LIMIT_MS, SILENCE_START, silenceStep, silenceStop } from "../practice/silence";

const run = (levels: [number, number][]) => levels.reduce((s, [level, dt]) => silenceStep(s, level, dt), SILENCE_START);

describe("auto-stop after silence", () => {
  it("never stops before the person has said something", () => {
    const s = run(Array.from({ length: 200 }, () => [0, 130] as [number, number]));
    expect(silenceStop(s)).toBe(false);
  });

  it("stops after 8 seconds of quiet that follows speech", () => {
    let s = run([[0.4, 130], [0.5, 130]]);
    const steps = Math.ceil(SILENCE_LIMIT_MS / 130);
    for (let i = 0; i < steps - 1; i++) s = silenceStep(s, 0, 130);
    expect(silenceStop(s)).toBe(false);
    s = silenceStep(s, 0, 130);
    expect(silenceStop(s)).toBe(true);
  });

  it("a pause to find a word resets when the voice comes back", () => {
    let s = run([[0.4, 130]]);
    for (let i = 0; i < 40; i++) s = silenceStep(s, 0, 130);
    s = silenceStep(s, 0.3, 130);
    expect(s.quietMs).toBe(0);
    expect(silenceStop(s)).toBe(false);
  });

  it("counts a level just under the quiet line as quiet", () => {
    const s = run([[0.4, 100], [QUIET_LEVEL - 0.001, 8000]]);
    expect(silenceStop(s)).toBe(true);
  });
});
