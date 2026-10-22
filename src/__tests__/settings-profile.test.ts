import { describe, expect, it } from "vitest";
import { BLANK_PROFILE } from "../data/real";
import type { Profile } from "../data/types";
import { profileToSave, SAVE_FAILED, type ProfileFields } from "../screens/settings/profileSave";

const base: Profile = { ...BLANK_PROFILE, name: "Sam", fullName: "Sam Rivera", targetRole: "Product manager", seniority: "mid", industry: "Fintech", sellsTo: "b2b", identityStatement: "I fix onboarding.", focusHabits: ["numbers"] };
const fields = (over: Partial<ProfileFields> = {}): ProfileFields => ({ name: "Sam", role: "Product manager", industry: "Fintech", seniority: "mid", sellsTo: "b2b", who: "I fix onboarding.", focus: ["numbers"], ...over });

describe("saving the profile from Settings", () => {
  it("has nothing to save when nothing changed", () => {
    expect(profileToSave(base, fields())).toEqual({ kind: "same" });
  });

  it("saves a change and keeps what Settings does not ask for", () => {
    const r = profileToSave(base, fields({ role: "  Group product manager " }));
    expect(r.kind).toBe("save");
    if (r.kind === "save") {
      expect(r.profile.targetRole).toBe("Group product manager");
      expect(r.profile.fullName).toBe("Sam Rivera");
    }
  });

  it("asks for a name and a role instead of saving them empty, in plain words", () => {
    const r = profileToSave(base, fields({ name: " ", role: "" }));
    expect(r.kind).toBe("problem");
    if (r.kind === "problem") {
      expect(r.name).toMatch(/first name/);
      expect(r.role).toMatch(/role/);
    }
  });

  it("keeps at most two focus habits, the last two picked", () => {
    const r = profileToSave(base, fields({ focus: ["numbers", "ownership", "fillers"] }));
    expect(r.kind === "save" && r.profile.focusHabits).toEqual(["ownership", "fillers"]);
  });

  it("saves no focus habit when none is picked, so Ensayo suggests one later", () => {
    const r = profileToSave(base, fields({ focus: [] }));
    expect(r.kind === "save" && r.profile.focusHabits).toEqual([]);
  });

  it("words a failed save without alarm or exclamation", () => {
    expect(SAVE_FAILED).not.toMatch(/!/);
    expect(SAVE_FAILED).not.toMatch(/—/);
  });
});
