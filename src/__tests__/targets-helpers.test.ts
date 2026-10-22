import { describe, expect, it } from "vitest";
import { applicationTarget, colorFor, fitBanner, mergedProfile, openingFor, pickableTargets, roleFamilyOf, targetName, visibleStories } from "../data/targets";
import { mockStore } from "../data/mock";
import type { Target } from "../data/types";

const t = (id: string, over: Partial<Target> = {}): Target => ({
  id, name: id, color: "coral", role: "Senior Lifecycle Marketing Manager", roleFamily: "lifecycle", seniority: "senior", industry: "Fintech", sellsTo: "b2c", companyStage: "any", pitch: "I fix activation.", leadWith: [],
  pinnedStoryIds: [], hiddenStoryIds: [], defaultProcess: ["recruiter", "hiring_manager"], baseResume: null, payRange: null, archived: false, createdAt: "2026-10-22T00:00:00Z", ...over,
});

describe("target names and colours", () => {
  it("name a target from its role and who it sells to", () => {
    expect(targetName("Senior Lifecycle Marketing Manager", "b2c")).toBe("B2C lifecycle");
    expect(targetName("Marketing Operations Manager", "b2b")).toBe("B2B marketing ops");
    expect(targetName("Chef", "both")).toBe("Chef");
    expect(targetName("", "both")).toBe("My target");
  });
  it("read the family from the role words", () => {
    expect(roleFamilyOf("Marketing Operations Manager")).toBe("marketing_ops");
    expect(roleFamilyOf("CRM lead")).toBe("lifecycle");
    expect(roleFamilyOf("Head of Growth")).toBe("growth");
    expect(roleFamilyOf("Poet")).toBe("other");
  });
  it("hand colours out in order and repeat after five", () => {
    expect([0, 1, 2, 5].map(colorFor)).toEqual(["coral", "slate", "green", "coral"]);
  });
});

describe("which stories a target uses", () => {
  const [a, b, c] = mockStore.stories;
  it("removes hidden ones and puts pinned ones first", () => {
    const ids = visibleStories([a, b, c], { pinnedStoryIds: [c.id], hiddenStoryIds: [a.id] }).map((s) => s.id);
    expect(ids).toEqual([c.id, b.id]);
  });
  it("leaves the list alone with no target", () => {
    expect(visibleStories([a, b], undefined)).toEqual([a, b]);
  });
  it("opens with the angle's headline when there is one, else the story's own", () => {
    const story = { ...a, angles: [{ target_id: "tg_b2b", headline: "Our handoff was broken.", emphasis: [], lead_branch: null }] };
    expect(openingFor(story, "tg_b2b")).toBe("Our handoff was broken.");
    expect(openingFor(story, "tg_b2c")).toBe(a.direct_answer);
  });
});

describe("an application's target", () => {
  const targets = [t("a"), t("b")];
  it("is the one it names, else the first that is not archived", () => {
    expect(applicationTarget({ targetId: "b" }, targets)?.id).toBe("b");
    expect(applicationTarget({}, [t("x", { archived: true }), t("y")])?.id).toBe("y");
  });
  it("puts the active target first in the picker and leaves archived ones out", () => {
    expect(pickableTargets([t("a"), t("b"), t("c", { archived: true })], "b").map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("the merged v0 profile", () => {
  it("takes the name and habits from you and the job from the target", () => {
    const p = mergedProfile({ name: "Dana", fullName: "Dana Ortiz", focusHabits: ["numbers"], activeTargetId: "a" }, t("a", { pitch: "Pitch." }));
    expect(p).toMatchObject({ name: "Dana", targetRole: "Senior Lifecycle Marketing Manager", identityStatement: "Pitch.", focusHabits: ["numbers"] });
  });
});

describe("the target-fit banner", () => {
  const targets = [t("b2c"), t("b2b", { sellsTo: "b2b" })];
  const fit = (best: string | null, a: "strong" | "ok" | "weak", b: "strong" | "ok" | "weak") => ({ sellsTo: "b2b" as const, roleFamily: "marketing_ops" as const, seniority: "senior" as const, bestTargetId: best, mismatchNotes: [], perTarget: [{ targetId: "b2c", fit: a, why: "" }, { targetId: "b2b", fit: b, why: "" }] });
  it("stays quiet when the posting fits where it is filed", () => {
    expect(fitBanner({ targetId: "b2c", targetFit: fit("b2c", "strong", "weak") }, targets)).toBeNull();
    expect(fitBanner({ targetId: "b2c", targetFit: null }, targets)).toBeNull();
  });
  it("suggests the better target when the posting fits another one", () => {
    const b = fitBanner({ targetId: "b2c", targetFit: fit("b2b", "weak", "strong") }, targets)!;
    expect(b.suggested?.id).toBe("b2b");
    expect(b.filed?.id).toBe("b2c");
  });
  it("offers a new target when nothing fits well, naming the closest", () => {
    const b = fitBanner({ targetId: "b2c", targetFit: fit(null, "weak", "ok") }, targets)!;
    expect(b.suggested).toBeNull();
    expect(b.closest?.id).toBe("b2b");
  });
});
