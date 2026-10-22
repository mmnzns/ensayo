import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import { draftToReview, storyFromReview } from "../screens/stories/parseDraft";
import type { Story } from "../data/types";

const draft: Story = {
  ...mockStore.stories[0],
  id: "st_new",
  title: "Deliverability rescue",
  employer: "Brightwave",
  direct_answer: "I got opens from 21 back to 36 percent.",
  context: "Opens dropped.",
  approach: "",
  action: "I moved to a dedicated IP.",
  ownership: "",
  result: "Opens came back to 36 percent.",
  proof_points: [
    { label: "open_rate", metric: "newsletter open rate", before: "21", after: "36", unit: "%", approximate: false, verified: false },
    { label: "sender_score", metric: "sender score", before: "62", after: "94", unit: "", approximate: false, verified: false },
  ],
  scale: "40k addresses",
  best_for: ["fixing a metric"],
  competencies: ["deliverability"],
  great_eight: ["retain_customers"],
  branches: [{ kind: "technical", trigger: "How did the warmup work?", angle: "A gradual ramp" }],
};

describe("a parsed story on the review screen", () => {
  const r = draftToReview(draft, ["approach", "ownership", "scale"], ["The result had a number that is not in your text, so it was left empty."]);

  it("fills the fields the screen shows from the draft", () => {
    expect(r).toMatchObject({ title: "Deliverability rescue", company: "Brightwave", headline: "I got opens from 21 back to 36 percent.", context: "Opens dropped.", approach: "", goodFor: ["fixing a metric"] });
    expect(r.followUps).toEqual([{ question: "How did the warmup work?", angle: "A gradual ramp" }]);
  });

  it("lists the numbers unticked, so only the user verifies them", () => {
    expect(r.numbers.map((n) => [n.id, n.label, n.value, n.checked, n.isNew])).toEqual([
      ["open_rate", "newsletter open rate", "21% → 36%", false, undefined],
      ["sender_score", "sender score", "62 → 94", false, undefined],
    ]);
  });

  it("carries the gaps and anything that was dropped for the screen to say", () => {
    expect(r.missing).toEqual(["approach", "ownership", "scale"]);
    expect(r.dropped).toHaveLength(1);
  });
});

describe("saving what the user confirmed", () => {
  const fields = { title: " Rescue ", company: "Brightwave", headline: "I fixed it.", context: "c", approach: "I noticed x.", action: "a", ownership: "o", result: "r", goodFor: ["fixing a metric", "owning a number"] };

  it("keeps the numbers' own fields and takes the ticks the user made", () => {
    const rows = draftToReview(draft, [], []).numbers.map((n) => (n.id === "open_rate" ? { ...n, checked: true } : n));
    const s = storyFromReview(draft, fields, rows);
    expect(s.proof_points[0]).toMatchObject({ label: "open_rate", before: "21", after: "36", unit: "%", verified: true });
    expect(s.proof_points[1].verified).toBe(false);
    expect(s.verified).toBe(false);
  });

  it("keeps what the parse found beyond the shown fields: scale, themes, branches", () => {
    const s = storyFromReview(draft, fields, draftToReview(draft, [], []).numbers);
    expect(s).toMatchObject({ id: "st_new", title: "Rescue", employer: "Brightwave", scale: "40k addresses", competencies: ["deliverability"], great_eight: ["retain_customers"], best_for: ["fixing a metric", "owning a number"], direct_answer: "I fixed it." });
    expect(s.branches).toHaveLength(1);
    expect(s.headline).toBe("newsletter open rate 21% → 36%");
  });

  it("a number the user typed in is a new proof point", () => {
    const rows = [...draftToReview(draft, [], []).numbers, { id: "x1", label: "Team size", value: "4 → 9", checked: false, isNew: true }];
    const s = storyFromReview(draft, fields, rows);
    expect(s.proof_points[2]).toMatchObject({ metric: "Team size", before: "4", after: "9" });
  });

  it("a number the user removed is gone", () => {
    const rows = draftToReview(draft, [], []).numbers.slice(0, 1);
    expect(storyFromReview(draft, fields, rows).proof_points).toHaveLength(1);
  });

  it("without a draft (typed from scratch) it makes a new story from the fields", () => {
    const s = storyFromReview(null, fields, [{ id: "n1", label: "Users", value: "40,000", checked: false, isNew: true }]);
    expect(s.id).toMatch(/^st_/);
    expect(s.proof_points[0]).toMatchObject({ metric: "Users", after: "40,000" });
    expect(s.title).toBe("Rescue");
  });
});
