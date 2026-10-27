import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import type { Application, SessionSummary, Story, Target } from "../data/types";
import type { RepSummary } from "../practice/habits";
import { filterRepsByTarget, filterSessionsByTarget, progressChoices, sessionTargetId, totalsFor, type TargetedRep } from "../screens/settings/progressTargets";
import { leadStories, presetFor, repTargetId, targetReadiness } from "../data/readiness";

const [b2c, b2b] = mockStore.targets;
const targets: Target[] = [b2c, b2b];
const NOW = new Date("2026-10-21T21:30:00");

const rep = (over: Partial<TargetedRep> = {}): TargetedRep => ({
  session_id: "s1", mode: "drill", stage: "recruiter", application_id: null, started: "2026-10-19T09:00:00", n: 1, question_id: "q1", question_text: "Q", question_type: "behavioral", attempt: 1, follow_up: false,
  recorded_at: "2026-10-19T09:01:00", rubric_version: 1, fix: null, note: null, note_was_wrong: false, checks: [], speaking_ms: 1000, fillers: 0, tail_ms: null, ai_cost_usd: null, ...over,
} as RepSummary as TargetedRep);

const app = (over: Partial<Application> = {}): Application => ({ ...mockStore.applications[0], targetId: "tg_b2c", status: "applied", analysis: null, resume: null, process: [], ...over });

describe("which answers belong to which target", () => {
  const apps = [app({ id: "a_b2b", targetId: "tg_b2b" })];
  it("uses the answer's own target, else its application's, else the first target", () => {
    expect(repTargetId(rep({ target_id: "tg_b2b" }), apps, targets)).toBe("tg_b2b");
    expect(repTargetId(rep({ application_id: "a_b2b" }), apps, targets)).toBe("tg_b2b");
    expect(repTargetId(rep(), apps, targets)).toBe("tg_b2c");
  });
  it("filters by target and keeps everything for All", () => {
    const reps = [rep({ question_id: "1", target_id: "tg_b2c" }), rep({ question_id: "2", target_id: "tg_b2b" }), rep({ question_id: "3" })];
    expect(filterRepsByTarget(reps, apps, targets, "all")).toHaveLength(3);
    expect(filterRepsByTarget(reps, apps, targets, "tg_b2c").map((r) => r.question_id)).toEqual(["1", "3"]);
    expect(filterRepsByTarget(reps, apps, targets, "tg_b2b").map((r) => r.question_id)).toEqual(["2"]);
  });
  it("narrows the counts but not the days in a row", () => {
    const reps = [rep({ question_id: "1", target_id: "tg_b2c", recorded_at: "2026-10-21T09:00:00" }), rep({ question_id: "2", target_id: "tg_b2b", recorded_at: "2026-10-20T09:00:00" }), rep({ question_id: "3", target_id: "tg_b2b", follow_up: true, recorded_at: "2026-10-20T09:05:00" })];
    const only = filterRepsByTarget(reps, apps, targets, "tg_b2b");
    expect(totalsFor(reps, only, NOW)).toEqual({ daysInARow: 2, answers: 1, questions: 1, followUps: 1 });
  });
});

describe("sessions by target", () => {
  const apps = [app({ id: "a_b2b", targetId: "tg_b2b" })];
  const sessions: SessionSummary[] = [
    { id: "1", when: "", group: "This week", mode: "drill", title: "", headline: "", targetId: "tg_b2b" },
    { id: "2", when: "", group: "This week", mode: "drill", title: "", headline: "", applicationId: "a_b2b" },
    { id: "3", when: "", group: "This week", mode: "mock", title: "", headline: "" },
  ];
  it("reads the session's target, else its application's, else the first", () => {
    expect(sessionTargetId(sessions[0], apps, targets)).toBe("tg_b2b");
    expect(sessionTargetId(sessions[1], apps, targets)).toBe("tg_b2b");
    expect(sessionTargetId(sessions[2], apps, targets)).toBe("tg_b2c");
  });
  it("filters", () => {
    expect(filterSessionsByTarget(sessions, apps, targets, "tg_b2b").map((s) => s.id)).toEqual(["1", "2"]);
    expect(filterSessionsByTarget(sessions, apps, targets, "tg_b2c").map((s) => s.id)).toEqual(["3"]);
    expect(filterSessionsByTarget(sessions, apps, targets, "all")).toHaveLength(3);
  });
  it("offers an archived target only while something is filed under it", () => {
    const arch = [b2c, { ...b2b, archived: true }];
    expect(progressChoices(arch, ["tg_b2c"]).map((t) => t.id)).toEqual(["tg_b2c"]);
    expect(progressChoices(arch, ["tg_b2c", "tg_b2b"]).map((t) => t.id)).toEqual(["tg_b2c", "tg_b2b"]);
  });
});

