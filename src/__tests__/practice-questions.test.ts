import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import { banksFor, ownQuestion, pickQuestions, storyFit, type BankQuestion } from "../practice/questions";
import { pickStories } from "../practice/stories";

const q = (id: string, over: Partial<BankQuestion> = {}): BankQuestion => ({
  id,
  text: `Question ${id}`,
  type: "behavioral",
  behavioral_situation: null,
  stages: ["recruiter"],
  modes: ["drill", "mock"],
  competencies: [],
  great_eight: [],
  commitment_check: false,
  builder_operator_check: false,
  difficulty: "standard",
  follow_up_angles: [],
  ...over,
});

describe("the real bank", () => {
  it("loads the general set, and the lifecycle pack only for a matching role", () => {
    expect(banksFor("Accountant").length).toBe(109);
    expect(banksFor("Senior Lifecycle Marketing Manager").length).toBe(179);
  });

  it("has enough drill questions in every stage", () => {
    const bank = banksFor("Senior Lifecycle Marketing Manager");
    for (const stage of ["recruiter", "hiring_manager", "technical", "panel", "leadership"]) {
      expect(pickQuestions({ bank, stage, mode: "drill", count: 10 }).length, stage).toBe(10);
    }
  });
});

describe("picking questions", () => {
  const bank = [q("a"), q("b"), q("c"), q("d", { stages: ["leadership"] }), q("e", { moment: "candidate_questions" }), q("f", { founder_variant: true, stages: ["leadership"] }), q("g", { moment: "opener" }), q("h", { modes: ["mock"] })];

  it("keeps to the stage and mode and never picks the candidate's-own-questions moment", () => {
    const ids = pickQuestions({ bank, stage: "recruiter", mode: "drill", count: 10 }).map((x) => x.id);
    expect(ids.sort()).toEqual(["a", "b", "c", "g"]);
  });

  it("asks the opener first", () => {
    expect(pickQuestions({ bank, stage: "recruiter", mode: "drill", count: 3 })[0].id).toBe("g");
  });

  it("allows a founder question only in the leadership stage of a startup", () => {
    expect(pickQuestions({ bank, stage: "leadership", mode: "drill", count: 5 }).map((x) => x.id)).toEqual(["d"]);
    expect(pickQuestions({ bank, stage: "leadership", mode: "drill", count: 5, startup: true }).map((x) => x.id).sort()).toEqual(["d", "f"]);
  });

  it("is repeatable for a seed and avoids questions already seen while others remain", () => {
    const big = Array.from({ length: 20 }, (_, i) => q(`q${i}`));
    const one = pickQuestions({ bank: big, stage: "recruiter", mode: "drill", count: 5, seed: 7 });
    const two = pickQuestions({ bank: big, stage: "recruiter", mode: "drill", count: 5, seed: 7 });
    expect(one.map((x) => x.id)).toEqual(two.map((x) => x.id));
    const next = pickQuestions({ bank: big, stage: "recruiter", mode: "drill", count: 5, seed: 7, seen: new Set(one.map((x) => x.id)) });
    expect(next.some((x) => one.some((y) => y.id === x.id))).toBe(false);
  });

  it("reuses seen questions when the stage has few", () => {
    const got = pickQuestions({ bank: [q("a"), q("b")], stage: "recruiter", mode: "drill", count: 2, seen: new Set(["a", "b"]) });
    expect(got.length).toBe(2);
  });

  it("with a story, asks what that story answers best", () => {
    const story = { ...mockStore.stories[0], competencies: ["influence"], best_for: ["convincing a skeptical team"] };
    const pool = [q("x", { competencies: ["budget"] }), q("y", { competencies: ["influence"] }), q("z", { text: "Tell me about convincing a team" })];
    const got = pickQuestions({ bank: pool, stage: "recruiter", mode: "drill", count: 2, story });
    expect(got[0].id).toBe("y");
    expect(storyFit(pool[1], story)).toBeGreaterThan(storyFit(pool[0], story));
  });

  it("a question the user typed keeps their words", () => {
    const own = ownQuestion("  Why did the launch slip?  ");
    expect(own.text).toBe("Why did the launch slip?");
    expect(own.id).toBe(ownQuestion("Why did the launch slip?").id);
  });
});

describe("picking stories", () => {
  const stories = mockStore.stories;

  it("returns at most three, best fit first, and none when nothing fits", () => {
    const fits = q("t", { competencies: stories[0].competencies.slice(0, 1) });
    const got = pickStories(fits, stories, mockStore.methods);
    expect(got.length).toBeGreaterThan(0);
    expect(got.length).toBeLessThanOrEqual(3);
    expect(got[0].id).toBe(stories.map((s) => ({ s, f: storyFit(fits, s) })).sort((a, b) => b.f - a.f)[0].s.id);
    expect(pickStories(q("none", { competencies: ["zzz-nothing"], text: "qqq" }), stories, [])).toEqual([]);
  });

  it("prefers the story linked to the situation in the methods", () => {
    const target = stories[stories.length - 1];
    const linked = { ...q("m", { behavioral_situation: "disagreement", competencies: ["zzz"] }) };
    const methods = [{ situation: "disagreement" as const, label: "", spoken: "", storyIds: [target.id], prompt: "" }];
    const got = pickStories({ ...linked, text: target.best_for[0] ?? "x" }, stories, methods);
    expect(got.map((s) => s.id)).toContain(target.id);
  });
});
