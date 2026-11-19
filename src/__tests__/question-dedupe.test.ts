import { describe, expect, it } from "vitest";
import { banksFor, nearDuplicate, pickApplicationQuestions, type ExtraQuestion } from "../practice/questions";

const ex = (id: string, text: string, over: Partial<ExtraQuestion> = {}): ExtraQuestion => ({ id, stageId: "stg_1", type: "factual", text, source: "jd", ...over });

describe("the same question in other words", () => {
  it("catches the right to work asked twice", () => {
    expect(nearDuplicate("Are you legally entitled to work in Spain, and when could you start?", "Do you need a visa or sponsorship to take this role?")).toBe(true);
    expect(nearDuplicate("Are you authorized to work in the country without sponsorship?", "Are you entitled to work here?")).toBe(true);
    expect(nearDuplicate("When could you start if we made an offer?", "Are you entitled to work here?")).toBe(false);
  });

  it("catches the career history asked twice", () => {
    expect(nearDuplicate("Walk me through your background and how you got here.", "Map your roles and years so I can see the timeline.")).toBe(true);
    expect(nearDuplicate("Walk me through your background.", "How many years of SQL experience do you have?")).toBe(false);
  });

  it("catches the same tool and the same subject", () => {
    expect(nearDuplicate("How have you built reports and dashboards in Aurora CRM for a revenue team?", "Tell me about your experience creating reports and dashboards in Aurora CRM.")).toBe(true);
    expect(nearDuplicate("How do you set up reports in Aurora CRM?", "Have you set up reporting in Aurora CRM?")).toBe(true);
  });

  it("keeps two questions about one tool but different things", () => {
    expect(nearDuplicate("How do you build reports in Aurora CRM?", "How do you keep data clean and avoid duplicate records in Aurora CRM?")).toBe(false);
  });

  it("puts the boundary without a shared topic at six tenths of the shorter question", () => {
    const base = "Describe forecast pipeline coverage quarterly planning";
    expect(nearDuplicate(base, "forecast pipeline coverage drives budget decisions")).toBe(true);
    expect(nearDuplicate(base, "forecast pipeline hygiene drives budget decisions")).toBe(false);
  });

  it("has nothing to compare for an empty question", () => {
    expect(nearDuplicate("", "Why this company?")).toBe(false);
  });
});

describe("a session's list for an application stage", () => {
  const bank = banksFor("Accountant");
  const base = { bank, stageId: "stg_1", stage: "recruiter", mode: "drill" as const, seed: 3, count: 8 };

  it("drops a gap question that repeats a posting question, including in an application saved before this fix", () => {
    const extras = [
      ex("q1", "Walk me through your background, and are you entitled to work in Spain?"),
      ex("q2", "How have you built reports and dashboards in Aurora CRM?", { type: "technical" }),
      ex("g1", "Do you need a visa or sponsorship to take this role?", { type: "gap", source: "gap" }),
      ex("g2", "Tell me about your experience creating reports and dashboards in Aurora CRM.", { type: "gap", source: "gap" }),
      ex("g3", "Map your roles and years so I can see the timeline.", { type: "gap", source: "gap" }),
      ex("g4", "How do you keep data clean and avoid duplicate records in Aurora CRM?", { type: "gap", source: "gap" }),
    ];
    const ids = pickApplicationQuestions({ ...base, extras }).map((q) => q.id);
    expect(ids.slice(0, 3)).toEqual(["q1", "q2", "g4"]);
    expect(ids).not.toContain("g1");
    expect(ids).not.toContain("g2");
    expect(ids).not.toContain("g3");
  });

  it("never drops a question the person wrote or was asked", () => {
    const extras = [ex("q1", "Are you entitled to work in Spain?"), ex("u1", "Do you need a visa to take this role?", { source: "user" }), ex("a1", "Are you authorized to work here?", { source: "asked" })];
    expect(pickApplicationQuestions({ ...base, extras }).map((q) => q.id).slice(0, 3)).toEqual(["q1", "u1", "a1"]);
  });

  it("skips general questions of a kind the stage's own questions cover", () => {
    const extras = [ex("q1", "What is prompting your search right now?", { type: "motivation" })];
    const got = pickApplicationQuestions({ ...base, extras, count: 40 });
    const general = got.filter((q) => q.id.startsWith("gen-"));
    expect(general.length).toBeGreaterThan(0);
    expect(general.some((q) => q.type === "motivation")).toBe(false);
    // With no motivation question of its own, the general ones are still available.
    const none = pickApplicationQuestions({ ...base, extras: [ex("q1", "Tell me about a launch you ran.", { type: "behavioral" })], count: 40 });
    expect(none.some((q) => q.type === "motivation")).toBe(true);
  });

  it("drops a general question that repeats an own question in other words", () => {
    const extras = [ex("q1", "What are you looking for in your next role?", { type: "factual" })];
    const got = pickApplicationQuestions({ ...base, extras, count: 40 });
    expect(got.filter((q) => q.text === "What are you looking for in your next role?")).toHaveLength(1);
    expect(got.filter((q) => q.id.startsWith("gen-")).some((q) => nearDuplicate(q.text, extras[0].text))).toBe(false);
  });
});
