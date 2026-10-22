import { describe, expect, it } from "vitest";
import { applyBundle, EMPTY_EXTRAS, mockApplication, mockDeleteQuestion, mockSaveProcess, mockSaveQuestion, mockSetStageDone, patchApplication, plainError, removeApplication, stageRows, type AppsState } from "../data/actions";
import type { AppBundle } from "../data/applicationCommands";
import { mockStore } from "../data/mock";

const base = (): AppsState => ({ applications: structuredClone(mockStore.applications), extras: structuredClone(mockStore.screens.applications.byApp) });
const TODAY = new Date("2026-10-21T21:30:00");

describe("application state", () => {
  it("replaces an application and its extras from a bundle, without touching the others or the input", () => {
    const s = base();
    const before = JSON.stringify(s);
    const kestrel = s.applications.find((a) => a.id === "app_kestrel")!;
    const bundle: AppBundle = { application: { ...kestrel, role: "Head of Lifecycle" }, extras: { ...EMPTY_EXTRAS, postingText: "New posting" } };
    const next = applyBundle(s, bundle);
    expect(next.applications.length).toBe(s.applications.length);
    expect(next.applications.find((a) => a.id === "app_kestrel")?.role).toBe("Head of Lifecycle");
    expect(next.applications.map((a) => a.id)).toEqual(s.applications.map((a) => a.id));
    expect(next.extras.app_kestrel.postingText).toBe("New posting");
    expect(JSON.stringify(s)).toBe(before);
  });

  it("puts an application it has not seen before first, with its extras", () => {
    const s = base();
    const fresh = mockApplication({ company: "Heronpay", role: "Lifecycle Manager" }, TODAY);
    const next = applyBundle(s, fresh);
    expect(next.applications[0].company).toBe("Heronpay");
    expect(next.applications.length).toBe(s.applications.length + 1);
    expect(next.extras[fresh.application.id]).toBeDefined();
  });

  it("removes an application and its extras", () => {
    const next = removeApplication(base(), "app_kestrel");
    expect(next.applications.some((a) => a.id === "app_kestrel")).toBe(false);
    expect(next.extras.app_kestrel).toBeUndefined();
  });

  it("says a rejected command in one plain line", () => {
    expect(plainError("The company name can't be empty.")).toBe("The company name can't be empty.");
    expect(plainError(new Error("Error: Write the question first."))).toBe("Write the question first.");
    expect(plainError(undefined)).toMatch(/Nothing was changed/);
    expect(plainError({})).toMatch(/Nothing was changed/);
  });
});

describe("the browser preview's own application", () => {
  it("starts with the four default stages in order, labelled in plain words", () => {
    const { application } = mockApplication({ company: "  Heronpay " }, TODAY);
    expect(application.company).toBe("Heronpay");
    expect(application.applied_on).toBe("2026-10-21");
    expect(application.process.map((s) => s.label)).toEqual(["Recruiter", "Hiring manager", "Panel", "Leadership"]);
    expect(application.process.map((s) => s.order)).toEqual([1, 2, 3, 4]);
    expect(new Set(application.process.map((s) => s.id)).size).toBe(4);
    expect(application.status).toBe("applied");
  });

  it("uses the stages it is given, with their dates", () => {
    const { application } = mockApplication({ company: "A", stages: [{ stage: "technical", at: "2026-10-30T10:00" }, { stage: "panel", label: "Team lunch" }] }, TODAY);
    expect(application.process.map((s) => [s.label, s.at])).toEqual([["Technical", "2026-10-30T10:00"], ["Team lunch", undefined]]);
  });
});

describe("changing the core fields", () => {
  const fresh = () => mockApplication({ company: "Heronpay", role: "Lifecycle Manager", source: "Referral" }, TODAY);

  it("saves a changed field, lists it as edited and remembers what it was, once", () => {
    const first = patchApplication(fresh(), { role: "Senior Lifecycle Manager" });
    expect(first.application.role).toBe("Senior Lifecycle Manager");
    expect(first.application.edited_by_user).toEqual(["role"]);
    expect(first.extras.wasValues.role).toBe("Lifecycle Manager");
    const second = patchApplication(first, { role: "Head of Lifecycle" });
    expect(second.extras.wasValues.role).toBe("Lifecycle Manager");
    expect(second.application.edited_by_user).toEqual(["role"]);
  });

  it("leaves a field alone that was sent unchanged", () => {
    const out = patchApplication(fresh(), { company: "Heronpay", source: "Referral", startup: false });
    expect(out.application.edited_by_user).toEqual([]);
  });

  it("will not empty the company name", () => {
    expect(() => patchApplication(fresh(), { company: "   " })).toThrow("The company name can't be empty.");
  });

  it("will not close without a reason, and keeps the reason it is given", () => {
    expect(() => patchApplication(fresh(), { status: "closed" })).toThrow(/why it closed/i);
    const closed = patchApplication(fresh(), { status: "closed", closed_reason: "withdrew" });
    expect(closed.application.status).toBe("closed");
    expect(closed.application.closed_reason).toBe("withdrew");
    expect(closed.application.edited_by_user).toEqual(expect.arrayContaining(["status", "closed_reason"]));
    const reopened = patchApplication(closed, { status: "interviewing" });
    expect(reopened.application.closed_reason).toBeNull();
  });

  it("does not change its input", () => {
    const b = fresh();
    const before = JSON.stringify(b);
    patchApplication(b, { role: "Other", notes: "A note", contacts: [{ name: "Priya", role: "Recruiter", email_or_phone: "", notes: "" }] });
    expect(JSON.stringify(b)).toBe(before);
  });
});

