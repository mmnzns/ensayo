import { describe, expect, it } from "vitest";
import { askedFromEarlier, banksFor, earlierStages, pickApplicationQuestions, type ExtraQuestion } from "../practice/questions";

const q = (id: string, stageId: string, over: Partial<ExtraQuestion> = {}): ExtraQuestion => ({ id, stageId, type: "behavioral", text: `Question ${id}`, ...over });
const asked = (id: string, stageId: string, text = `They asked ${id}`) => q(id, stageId, { source: "asked", text });
const process = [
  { id: "stg_1", order: 1 },
  { id: "stg_2", order: 2 },
  { id: "stg_3", order: 3 },
];
const base = { bank: banksFor("Accountant"), stageId: "stg_3", stage: "panel", mode: "drill" as const, seed: 4, earlierStageIds: earlierStages(process, "stg_3") };

describe("the stages before one", () => {
  it("are those with a lower order, in order", () => {
    expect(earlierStages([...process].reverse(), "stg_3")).toEqual(["stg_1", "stg_2"]);
    expect(earlierStages(process, "stg_1")).toEqual([]);
    expect(earlierStages(process, "stg_9")).toEqual([]);
    expect(earlierStages(process, null)).toEqual([]);
  });
});

describe("asked questions from earlier stages", () => {
  it("are at most two, nearest stage first, only asked ones, each once", () => {
    const extras = [asked("a1", "stg_1"), q("p1", "stg_1"), asked("a2", "stg_2"), asked("a3", "stg_2"), asked("dup", "stg_1", "they asked a2")];
    const got = askedFromEarlier(extras, ["stg_1", "stg_2"]);
    expect(got.map((e) => e.id)).toEqual(["a2", "a3"]);
    expect(askedFromEarlier(extras, ["stg_1"]).map((e) => e.id)).toEqual(["a1", "dup"]);
    expect(askedFromEarlier(extras, [])).toEqual([]);
    expect(askedFromEarlier(undefined, ["stg_1"])).toEqual([]);
  });

  it("lead a Drill for a later stage, before the stage's own set", () => {
    const extras = [asked("a1", "stg_1"), asked("a2", "stg_2"), asked("a3", "stg_2"), q("own1", "stg_3"), q("own2", "stg_3")];
    const got = pickApplicationQuestions({ ...base, extras, count: 5 });
    expect(got.slice(0, 2).map((x) => x.id)).toEqual(["a2", "a3"]);
    expect(got.slice(2, 4).map((x) => x.id)).toEqual(["own1", "own2"]);
    expect(got).toHaveLength(5);
  });

  it("are practised as this stage's questions", () => {
    const got = pickApplicationQuestions({ ...base, extras: [asked("a1", "stg_1")], count: 3 });
    expect(got[0].stages).toEqual(["panel"]);
    expect(got[0].modes).toContain("drill");
  });

  it("never lead the stage they were asked at, or an earlier stage's Drill", () => {
    const extras = [asked("a1", "stg_1"), asked("a3", "stg_3")];
    const same = pickApplicationQuestions({ ...base, stageId: "stg_1", stage: "recruiter", earlierStageIds: earlierStages(process, "stg_1"), extras, count: 3 });
    expect(same.map((x) => x.id)).toEqual(["a1", ...same.slice(1).map((x) => x.id)]);
    expect(same.some((x) => x.id === "a3")).toBe(false);
    const later = pickApplicationQuestions({ ...base, stageId: "stg_2", stage: "hiring_manager", earlierStageIds: earlierStages(process, "stg_2"), extras, count: 3 });
    expect(later.some((x) => x.id === "a3")).toBe(false);
    expect(later[0].id).toBe("a1");
  });

  it("honour the switch", () => {
    const extras = [asked("a1", "stg_1"), q("own1", "stg_3")];
    const off = pickApplicationQuestions({ ...base, extras, count: 3, askedFirst: false });
    expect(off.map((x) => x.id)[0]).toBe("own1");
    expect(off.some((x) => x.id === "a1")).toBe(false);
    const on = pickApplicationQuestions({ ...base, extras, count: 3, askedFirst: true });
    expect(on[0].id).toBe("a1");
    expect(pickApplicationQuestions({ ...base, extras, count: 3 })[0].id).toBe("a1");
  });

  it("do not lead a Mock, which keeps its stage set", () => {
    const extras = [asked("a1", "stg_1"), q("own1", "stg_3")];
    const mock = pickApplicationQuestions({ ...base, mode: "mock", extras, count: 3 });
    expect(mock[0].id).toBe("own1");
    expect(mock.some((x) => x.id === "a1")).toBe(false);
  });

  it("never repeat: the same words in the stage's own set or the bank show once, and the count holds", () => {
    const extras = [asked("a1", "stg_1", "Tell me about a launch"), q("own1", "stg_3", { text: "tell me  about a launch" }), q("own2", "stg_3")];
    const got = pickApplicationQuestions({ ...base, extras, count: 4 });
    const texts = got.map((x) => x.text.trim().toLowerCase().replace(/\s+/g, " "));
    expect(new Set(texts).size).toBe(texts.length);
    expect(got).toHaveLength(4);
    expect(got[0].id).toBe("a1");
  });

  it("make no difference to a first stage or an application with none asked", () => {
    const extras = [q("own1", "stg_1"), q("own2", "stg_1")];
    const plain = pickApplicationQuestions({ ...base, stageId: "stg_1", stage: "recruiter", earlierStageIds: [], extras, count: 4 });
    expect(plain.slice(0, 2).map((x) => x.id)).toEqual(["own1", "own2"]);
    const none = pickApplicationQuestions({ ...base, extras: [q("own1", "stg_3")], count: 2 });
    expect(none[0].id).toBe("own1");
  });

  it("stay within the count when two lead and the count is one", () => {
    const got = pickApplicationQuestions({ ...base, extras: [asked("a1", "stg_1"), asked("a2", "stg_2")], count: 1 });
    expect(got.map((x) => x.id)).toEqual(["a2"]);
  });
});
