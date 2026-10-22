import { describe, expect, it } from "vitest";
import { dateLabel, keptCounts, keptLine, repTargetId, targetReadiness } from "../data/readiness";
import { mockStore } from "../data/mock";
import type { Application, Story, Target } from "../data/types";
import type { RepSummary } from "../practice/habits";

const t = (id: string, over: Partial<Target> = {}): Target => ({
  id, name: id, color: "coral", role: "Senior Lifecycle Marketing Manager", roleFamily: "lifecycle", seniority: "senior", industry: "Fintech", sellsTo: "b2c", companyStage: "any", pitch: "I fix activation.", leadWith: [],
  pinnedStoryIds: [], hiddenStoryIds: [], defaultProcess: ["recruiter", "hiring_manager"], baseResume: null, payRange: null, archived: false, createdAt: "2026-10-22T00:00:00Z", ...over,
});
const first = t("tg_1");
const second = t("tg_2", { name: "B2B marketing ops" });
const targets = [first, second];

const rep = (over: Partial<RepSummary>): RepSummary => ({
  session_id: "s1", mode: "drill", stage: "recruiter", application_id: null, started: "2026-10-19T10:00:00", n: 1, question_id: "q1", question_text: "Tell me about yourself", question_type: "tell_me_about_yourself",
  attempt: 1, follow_up: false, recorded_at: "2026-10-19T10:05:00", rubric_version: 1, fix: null, note: null, note_was_wrong: false, checks: [], speaking_ms: 50000, fillers: 0, tail_ms: null, ai_cost_usd: null, ...over,
});
const story = (id: string, verified: boolean, practiced = 0): Story => ({ ...mockStore.stories[0], id, title: id, verified, usage: { practiced, fits: 0 } });
const app = (id: string, company: string, targetId: string | undefined, gaps: string[], over: Partial<Application> = {}): Application => ({
  ...mockStore.applications[0], id, company, targetId, status: "interviewing", analysis: { summary: "", priorities: [], beliefs: [], gaps, echo: [] }, ...over,
});
const lines = (r: ReturnType<typeof targetReadiness>) => Object.fromEntries(r.lines.map((l) => [l.id, l]));

describe("which target an answer belongs to", () => {
  it("uses the answer's own target first", () => {
    expect(repTargetId(rep({ target_id: "tg_2" }), [], targets)).toBe("tg_2");
  });
  it("then the application it was practised in", () => {
    expect(repTargetId(rep({ application_id: "a2" }), [app("a2", "Ledgerline", "tg_2", [])], targets)).toBe("tg_2");
  });
  it("then the first target, which is where answers from before targets went", () => {
    expect(repTargetId(rep({}), [], targets)).toBe("tg_1");
    expect(repTargetId(rep({ application_id: "gone" }), [], targets)).toBe("tg_1");
  });
});

describe("the pitch line", () => {
  it("counts the answers to tell-me-about-yourself for this target, retries and follow-ups left out", () => {
    const reps = [
      rep({ session_id: "s1", n: 1 }),
      rep({ session_id: "s1", n: 2, attempt: 2 }),
      rep({ session_id: "s2", n: 1, recorded_at: "2026-10-21T09:00:00" }),
      rep({ session_id: "s3", n: 1, follow_up: true }),
      rep({ session_id: "s4", n: 1, question_type: "behavioral" }),
      rep({ session_id: "s5", n: 1, target_id: "tg_2" }),
    ];
    const l = lines(targetReadiness(first, { targets, stories: [], applications: [], reps })).pitch;
    expect(l.ok).toBe(true);
    expect(l.title).toBe("Pitch practiced 2 times");
    expect(l.detail).toBe("last on Oct 21");
    expect(lines(targetReadiness(second, { targets, stories: [], applications: [], reps })).pitch.title).toBe("Pitch practiced once");
  });
  it("says so when it has not been practiced", () => {
    const l = lines(targetReadiness(second, { targets, stories: [], applications: [], reps: [] })).pitch;
    expect(l).toMatchObject({ ok: false, title: "Pitch not practiced yet", detail: "the first thing to fix" });
  });
});

describe("the lead stories line", () => {
  const stories = [story("a", true), story("b", false), story("c", true, 2), story("d", false, 1)];
  it("counts verified pinned stories out of pinned", () => {
    const l = lines(targetReadiness(t("tg_1", { pinnedStoryIds: ["a", "b"] }), { targets, stories, applications: [], reps: [] })).stories;
    expect(l).toMatchObject({ title: "Lead stories verified", detail: "1 of 2", ok: false });
  });
  it("is ready when every pinned story is verified", () => {
    const l = lines(targetReadiness(t("tg_1", { pinnedStoryIds: ["a", "c"] }), { targets, stories, applications: [], reps: [] })).stories;
    expect(l).toMatchObject({ detail: "2 of 2", ok: true });
  });
  it("with nothing pinned counts the stories in use, hidden ones left out", () => {
    const l = lines(targetReadiness(t("tg_1", { hiddenStoryIds: ["c"] }), { targets, stories, applications: [], reps: [] })).stories;
    expect(l.detail).toBe("1 of 3");
  });
  it("invites pinning when there is nothing to count", () => {
    const l = lines(targetReadiness(first, { targets, stories: [], applications: [], reps: [] })).stories;
    expect(l).toMatchObject({ ok: false, title: "No lead stories yet", detail: "pin up to three to put them first" });
  });
});

