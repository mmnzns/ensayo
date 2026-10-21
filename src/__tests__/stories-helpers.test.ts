import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import { storyGaps } from "../data/store";
import { fitsText, filterStories, firstUncovered, numberText, practicedText, usageText } from "../screens/stories/helpers";

const { stories, applications } = mockStore;
const filters = mockStore.screens.stories.filters;
const by = (id: string) => filters.find((f) => f.id === id);

describe("stories helpers", () => {
  it("words usage for 0, 1 and many", () => {
    expect(practicedText(0)).toBe("Not practiced yet");
    expect(practicedText(1)).toBe("Practiced once");
    expect(practicedText(9)).toBe("Practiced 9 times");
    expect(fitsText(1)).toBe("fits 1 question");
    expect(usageText({ practiced: 9, fits: 5 })).toBe("Practiced 9 times · fits 5 questions");
  });

  it("formats numbers", () => {
    expect(numberText({ before: "31", after: "44", unit: "%" })).toBe("31% → 44%");
    expect(numberText({ before: "3", after: "1", unit: "steps" })).toBe("3 → 1");
    expect(numberText({ before: "", after: "40,000", unit: "" })).toBe("40,000");
    expect(numberText({ before: "0", after: "18", unit: "% up" })).toBe("up 18%");
  });

  it("filters by competency and by gaps", () => {
    expect(filterStories(stories, by("all"))).toHaveLength(stories.length);
    expect(filterStories(stories, by("people")).map((s) => s.id)).toEqual(["st_team"]);
    expect(filterStories(stories, by("disagreement")).map((s) => s.id)).toEqual(["st_launch"]);
    const gapped = filterStories(stories, by("gaps"));
    expect(gapped.length).toBeGreaterThan(0);
    expect(gapped.every((s) => storyGaps(s).length > 0)).toBe(true);
  });

  it("finds the application whose analysis has an uncovered belief", () => {
    expect(firstUncovered(applications)?.company).toBe("Kestrel Pay");
    expect(firstUncovered([])).toBeUndefined();
  });
});
