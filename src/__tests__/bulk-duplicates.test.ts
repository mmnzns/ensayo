import { describe, expect, it } from "vitest";
import { emptyStory } from "../data/actions";
import { findDuplicate, normaliseTitle } from "../screens/stories/bulkDuplicates";
import type { Story } from "../data/types";

const story = (o: Partial<Story>): Story => ({ ...emptyStory(), ...o });
const bank = [
  story({ title: "Win-back email series", context: "Churned customers were not coming back after the trial ended and the team had no follow up", action: "I wrote a six email series and tested subject lines with the lifecycle team", result: "Reactivation rose from four percent to nine percent within a quarter" }),
  story({ title: "Onboarding drop-off", context: "Half of new users left during setup", action: "Cut the form to three fields" }),
];

describe("likely duplicates", () => {
  it("normalises a title", () => {
    expect(normaliseTitle("  Win-back Email   Series! ")).toBe("win back email series");
  });
  it("matches the same title however it is typed", () => {
    expect(findDuplicate(story({ title: "win back EMAIL series" }), bank)?.title).toBe("Win-back email series");
  });
  it("matches a close title", () => {
    expect(findDuplicate(story({ title: "Win-back email series for trials" }), bank)?.title).toBe("Win-back email series");
  });
  it("matches a different title with mostly the same words", () => {
    const d = story({ title: "Lifecycle emails", context: "Churned customers were not coming back after the trial ended and the team had no follow up", action: "I wrote a six email series and tested subject lines with the lifecycle team", result: "Reactivation rose from four percent to nine percent within a quarter" });
    expect(findDuplicate(d, bank)?.title).toBe("Win-back email series");
  });
  it("does not match a different story", () => {
    expect(findDuplicate(story({ title: "Vendor negotiation", context: "Our hosting contract was up for renewal", action: "I asked three vendors for quotes", result: "We cut the bill by a fifth" }), bank)).toBeNull();
  });
  it("never matches on an empty or untitled draft", () => {
    expect(findDuplicate(story({ title: "" }), [story({ title: "" })])).toBeNull();
    expect(findDuplicate(story({ title: "Untitled story" }), [story({ title: "Untitled story" })])).toBeNull();
  });
});