describe("the last Mock line", () => {
  it("names the date of the last Mock and how many must-say points were said", () => {
    const a = app("a1", "Kestrel Pay", "tg_1", [], {
      resume: { ...(mockStore.applications[0].resume as NonNullable<Application["resume"]>), mustSay: [
        { id: "1", text: "", resume: "", said: "Said in 2 of 3 mocks" },
        { id: "2", text: "", resume: "", said: "Said in 3 of 3" },
        { id: "3", text: "", resume: "", said: "Not said yet" },
      ] },
    });
    const reps = [rep({ mode: "mock", session_id: "m1", application_id: "a1", started: "2026-10-18T10:00:00", recorded_at: "2026-10-18T10:20:00" }), rep({ mode: "mock", session_id: "m0", started: "2026-10-01T10:00:00", recorded_at: "2026-10-01T10:20:00" })];
    const l = lines(targetReadiness(first, { targets, stories: [], applications: [a], reps })).mock;
    expect(l).toMatchObject({ ok: true, title: "Last Mock, Oct 18", detail: "said 2 of 3 must-say points" });
  });
  it("gives only the date when the Mock was not for an application", () => {
    const l = lines(targetReadiness(first, { targets, stories: [], applications: [], reps: [rep({ mode: "mock", started: "2026-10-18T10:00:00" })] })).mock;
    expect(l).toMatchObject({ title: "Last Mock, Oct 18", detail: "no must-say points to check yet" });
  });
  it("suggests one before the next call when there is none", () => {
    const a = app("a1", "Ledgerline", "tg_2", [], { process: [{ ...mockStore.applications[0].process[0], done: false, at: "2026-10-28T14:00" }] });
    const l = lines(targetReadiness(second, { targets, stories: [], applications: [a], reps: [], now: new Date("2026-10-21T21:00:00") })).mock;
    expect(l).toMatchObject({ ok: false, title: "No Mock yet", detail: "Ledgerline could call any day" });
    expect(lines(targetReadiness(first, { targets, stories: [], applications: [], reps: [] })).mock.detail).toBe("try one before an interview");
  });
});

describe("the open gaps line", () => {
  it("collects the gaps of this target's open applications and names them", () => {
    const apps = [app("a1", "Kestrel Pay", "tg_1", ["x"]), app("a2", "Northwind Bank", undefined, ["y"]), app("a3", "Ledgerline", "tg_2", ["z", "w", "v"]), app("a4", "Old Co", "tg_1", ["q"], { status: "closed" })];
    const l = lines(targetReadiness(first, { targets, stories: [], applications: apps, reps: [] })).gaps;
    expect(l).toMatchObject({ ok: false, title: "2 open gaps", detail: "x, y" });
    expect(lines(targetReadiness(second, { targets, stories: [], applications: apps, reps: [] })).gaps).toMatchObject({ title: "3 open gaps", detail: "from Ledgerline" });
  });
  it("says there are none", () => {
    expect(lines(targetReadiness(first, { targets, stories: [], applications: [app("a1", "Kestrel Pay", "tg_1", [])], reps: [] })).gaps).toMatchObject({ ok: true, title: "No open gaps", detail: "" });
  });
  it("lists the applications under the target, three names then a count", () => {
    const apps = [app("a1", "A", "tg_1", []), app("a2", "B", "tg_1", []), app("a3", "C", "tg_1", []), app("a4", "D", "tg_1", [])];
    expect(targetReadiness(first, { targets, stories: [], applications: apps, reps: [] }).applications).toEqual(["A", "B", "C", "D"]);
  });
});

describe("dates", () => {
  it("are short and the same in every language", () => {
    expect(dateLabel("2026-10-05T10:00:00")).toBe("Oct 5");
    expect(dateLabel("nonsense")).toBe("");
  });
});

describe("what an archived target keeps", () => {
  it("counts its applications and its sessions", () => {
    const old = t("tg_3", { archived: true });
    const all = [...targets, old];
    const apps = [app("a1", "A", "tg_3", []), app("a2", "B", "tg_3", []), app("a3", "C", "tg_1", [])];
    const reps = [rep({ session_id: "s1", target_id: "tg_3" }), rep({ session_id: "s1", n: 2, target_id: "tg_3" }), rep({ session_id: "s2", application_id: "a2" }), rep({ session_id: "s9" })];
    const k = keptCounts(old, { targets: all, applications: apps, reps });
    expect(k).toEqual({ applications: 2, sessions: 2 });
    expect(keptLine(k)).toBe("2 applications and 2 sessions kept");
  });
  it("words one, and none", () => {
    expect(keptLine({ applications: 1, sessions: 0 })).toBe("1 application kept");
    expect(keptLine({ applications: 0, sessions: 1 })).toBe("1 session kept");
    expect(keptLine({ applications: 0, sessions: 0 })).toBe("nothing in it yet");
  });
});
