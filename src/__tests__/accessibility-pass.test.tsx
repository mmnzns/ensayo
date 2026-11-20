import { readSource } from "./helpers/readSource";
import { describe, expect, it } from "vitest";
import { habitMark } from "../screens/settings/ProgressHabits";
import { barTransition } from "../screens/practice/PracticeRecording";

const read = (rel: string) => readSource(new URL(rel, import.meta.url));

describe("the habit strip", () => {
  it("marks a pass with a tick and anything else with a dot, not only colour", () => {
    expect(habitMark(true)).toBe("✓");
    expect(habitMark(false)).toBe("·");
    expect(habitMark(null)).toBe("·");
  });
  it("draws the mark inside each cell", () => {
    expect(read("../screens/settings/ProgressHabits.tsx")).toContain("{habitMark(c)}");
  });
});

describe("Start a session", () => {
  const src = read("../screens/home/StartASession.tsx");
  it("is the shared Dialog: focus trap, Esc and focus return come with it", () => {
    expect(src).toContain('import Dialog from "../states/Dialog"');
    expect(src).toContain("<Dialog");
    expect(src).toContain('onClose={() => go("2-1-home")}');
    // No hand-made dialog role left beside it.
    expect(src).not.toContain('role="dialog"');
  });
});

describe("text size", () => {
  const css = read("../styles/ensayo.css");
  it("is in rem, so the system text size applies", () => {
    expect(css).not.toMatch(/font-size:\s*[\d.]+px/);
    expect(css).toMatch(/\.e-body\{[^}]*font-size:1rem/);
    expect(css).toMatch(/\.e-h1\{[^}]*font-size:2rem/);
  });
  it("keeps borders, icons and layout in px", () => {
    expect(css).toMatch(/min-height:44px/);
    expect(css).toMatch(/border:1\.5px solid/);
  });
});

describe("the recording level bars", () => {
  it("stop animating for reduced motion", () => {
    expect(barTransition(true)).toBe("none");
    expect(barTransition(false)).toBe("height 130ms ease-out");
  });
});
