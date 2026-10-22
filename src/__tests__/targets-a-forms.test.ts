import { describe, expect, it } from "vitest";
import { addStage, fileNameOf, formatPay, isResumeFileName, MAX_LEAD_WITH, parsePay, removeStage, stageChoices, targetToSave, youToSave, SAVE_FAILED, type TargetFields } from "../screens/settings/targetForms";
import type { Target, You } from "../data/types";

const you: You = { name: "Dana", fullName: "Dana Ortiz", focusHabits: ["to_the_point", "clean_stop"], activeTargetId: "tg_1" };

describe("saving You from Settings", () => {
  it("has nothing to save when nothing changed", () => {
    expect(youToSave(you, { name: "Dana", focus: ["to_the_point", "clean_stop"] })).toEqual({ kind: "same" });
  });
  it("saves a new name trimmed, and keeps the full name and the active target", () => {
    const r = youToSave(you, { name: "  Dani ", focus: you.focusHabits });
    expect(r).toEqual({ kind: "save", you: { ...you, name: "Dani" } });
  });
  it("asks for a name instead of saving it empty, in plain words", () => {
    const r = youToSave(you, { name: " ", focus: you.focusHabits });
    expect(r.kind).toBe("problem");
    if (r.kind === "problem") expect(r.name).toMatch(/first name/);
  });
  it("keeps at most two focus habits, the last two picked, and allows none", () => {
    const r = youToSave(you, { name: "Dana", focus: ["numbers", "ownership", "fillers"] });
    expect(r.kind === "save" && r.you.focusHabits).toEqual(["ownership", "fillers"]);
    expect(youToSave(you, { name: "Dana", focus: [] })).toMatchObject({ kind: "save", you: { focusHabits: [] } });
  });
  it("words a failed save without alarm", () => {
    expect(SAVE_FAILED).not.toMatch(/!|—/);
  });
});

const saved: Target = {
  id: "tg_1", name: "B2C lifecycle", color: "coral", role: "Senior Lifecycle Marketing Manager", roleFamily: "lifecycle", seniority: "senior", industry: "Fintech", sellsTo: "b2c", companyStage: "any", pitch: "I fix activation.",
  leadWith: ["I own lifecycle end to end"], pinnedStoryIds: ["s1"], hiddenStoryIds: ["s2"], defaultProcess: ["recruiter", "hiring_manager"], baseResume: null, payRange: null, archived: false, createdAt: "2026-10-01T00:00:00Z",
};
const fields = (over: Partial<TargetFields> = {}): TargetFields => ({
  name: "B2C lifecycle", role: "Senior Lifecycle Marketing Manager", roleFamily: "lifecycle", seniority: "senior", industry: "Fintech", sellsTo: "b2c", companyStage: "any", pitch: "I fix activation.",
  leadWith: ["I own lifecycle end to end"], defaultProcess: ["recruiter", "hiring_manager"], baseResume: null, payLow: "", payHigh: "", currency: "USD", ...over,
});

describe("saving a target from the editor", () => {
  it("has nothing to save when nothing changed", () => {
    expect(targetToSave(saved, fields())).toEqual({ kind: "same" });
  });
  it("keeps what the form does not show: pins, hidden stories, colour, archive state", () => {
    const r = targetToSave(saved, fields({ industry: "  Payments " }));
    expect(r.kind).toBe("save");
    if (r.kind === "save") expect(r.target).toEqual({ ...saved, industry: "Payments" });
  });
  it("asks for a role instead of saving without one", () => {
    const r = targetToSave(saved, fields({ role: " " }));
    expect(r).toMatchObject({ kind: "problem" });
    if (r.kind === "problem") expect(r.role).toMatch(/role/);
  });
  it("names a target from its role when the name is left empty", () => {
    const r = targetToSave(saved, fields({ name: " ", role: "Marketing Operations Manager", roleFamily: "marketing_ops", sellsTo: "b2b" }));
    expect(r.kind === "save" && r.target.name).toBe("B2B marketing ops");
  });
  it("keeps up to three non-empty lead-with points", () => {
    expect(MAX_LEAD_WITH).toBe(3);
    const r = targetToSave(saved, fields({ leadWith: [" one ", "", "two", "three", "four"] }));
    expect(r.kind === "save" && r.target.leadWith).toEqual(["one", "two", "three"]);
  });
  it("reads a pay range with commas and dollar signs, and says when it runs backwards", () => {
    const ok = targetToSave(saved, fields({ payLow: "$115,000", payHigh: "130000", currency: "CAD" }));
    expect(ok.kind === "save" && ok.target.payRange).toEqual({ low: 115000, high: 130000, currency: "CAD" });
    const bad = targetToSave(saved, fields({ payLow: "130000", payHigh: "115000" }));
    expect(bad).toMatchObject({ kind: "problem" });
    if (bad.kind === "problem") expect(bad.pay).toMatch(/low to high/);
    const one = targetToSave(saved, fields({ payLow: "115000", payHigh: "" }));
    expect(one).toMatchObject({ kind: "problem" });
  });
  it("clears the pay range when both are empty", () => {
    const withPay: Target = { ...saved, payRange: { low: 1, high: 2, currency: "USD" } };
    const r = targetToSave(withPay, fields({ payLow: "", payHigh: "" }));
    expect(r.kind === "save" && r.target.payRange).toBeNull();
  });
});

describe("pay", () => {
  it("parses and prints amounts", () => {
    expect(parsePay("$115,000")).toBe(115000);
    expect(parsePay("abc")).toBeNull();
    expect(parsePay("")).toBeNull();
    expect(formatPay(115000, "USD")).toBe("$115,000");
    expect(formatPay(98000, "CAD")).toBe("$98,000");
  });
});

describe("usual interview stages", () => {
  it("adds one at the end and offers the ones left", () => {
    expect(addStage(["recruiter"], "panel")).toEqual(["recruiter", "panel"]);
    expect(addStage(["recruiter"], "recruiter")).toEqual(["recruiter"]);
    expect(stageChoices(["recruiter", "panel"])).toEqual(["hiring_manager", "technical", "leadership"]);
  });
  it("removes one", () => {
    expect(removeStage(["recruiter", "panel"], "recruiter")).toEqual(["panel"]);
  });
});

describe("the base resume", () => {
  it("takes the file name from a pasted path on either kind of computer", () => {
    expect(fileNameOf("/Users/dana/Resumes/Dana Ortiz, Resume.pdf")).toBe("Dana Ortiz, Resume.pdf");
    expect(fileNameOf("C:\\Users\\dana\\resume.docx")).toBe("resume.docx");
    expect(fileNameOf("resume.pdf")).toBe("resume.pdf");
    expect(fileNameOf("  ")).toBe("");
    expect(isResumeFileName("Resume.PDF")).toBe(true);
    expect(isResumeFileName("notes.txt")).toBe(false);
  });
});
