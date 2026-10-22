import { describe, expect, it } from "vitest";
import { bytesOf, contactFromText, fileSlug, filledContacts, isResumeFile, isoDay, joinAt, lockQuestions, moveItem, splitAt, stageInputs } from "../screens/applications/forms";

describe("dates the backend accepts", () => {
  it("splits a stored date-time into a date and a time", () => {
    expect(splitAt("2026-10-23T14:00")).toEqual({ date: "2026-10-23", time: "14:00" });
    expect(splitAt("2026-10-23T09:05:30")).toEqual({ date: "2026-10-23", time: "09:05" });
    expect(splitAt("2026-10-23")).toEqual({ date: "2026-10-23", time: "" });
    expect(splitAt(undefined)).toEqual({ date: "", time: "" });
    expect(splitAt("Oct 23")).toEqual({ date: "", time: "" });
  });

  it("joins them back, and a time with no date is no date", () => {
    expect(joinAt("2026-10-23", "14:00")).toBe("2026-10-23T14:00");
    expect(joinAt("2026-10-23", "")).toBe("2026-10-23");
    expect(joinAt("", "14:00")).toBeNull();
    expect(joinAt("23/10/2026", "")).toBeNull();
    expect(joinAt(" 2026-10-23 ", " 14:00 ")).toBe("2026-10-23T14:00");
  });

  it("keeps only the day for a date input", () => {
    expect(isoDay("2026-10-06T14:00")).toBe("2026-10-06");
    expect(isoDay("Oct 6")).toBe("");
  });
});

describe("contacts", () => {
  it("turns 'Priya, recruiter' into a name and a role", () => {
    expect(contactFromText("Priya, recruiter")).toEqual([{ name: "Priya", role: "recruiter", email_or_phone: "", notes: "" }]);
    expect(contactFromText("Marco")[0]).toMatchObject({ name: "Marco", role: "" });
    expect(contactFromText("  ")).toEqual([]);
  });

  it("drops contacts with nothing in them", () => {
    const blank = { name: "", role: "", email_or_phone: "", notes: "" };
    expect(filledContacts([blank, { ...blank, notes: "Moved it to Friday" }, { ...blank, name: " " }])).toHaveLength(1);
  });
});

describe("stage rows", () => {
  it("moves a row up or down and stops at the ends", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    const list = ["a", "b"];
    expect(moveItem(list, 0, -1)).toBe(list);
    expect(moveItem(list, 1, 1)).toBe(list);
  });

  it("saves rows in order, with an id only for stages that already exist", () => {
    const rows = stageInputs([
      { key: "stg_2", id: "stg_2", stage: "hiring_manager", label: " Hiring manager ", date: "2026-10-23", time: "14:00" },
      { key: "new_1", stage: "technical", label: "Technical", date: "", time: "09:00" },
    ]);
    expect(rows).toEqual([
      { id: "stg_2", stage: "hiring_manager", label: "Hiring manager", at: "2026-10-23T14:00" },
      { stage: "technical", label: "Technical", at: null },
    ]);
    expect("id" in rows[1]).toBe(false);
  });
});

describe("files and the night before", () => {
  it("accepts PDF and Word by name", () => {
    expect(isResumeFile("Dana Ortiz, Resume.pdf")).toBe(true);
    expect(isResumeFile("resume.DOCX")).toBe(true);
    expect(isResumeFile("resume.doc")).toBe(true);
    expect(isResumeFile("resume.pages")).toBe(false);
    expect(isResumeFile("pdf")).toBe(false);
  });

  it("names a download after the company", () => {
    expect(fileSlug("Kestrel Pay", "cue-sheet.md")).toBe("kestrel-pay-cue-sheet.md");
    expect(fileSlug("???", "cue-sheet.md")).toBe("ensayo-cue-sheet.md");
  });

  it("locks at most two questions, trimmed", () => {
    expect(lockQuestions([" one ", "", "two", "three"])).toEqual(["one", "two"]);
    expect(lockQuestions([])).toEqual([]);
  });

  it("reads a file's bytes", async () => {
    const bytes = await bytesOf(new Blob([new Uint8Array([37, 80, 68, 70])]));
    expect(Array.from(bytes)).toEqual([37, 80, 68, 70]);
  });
});
