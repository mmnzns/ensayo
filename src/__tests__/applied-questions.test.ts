import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import { banksFor, bankQuestionFromExtra, pickApplicationQuestions, type ExtraQuestion } from "../practice/questions";
import { pickStories } from "../practice/stories";

const extra = (id: string, over: Partial<ExtraQuestion> = {}): ExtraQuestion => ({ id, stageId: "stg_2", type: "behavioral", text: `Question ${id}`, ...over });

describe("an extras question as a bank question", () => {
  it("keeps the text and the checks, and gives it the stage's type", () => {
    const q = bankQuestionFromExtra(extra("q_1", { behavioralSituation: "disagreement", commitmentCheck: true, builderOperatorCheck: true, bestStoryId: "st_a" }), "hiring_manager");
    expect(q).toMatchObject({ id: "q_1", text: "Question q_1", type: "behavioral", behavioral_situation: "disagreement", commitment_check: true, builder_operator_check: true, stages: ["hiring_manager"], best_story_id: "st_a" });
    expect(q.modes).toEqual(["drill", "mock"]);
  });

  it("turns the screens' names into the engine's", () => {
    expect(bankQuestionFromExtra(extra("a", { type: "about_you" }), "recruiter").type).toBe("tell_me_about_yourself");
    expect(bankQuestionFromExtra(extra("b", { type: "future" }), "recruiter").type).toBe("future_looking");
    expect(bankQuestionFromExtra(extra("c", { type: "gap" }), "recruiter").type).toBe("gap");
  });

  it("drops an empty or missing situation, so the engine classifies by type", () => {
    expect(bankQuestionFromExtra(extra("a", { behavioralSituation: null }), "recruiter").behavioral_situation).toBeNull();
    expect(bankQuestionFromExtra(extra("b"), "recruiter").behavioral_situation).toBeNull();
  });

  it("is the best story's pick when the question names one", () => {
    const [a, b] = mockStore.stories;
    const q = bankQuestionFromExtra(extra("q", { bestStoryId: b.id }), "hiring_manager");
    expect(pickStories(q, [a, b], []).map((s) => s.id)[0]).toBe(b.id);
    expect(pickStories(q, [a], []).every((s) => s.id !== b.id)).toBe(true);
  });
});

describe("picking questions for an application's stage", () => {
  const bank = banksFor("Accountant");
  const base = { bank, stageId: "stg_2", stage: "hiring_manager", mode: "drill" as const, seed: 3 };

  it("uses the stage's own questions, in order, and only that stage's", () => {
    const extras = [extra("q_1"), extra("q_2", { stageId: "stg_1" }), extra("q_3")];
    const got = pickApplicationQuestions({ ...base, extras, count: 2 });
    expect(got.map((q) => q.id)).toEqual(["q_1", "q_3"]);
  });

  it("tops up from the bank when the application has fewer than asked for", () => {
    const got = pickApplicationQuestions({ ...base, extras: [extra("q_1")], count: 4 });
    expect(got).toHaveLength(4);
    expect(got[0].id).toBe("q_1");
    expect(new Set(got.map((q) => q.text)).size).toBe(4);
    expect(got.slice(1).every((q) => q.stages.includes("hiring_manager"))).toBe(true);
  });

  it("falls back to the bank when there are no extras or none for the stage", () => {
    expect(pickApplicationQuestions({ ...base, extras: undefined, count: 3 })).toHaveLength(3);
    expect(pickApplicationQuestions({ ...base, extras: [extra("q_9", { stageId: "stg_7" })], count: 3 }).some((q) => q.id === "q_9")).toBe(false);
  });

  it("does not repeat a bank question that says what an application question already asks", () => {
    const dup = bank.find((q) => q.stages.includes("hiring_manager") && q.modes.includes("drill") && !q.moment)!;
    const got = pickApplicationQuestions({ ...base, extras: [extra("q_1", { text: dup.text })], count: 5 });
    expect(got.filter((q) => q.text === dup.text)).toHaveLength(1);
  });

  it("ignores blank questions", () => {
    const got = pickApplicationQuestions({ ...base, extras: [extra("q_1", { text: "  " }), extra("q_2")], count: 1 });
    expect(got.map((q) => q.id)).toEqual(["q_2"]);
  });

  it("the founder variant only comes from the bank at a startup's leadership stage", () => {
    const founder = bank.find((q) => q.founder_variant && q.stages.includes("leadership") && q.modes.includes("drill"));
    if (!founder) return;
    const plain = pickApplicationQuestions({ ...base, stage: "leadership", extras: [], count: 200 });
    expect(plain.some((q) => q.founder_variant)).toBe(false);
    const startup = pickApplicationQuestions({ ...base, stage: "leadership", extras: [], count: 200, startup: true });
    expect(startup.some((q) => q.founder_variant)).toBe(true);
  });
});
