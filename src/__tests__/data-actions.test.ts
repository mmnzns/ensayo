import { describe, expect, it } from "vitest";
import { cardHeadline, deleteStory, emptyStory, mergeMethods, newStoryId, proofPointsFromRows, saveMethod, saveStory, setProofVerified, slug, type DataState } from "../data/actions";
import { mockStore } from "../data/mock";
import type { ProofPoint } from "../data/types";

const base = (): DataState => ({ profile: mockStore.profile, stories: structuredClone(mockStore.stories), methods: structuredClone(mockStore.methods) });
const last = <T,>(a: T[]): T => a[a.length - 1];
const point = (label: string, verified: boolean): ProofPoint => ({ label, metric: label, before: "1", after: "2", unit: "", approximate: false, verified });

describe("story actions", () => {
  it("adds a new story and replaces an existing one by id, without mutating the input", () => {
    const s = base();
    const before = JSON.stringify(s);
    const fresh = { ...emptyStory(), title: "New one" };
    const added = saveStory(s, fresh);
    expect(added.stories.length).toBe(s.stories.length + 1);
    const edited = saveStory(added, { ...fresh, title: "Renamed" });
    expect(edited.stories.length).toBe(added.stories.length);
    expect(edited.stories.find((x) => x.id === fresh.id)?.title).toBe("Renamed");
    expect(JSON.stringify(s)).toBe(before);
  });

  it("recomputes verified from the numbers: at least one, all ticked", () => {
    const s = base();
    const st = { ...emptyStory(), title: "T" };
    expect(last(saveStory(s, st).stories).verified).toBe(false);
    expect(last(saveStory(s, { ...st, proof_points: [point("a", true), point("b", true)], verified: false }).stories).verified).toBe(true);
    expect(last(saveStory(s, { ...st, proof_points: [point("a", true), point("b", false)], verified: true }).stories).verified).toBe(false);
  });

  it("deletes a story and takes it out of the methods that listed it", () => {
    const s = base();
    const id = s.methods.find((m) => m.storyIds.length)!.storyIds[0];
    const after = deleteStory(s, id);
    expect(after.stories.some((x) => x.id === id)).toBe(false);
    expect(after.methods.every((m) => !m.storyIds.includes(id))).toBe(true);
    expect(s.stories.some((x) => x.id === id)).toBe(true);
  });

  it("ticks one number and recomputes the story", () => {
    const s = saveStory(base(), { ...emptyStory(), id: "st_t", title: "T", proof_points: [point("a", true), point("b", false)] });
    const after = setProofVerified(s, "st_t", "b", true);
    expect(after.stories.find((x) => x.id === "st_t")?.verified).toBe(true);
    expect(setProofVerified(after, "st_t", "a", false).stories.find((x) => x.id === "st_t")?.verified).toBe(false);
  });

  it("makes ids that start with st_ and never repeat", () => {
    const ids = new Set(Array.from({ length: 500 }, newStoryId));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(/^st_[a-z0-9]+$/);
  });

  it("starts a new story empty, with no invented numbers or strategy", () => {
    const s = emptyStory();
    expect(s.approach).toBe("");
    expect(s.proof_points).toEqual([]);
    expect(s.verified).toBe(false);
    expect(s.usage).toEqual({ practiced: 0, fits: 0 });
  });
});

describe("methods", () => {
  it("replaces the sentence for one situation and leaves the others", () => {
    const s = base();
    const after = saveMethod(s, { ...s.methods[1], spoken: "A new sentence." });
    expect(after.methods[1].spoken).toBe("A new sentence.");
    expect(after.methods[0]).toEqual(s.methods[0]);
    expect(after.methods.length).toBe(6);
  });

  it("merges methods read from disk into the six situations, with labels and prompts, empty ones blank", () => {
    const merged = mergeMethods([{ situation: "influence", spoken: "Make it cheap.", storyIds: ["st_a"] }], mockStore.methods);
    expect(merged.map((m) => m.situation)).toEqual(["problem_solving", "disagreement", "influence", "serving_customers", "leading_team", "motivation"]);
    const infl = merged.find((m) => m.situation === "influence")!;
    expect(infl.spoken).toBe("Make it cheap.");
    expect(infl.storyIds).toEqual(["st_a"]);
    expect(infl.label).toBe("Getting buy-in");
    expect(merged.find((m) => m.situation === "problem_solving")!.spoken).toBe("");
  });
});

describe("numbers on the story screens", () => {
  it("slugs a label the way proof point labels are written", () => {
    expect(slug("Sender score")).toBe("sender_score");
    expect(slug("  7-day activation! ")).toBe("7_day_activation");
  });

  it("keeps existing numbers and only changes whether they are ticked", () => {
    const orig = [point("a", false), point("b", true)];
    const rows = [
      { id: "a", label: "a", value: "1 → 2", checked: true },
      { id: "b", label: "b", value: "1 → 2", checked: false },
    ];
    expect(proofPointsFromRows(rows, orig)).toEqual([point("a", true), point("b", false)]);
  });

  it("turns a number the user typed into a proof point, never inventing a missing side", () => {
    const rows = [{ id: "new1", label: "Open rate", value: "21% → 36%", checked: true, isNew: true }];
    expect(proofPointsFromRows(rows, [])).toEqual([{ label: "open_rate", metric: "Open rate", before: "21", after: "36", unit: "%", approximate: false, verified: true }]);
    const one = proofPointsFromRows([{ id: "n", label: "Users", value: "40,000", checked: false, isNew: true }], []);
    expect(one[0]).toMatchObject({ metric: "Users", before: "", after: "40,000", unit: "", verified: false });
  });

  it("drops a typed number that has no label and no value", () => {
    expect(proofPointsFromRows([{ id: "n", label: " ", value: " ", checked: false, isNew: true }], [])).toEqual([]);
  });
});

describe("card headline", () => {
  it("reads like the design: the metric, then before and after", () => {
    expect(cardHeadline([{ ...point("a", true), metric: "Seven-day activation", before: "31", after: "44", unit: "%" }], "")).toBe("Seven-day activation 31% → 44%");
    expect(cardHeadline([{ ...point("a", true), metric: "Sender score", before: "62", after: "94", unit: "" }], "")).toBe("Sender score 62 → 94");
  });

  it("shows just the value when there is no before, and the fallback when there are no numbers", () => {
    expect(cardHeadline([{ ...point("a", true), metric: "Users", before: "", after: "40,000", unit: "" }], "x")).toBe("Users 40,000");
    expect(cardHeadline([], "Launch held 2 weeks")).toBe("Launch held 2 weeks");
  });
});
