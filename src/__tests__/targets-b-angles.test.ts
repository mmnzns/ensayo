import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import type { Branch, ProofPoint, Target } from "../data/types";
import { addStress, anglesToSave, angleCount, branchChoices, checkAngleNumbers, draftAngle, numberList, numberProblem, priorityFor, removeStress, storyNumbers } from "../screens/stories/angles";

const pp = (before: string, after: string, unit = "%"): ProofPoint => ({ label: "x", metric: "Seven-day activation", before, after, unit, approximate: false, verified: true });
const POINTS = [pp("31", "44"), pp("3", "1", "steps")];

describe("numbers in an opening sentence", () => {
  it("accept the story's own numbers, written any way", () => {
    expect(checkAngleNumbers("I moved activation from 31 to 44 percent.", POINTS).ok).toBe(true);
    expect(checkAngleNumbers("Activation went from 31% to 44%.", POINTS).ok).toBe(true);
    expect(checkAngleNumbers("From thirty-one to forty-four percent.", POINTS).ok).toBe(true);
    expect(checkAngleNumbers("Three steps became one.", POINTS).ok).toBe(true);
  });

  it("do not count a compound adjective like seven-day as a number", () => {
    expect(checkAngleNumbers("I moved seven-day activation from 31 to 44 percent.", POINTS)).toEqual({ ok: true, extra: [] });
    expect(checkAngleNumbers("A 7-day window, 31 to 44.", POINTS).ok).toBe(true);
    expect(checkAngleNumbers("A thirty-day test.", POINTS).ok).toBe(true);
  });

  it("still count a number written with a hyphen", () => {
    expect(checkAngleNumbers("Forty-five percent of people stayed.", POINTS)).toEqual({ ok: false, extra: ["45%"] });
  });

  it("name the number that is not in the story", () => {
    expect(checkAngleNumbers("Activation went from 31 to 52%.", POINTS)).toEqual({ ok: false, extra: ["52%"] });
    expect(checkAngleNumbers("It reached 50 and then 60 percent.", POINTS)).toEqual({ ok: false, extra: ["50", "60%"] });
  });

  it("let a sentence with no number through", () => {
    expect(checkAngleNumbers("I fixed what happened after signup.", POINTS).ok).toBe(true);
    expect(checkAngleNumbers("One of the things I did.", POINTS).ok).toBe(true);
    expect(checkAngleNumbers("", POINTS).ok).toBe(true);
  });

  it("do not move for rounding noise but do for a real difference", () => {
    const rate = [pp("2.1", "4.8")];
    expect(checkAngleNumbers("Reactivation hit 4.8 percent.", rate).ok).toBe(true);
    expect(checkAngleNumbers("Reactivation hit 5 percent.", rate).ok).toBe(false);
  });

  it("read scales, commas and units", () => {
    const big = [pp("", "40,000", "")];
    expect(checkAngleNumbers("About 40k signups, 40,000 of them.", big).ok).toBe(true);
    expect(checkAngleNumbers("About forty thousand signups.", big).ok).toBe(true);
    expect(checkAngleNumbers("About 50k signups.", big).ok).toBe(false);
  });

  it("collect the numbers of a story from before and after", () => {
    expect(storyNumbers(POINTS)).toEqual([31, 44, 3, 1]);
    expect(storyNumbers([pp("", "", "")])).toEqual([]);
  });

  it("say what is wrong in plain words", () => {
    expect(numberProblem("B2B marketing ops", { ok: false, extra: ["52%"] })).toBe("The opening sentence for B2B marketing ops says 52%, which is not one of this story's numbers.");
    expect(numberProblem("B2B marketing ops", { ok: false, extra: ["50", "60%"] })).toBe("The opening sentence for B2B marketing ops says 50 and 60%, which are not this story's numbers.");
    expect(numberProblem("x", { ok: true, extra: [] })).toBe("");
  });

  it("agree with the sample angles for both sample targets", () => {
    const s = mockStore.stories[0];
    expect(checkAngleNumbers("Our activation problem turned out to be a broken handoff in the data, and fixing it took activation from 31 to 44 percent.", s.proof_points).ok).toBe(true);
  });

  it("list the story's numbers for the read-only list", () => {
    expect(numberList({ proof_points: POINTS })).toEqual([
      { label: "Seven-day activation", value: "31% → 44%", verified: true },
      { label: "Seven-day activation", value: "3 → 1", verified: true },
    ]);
  });
});

const target = (id: string, archived = false): Target => ({ ...mockStore.targets[0], id, archived });

describe("angle cards", () => {
  const targets = [target("a"), target("b"), target("c", true)];

  it("count the live targets that have an opening sentence", () => {
    const angles = [
      { target_id: "a", headline: "Open.", emphasis: [], lead_branch: null },
      { target_id: "b", headline: "  ", emphasis: [], lead_branch: null },
      { target_id: "c", headline: "Archived.", emphasis: [], lead_branch: null },
    ];
    expect(angleCount({ angles }, targets)).toBe(1);
    expect(angleCount({}, targets)).toBe(0);
  });

  it("start a card empty when the target has no angle yet", () => {
    expect(draftAngle({}, "a")).toEqual({ target_id: "a", headline: "", emphasis: [], lead_branch: null });
    expect(draftAngle({ angles: [{ target_id: "a", headline: "H", emphasis: ["x"], lead_branch: "data" }] }, "a").headline).toBe("H");
  });

  it("add and remove stress tags without repeats or blanks", () => {
    expect(addStress(["Systems"], " funnel data ")).toEqual(["Systems", "funnel data"]);
    expect(addStress(["Systems"], "systems")).toEqual(["Systems"]);
    expect(addStress(["Systems"], "  ")).toEqual(["Systems"]);
    expect(addStress(["a", "b", "c", "d", "e", "f"], "g")).toHaveLength(6);
    expect(removeStress(["a", "b"], "a")).toEqual(["b"]);
  });

  it("save one angle per live target, leave out empty ones, and keep an archived target's angle", () => {
    const story = { angles: [{ target_id: "c", headline: "Old.", emphasis: [], lead_branch: null }] };
    const saved = anglesToSave(
      story,
      [
        { target_id: "a", headline: "  Open A.  ", emphasis: [" Systems ", ""], lead_branch: "" },
        { target_id: "b", headline: "", emphasis: ["x"], lead_branch: "data" },
      ],
      targets,
    );
    expect(saved).toEqual([
      { target_id: "c", headline: "Old.", emphasis: [], lead_branch: null },
      { target_id: "a", headline: "Open A.", emphasis: ["Systems"], lead_branch: null },
    ]);
  });

  it("offer the story's own follow-ups for going deeper", () => {
    const branches: Branch[] = [
      { kind: "data", trigger: "How did you know it was bank linking?", angle: "" },
      { kind: "failure", trigger: "What didn't work?", angle: "" },
    ];
    expect(branchChoices(branches)).toEqual([
      { value: "data", label: "Data: How did you know it was bank linking" },
      { value: "failure", label: "What went wrong: What didn't work" },
    ]);
  });

  it("say where a story stands for a target", () => {
    const t = { pinnedStoryIds: ["p"], hiddenStoryIds: ["h"] };
    expect(priorityFor(t, "p")).toBe("pin");
    expect(priorityFor(t, "h")).toBe("hide");
    expect(priorityFor(t, "z")).toBe("none");
    expect(priorityFor(undefined, "p")).toBe("none");
  });
});