describe("the stage list", () => {
  const withSessions = () => {
    const b = mockApplication({ company: "A" }, TODAY);
    b.application.process[1].sessions = 3;
    b.application.process[1].at = "2026-10-23T14:00";
    return b;
  };

  it("reorders and renames without losing the ids, dates or practice of a stage", () => {
    const b = withSessions();
    const rows = stageRows(b.application);
    const out = mockSaveProcess(b, [rows[1], { ...rows[0], label: "Intro call" }, rows[2], rows[3]], false);
    expect(out.status).toBe("saved");
    const p = out.bundle!.application.process;
    expect(p.map((s) => s.label)).toEqual(["Hiring manager", "Intro call", "Panel", "Leadership"]);
    expect(p.map((s) => s.order)).toEqual([1, 2, 3, 4]);
    expect(p[0].id).toBe(b.application.process[1].id);
    expect(p[0].sessions).toBe(3);
    expect(p[0].at).toBe("2026-10-23T14:00");
  });

  it("asks before removing a stage that has sessions, then removes it and its questions", () => {
    const b = withSessions();
    const stage = b.application.process[1];
    b.extras.questions = [{ id: "q_1", stageId: stage.id, type: "behavioral", text: "Tell me about a time." }, { id: "q_2", stageId: b.application.process[0].id, type: "factual", text: "Notice?" }];
    const rows = stageRows(b.application).filter((r) => r.id !== stage.id);
    const ask = mockSaveProcess(b, rows, false);
    expect(ask).toMatchObject({ status: "needs_confirm", sessions: 3, stage_ids: [stage.id], bundle: null });
    const done = mockSaveProcess(b, rows, true);
    expect(done.status).toBe("saved");
    expect(done.bundle!.application.process.length).toBe(3);
    expect(done.bundle!.extras.questions.map((q) => q.id)).toEqual(["q_2"]);
  });

  it("removes a stage with no sessions without asking, and gives a new row a new id", () => {
    const b = withSessions();
    const rows = stageRows(b.application).filter((r) => r.stage !== "panel");
    const out = mockSaveProcess(b, [...rows, { stage: "technical", label: "", at: "2026-11-02" }], false);
    expect(out.status).toBe("saved");
    const p = out.bundle!.application.process;
    expect(p.length).toBe(4);
    expect(new Set(p.map((s) => s.id)).size).toBe(4);
    expect(p[3]).toMatchObject({ stage: "technical", label: "Technical", at: "2026-11-02", sessions: 0, done: false });
  });

  it("keeps the earlier date when a date moves", () => {
    const b = withSessions();
    const rows = stageRows(b.application).map((r) => (r.stage === "hiring_manager" ? { ...r, at: "2026-10-24T14:00" } : r));
    const p = mockSaveProcess(b, rows, false).bundle!.application.process;
    expect(p[1].at).toBe("2026-10-24T14:00");
    expect(p[1].previous_at).toEqual(["2026-10-23T14:00"]);
  });

  it("marks a stage done", () => {
    const b = withSessions();
    expect(mockSetStageDone(b, b.application.process[0].id, true).application.process[0].done).toBe(true);
  });
});

describe("the question set", () => {
  it("adds a question as the user's own, changes one, and deletes one", () => {
    const b = mockApplication({ company: "A" }, TODAY);
    const stage = b.application.process[0].id;
    const one = mockSaveQuestion(b, { stage_id: stage, text: "  What is your notice period?  ", kind: "factual" });
    expect(one.extras.questions).toHaveLength(1);
    expect(one.extras.questions[0]).toMatchObject({ text: "What is your notice period?", type: "factual", editedByUser: true });
    const two = mockSaveQuestion(one, { stage_id: stage, text: "Why us?", kind: "motivation" });
    expect(new Set(two.extras.questions.map((q) => q.id)).size).toBe(2);
    const changed = mockSaveQuestion(two, { id: one.extras.questions[0].id, stage_id: stage, text: "How much notice?", kind: "factual" });
    expect(changed.extras.questions.map((q) => q.text)).toEqual(["How much notice?", "Why us?"]);
    expect(mockDeleteQuestion(changed, one.extras.questions[0].id).extras.questions.map((q) => q.text)).toEqual(["Why us?"]);
  });

  it("will not save an empty question", () => {
    const b = mockApplication({ company: "A" }, TODAY);
    expect(() => mockSaveQuestion(b, { stage_id: b.application.process[0].id, text: "  ", kind: "gap" })).toThrow("Write the question first.");
  });
});
