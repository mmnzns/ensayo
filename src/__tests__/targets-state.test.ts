import { describe, expect, it } from "vitest";
import { applyProfile, blankTarget, duplicateTarget, saveTarget, setActive, setArchived, setStoryPriority, NO_TARGETS, type TargetsState } from "../data/targetState";
import type { Profile } from "../data/types";

const profile: Profile = { name: "Dana", fullName: "Dana Ortiz", targetRole: "Marketing Operations Manager", seniority: "senior", industry: "B2B SaaS", sellsTo: "b2b", identityStatement: "I run the stack.", focusHabits: ["numbers"] };

describe("the v0 profile save", () => {
  it("creates target 1 named from the role and who it sells to, and makes it active", () => {
    const s = applyProfile(NO_TARGETS, profile);
    expect(s.targets).toHaveLength(1);
    expect(s.targets[0]).toMatchObject({ name: "B2B marketing ops", roleFamily: "marketing_ops", pitch: "I run the stack.", color: "coral" });
    expect(s.you).toMatchObject({ name: "Dana", focusHabits: ["numbers"], activeTargetId: s.targets[0].id });
  });
  it("later saves change the active target and you, not a second target", () => {
    const first = applyProfile(NO_TARGETS, profile);
    const again = applyProfile(first, { ...profile, name: "Dani", targetRole: "Head of Growth" });
    expect(again.targets).toHaveLength(1);
    expect(again.targets[0].role).toBe("Head of Growth");
    expect(again.you?.name).toBe("Dani");
  });
});

describe("targets", () => {
  const start = (): TargetsState => applyProfile(NO_TARGETS, profile);
  it("a new one gets an id, the next colour and a name from its role when none is typed", () => {
    const { state, saved } = saveTarget(start(), { ...blankTarget(start().targets), role: "Senior Lifecycle Marketing Manager", sellsTo: "b2c" });
    expect(saved.id).not.toBe("");
    expect(saved.color).toBe("slate");
    expect(saved.name).toBe("B2C lifecycle");
    expect(state.targets).toHaveLength(2);
  });
  it("keeps at most three lead-with points and drops blanks", () => {
    const { saved } = saveTarget(start(), { ...blankTarget([]), role: "X", leadWith: ["a", " ", "b", "c", "d"] });
    expect(saved.leadWith).toEqual(["a", "b", "c"]);
  });
  it("duplicates with a new id and the same fields", () => {
    const s = start();
    const { saved } = duplicateTarget(s, s.targets[0].id);
    expect(saved.id).not.toBe(s.targets[0].id);
    expect(saved.pitch).toBe(s.targets[0].pitch);
    expect(saved.name).toBe("B2B marketing ops copy");
  });
  it("switches the active target, but not to an archived one", () => {
    let s = start();
    s = saveTarget(s, { ...blankTarget(s.targets), role: "Y", name: "Second" }).state;
    const second = s.targets[1];
    expect(setActive(s, second.id).you?.activeTargetId).toBe(second.id);
    const archived = setArchived(s, second.id, true);
    expect(() => setActive(archived, second.id)).toThrow();
  });
  it("archiving the active target moves active to another, and the last one cannot go", () => {
    let s = start();
    s = saveTarget(s, { ...blankTarget(s.targets), role: "Y", name: "Second" }).state;
    const first = s.targets[0];
    const out = setArchived(s, first.id, true);
    expect(out.you?.activeTargetId).toBe(s.targets[1].id);
    expect(() => setArchived(out, s.targets[1].id, true)).toThrow("Keep at least one target.");
  });
  it("pins and hides a story, never both", () => {
    const s = start();
    const id = s.targets[0].id;
    const pinned = setStoryPriority(s, id, "st_1", "pin");
    expect(pinned.targets[0].pinnedStoryIds).toEqual(["st_1"]);
    const hidden = setStoryPriority(pinned, id, "st_1", "hide");
    expect(hidden.targets[0]).toMatchObject({ pinnedStoryIds: [], hiddenStoryIds: ["st_1"] });
    expect(setStoryPriority(hidden, id, "st_1", "none").targets[0].hiddenStoryIds).toEqual([]);
  });
});