describe("ready for each target", () => {
  const story = (id: string, verified: boolean): Story => ({ ...mockStore.stories[0], id, verified });
  const stories = [story("s1", true), story("s2", true), story("s3", false), story("s4", true)];
  const input = (over: Partial<Parameters<typeof targetReadiness>[1]> = {}) => ({ targets, stories, applications: [] as Application[], reps: [] as TargetedRep[], now: NOW, ...over });

  it("starts with the pitch when nothing has been practiced", () => {
    const r = targetReadiness(b2b, input());
    expect(r.lines.map((x) => x.title)).toEqual(["Pitch not practiced yet", "Lead stories verified", "No Mock yet", "No open gaps"]);
    expect(r.action).toEqual({ kind: "pitch", label: "Practice the pitch", primary: true });
  });

  it("counts the pitch once per question and says when it was last practiced", () => {
    const reps = [
      rep({ question_type: "tell_me_about_yourself", question_id: "p1", session_id: "a", target_id: "tg_b2c", recorded_at: "2026-10-17T10:00:00" }),
      rep({ question_type: "tell_me_about_yourself", question_id: "p1", session_id: "a", attempt: 2, target_id: "tg_b2c", recorded_at: "2026-10-17T10:02:00" }),
      rep({ question_type: "about_you", question_id: "p1", session_id: "b", target_id: "tg_b2c", recorded_at: "2026-10-19T10:00:00" }),
      rep({ question_type: "tell_me_about_yourself", question_id: "p2", session_id: "c", target_id: "tg_b2b" }),
      rep({ question_type: "behavioral", question_id: "x", session_id: "d", target_id: "tg_b2c" }),
    ];
    const r = targetReadiness(b2c, input({ reps }));
    expect(r.lines[0]).toEqual({ id: "pitch", ok: true, title: "Pitch practiced 2 times", detail: "last on Oct 19" });
    expect(targetReadiness(b2b, input({ reps })).lines[0].title).toBe("Pitch practiced once");
  });

  it("counts lead stories: the pinned ones, else the first three it uses, never the hidden", () => {
    const pinned = { ...b2c, pinnedStoryIds: ["s1", "s3"] };
    expect(targetReadiness(pinned, input()).lines[1]).toMatchObject({ ok: false, detail: "1 of 2 · verified means every number in the story is checked by you" });
    expect(leadStories({ pinnedStoryIds: [], hiddenStoryIds: ["s1"] }, stories).map((s) => s.id)).toEqual(["s2", "s3", "s4"]);
    expect(targetReadiness({ ...b2c, pinnedStoryIds: ["s1", "s2"] }, input()).lines[1]).toMatchObject({ ok: true, detail: "2 of 2 · verified means every number in the story is checked by you" });
    expect(targetReadiness(b2c, input({ stories: [] })).lines[1]).toMatchObject({ ok: false, title: "No lead stories yet" });
  });

  it("reads the last Mock and the must-say points said", () => {
    const withPoints = app({ id: "a1", targetId: "tg_b2c", status: "interviewing", resume: { ...mockStore.applications[0].resume!, mustSay: [
      { id: "1", text: "", resume: "", said: "Said in 2 of 3" }, { id: "2", text: "", resume: "", said: "Not said yet" }, { id: "3", text: "", resume: "", said: "Said in 1 of 1" },
    ] } });
    const reps = [rep({ mode: "mock", application_id: "a1", started: "2026-10-18T09:00:00", recorded_at: "2026-10-18T09:20:00" })];
    expect(targetReadiness(b2c, input({ applications: [withPoints], reps })).lines[2]).toEqual({ id: "mock", ok: true, title: "Last Mock, Oct 18", detail: "said 2 of 3 must-say points" });
  });

  it("names who could call when no Mock has been done", () => {
    const soon = app({ id: "a2", company: "Ledgerline", targetId: "tg_b2b", process: [{ ...mockStore.applications[0].process[1], at: "2026-10-30T10:00", done: false }] });
    expect(targetReadiness(b2b, input({ applications: [soon] })).lines[2].detail).toBe("Ledgerline could call any day");
  });

  it("lists open gaps and points the button at the application that has them", () => {
    const analysis = { ...mockStore.applications[0].analysis!, gaps: ["SQL for cohort analysis", "push at scale"] };
    const a = app({ id: "a3", company: "Kestrel Pay", targetId: "tg_b2c", status: "interviewing", analysis });
    const closed = app({ id: "a4", targetId: "tg_b2c", status: "closed", analysis });
    const reps = [rep({ question_type: "tell_me_about_yourself", target_id: "tg_b2c" })];
    const r = targetReadiness(b2c, input({ applications: [a, closed], reps }));
    expect(r.lines[3]).toEqual({ id: "gaps", ok: false, title: "2 open gaps", detail: "things the posting asks for that no story covers: SQL for cohort analysis, push at scale" });
    expect(r.action).toEqual({ kind: "gap", label: "Practice a gap", primary: false, applicationId: "a3" });
    expect(presetFor(r.action)).toEqual({ mode: "drill", source: "application", applicationId: "a3" });
    expect(presetFor({ kind: "pitch", label: "", primary: true })).toEqual({ mode: "drill", source: "stage", stage: "recruiter" });
  });

  it("says where the gaps came from when there are many", () => {
    const analysis = { ...mockStore.applications[0].analysis!, gaps: ["a", "b", "c"] };
    const r = targetReadiness(b2b, input({ applications: [app({ id: "a5", company: "Ledgerline", targetId: "tg_b2b", analysis })] }));
    expect(r.lines[3].detail).toBe("things the postings from Ledgerline ask for that no story covers");
  });
});
