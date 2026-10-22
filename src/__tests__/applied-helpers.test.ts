import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import type { Application, ProcessStage } from "../data/types";
import { nextDated, stageWhen, consistencyNotes, consistencySentences, debriefContext, flagsOfReps, nextOpenStage, practiceTarget, unknownCheckLabel } from "../practice/applied";
import type { Check, FullRep } from "../practice/types";

const stage = (id: string, kind: ProcessStage["stage"], order: number, over: Partial<ProcessStage> = {}): ProcessStage => ({ id, stage: kind, label: kind, order, done: false, decides: "", sessions: 0, ...over });
const app = (id: string, process: ProcessStage[], over: Partial<Application> = {}): Application => ({ ...mockStore.applications[0], id, process, current_stage_id: null, status: "interviewing", ...over });

describe("the next open stage", () => {
  it("is the current stage when it is still open", () => {
    const a = app("a", [stage("s1", "recruiter", 1, { done: true }), stage("s2", "hiring_manager", 2), stage("s3", "panel", 3)], { current_stage_id: "s3" });
    expect(nextOpenStage(a)?.id).toBe("s3");
  });

  it("is the first open stage, by order, when the current one is done or missing", () => {
    const a = app("a", [stage("s3", "panel", 3), stage("s1", "recruiter", 1, { done: true }), stage("s2", "hiring_manager", 2)], { current_stage_id: "s1" });
    expect(nextOpenStage(a)?.id).toBe("s2");
    expect(nextOpenStage({ ...a, current_stage_id: null })?.id).toBe("s2");
    expect(nextOpenStage({ ...a, current_stage_id: "gone" })?.id).toBe("s2");
  });

  it("is nothing when every stage is done or there are none", () => {
    expect(nextOpenStage(app("a", [stage("s1", "recruiter", 1, { done: true })]))).toBeUndefined();
    expect(nextOpenStage(app("a", []))).toBeUndefined();
  });
});

describe("what a session inside an application practises", () => {
  const now = new Date("2026-10-22T09:00:00");
  const soon = app("soon", [stage("a1", "recruiter", 1, { done: true }), stage("a2", "hiring_manager", 2, { at: "2026-10-23T14:00" })]);
  const later = app("later", [stage("b1", "recruiter", 1, { at: "2026-10-30T10:00" })]);
  const undated = app("undated", [stage("c1", "technical", 1)], { applied_on: "2026-10-20" });
  const closed = app("closed", [stage("d1", "recruiter", 1)], { status: "closed" });

  it("is the nearest interview", () => {
    expect(practiceTarget([later, soon], now)).toMatchObject({ application: { id: "soon" }, stage: { id: "a2" } });
  });

  it("is the application's next open stage when nothing is dated", () => {
    expect(practiceTarget([closed, undated], now)).toMatchObject({ application: { id: "undated" }, stage: { id: "c1" } });
  });

  it("is what a button asked for, the stage too when it names one", () => {
    expect(practiceTarget([soon, later], now, { applicationId: "later" })).toMatchObject({ application: { id: "later" }, stage: { id: "b1" } });
    expect(practiceTarget([soon, later], now, { applicationId: "soon", stageId: "a1" })).toMatchObject({ stage: { id: "a1" } });
  });

  it("falls back to the nearest one when the asked-for application is gone", () => {
    expect(practiceTarget([soon], now, { applicationId: "gone" })?.application.id).toBe("soon");
  });

  it("is nothing for an empty list", () => {
    expect(practiceTarget([], now)).toBeUndefined();
    expect(practiceTarget([closed], now)).toBeUndefined();
  });
});

const c1 = (evidence: string, passed: boolean | null = false, sentences: number[] = [2]): Check => ({ id: "c1_consistent", passed, evidence, sentences, seconds: null });

describe("what the consistency check says in plain words", () => {
  it("reads where the earlier version was said and both versions", () => {
    const notes = consistencyNotes(c1('In the recruiter stage you said "four weeks". Here you said "two weeks".'));
    expect(notes).toEqual([{ earlier: "recruiter stage", fromResume: false, earlierSaid: "four weeks", nowSaid: "two weeks" }]);
    expect(consistencySentences(c1('In the recruiter stage you said "four weeks". Here you said "two weeks".'))).toEqual(['In the recruiter stage you said "four weeks". Here you said "two weeks".']);
  });

  it("reads a resume as the earlier version, and a stage with two words in its name", () => {
    const notes = consistencyNotes(c1('Your resume says "31% to 44%". Here you said "about 30 to 45%". In the hiring manager stage you said "five steps". Here you said "one step".'));
    expect(notes.map((n) => [n.fromResume, n.earlier, n.earlierSaid, n.nowSaid])).toEqual([
      [true, "resume", "31% to 44%", "about 30 to 45%"],
      [false, "hiring manager stage", "five steps", "one step"],
    ]);
    expect(consistencySentences(c1('Your resume says "31% to 44%". Here you said "about 30 to 45%".'))).toEqual(['Your resume says "31% to 44%". Here you said "about 30 to 45%".']);
  });

  it("says nothing for a check that passed or does not apply", () => {
    expect(consistencyNotes(c1("What you said matches what you said before.", true))).toEqual([]);
    expect(consistencySentences(c1("", null))).toEqual([]);
  });

  it("keeps a failed check whose words it cannot read, as the evidence it carries", () => {
    expect(consistencyNotes(c1("Something else changed."))).toEqual([]);
    expect(consistencySentences(c1("Something else changed."))).toEqual(["Something else changed."]);
    expect(consistencySentences(c1(""))).toEqual(["This sounded different from what you said before."]);
  });

  it("names a check it does not know in plain words", () => {
    expect(unknownCheckLabel("c2_tone_match")).toBe("Tone match");
    expect(unknownCheckLabel("future_check")).toBe("Future check");
    expect(unknownCheckLabel("x")).toBe("X");
  });
});

function rep(n: number, checks: Check[], over: Partial<FullRep> = {}): FullRep {
  return { session_id: "s", n, question_id: `q${n}`, question_text: "Q", question_type: "behavioral", behavioral_situation: null, commitment_check: false, builder_operator_check: false, is_major_story: true, founder_variant: false, attempt: 1, recorded_at: "2026-10-21T10:00:00Z", story_ids: [], follow_up: null, fix: null, note: null, rewrite: null, ai: null, feedback: null, transcript: [], metrics: { rubric_version: 1, outcome: "scored", words: [], sentences: [], word_count: 0, speaking_ms: 1, wpm: 1, window: { min_s: 1, max_s: 2 }, length: "fits", fillers: { count: 0, per_minute: 0, items: [] }, pauses: [], proof: { matched: [], landed_sentence: null, tail_ms: null }, unbanked: [], restart_at: null, checks }, ...over };
}

describe("the consistency flags of a Mock", () => {
  it("makes one flag per version that differs, from the answers that said it differently", () => {
    const flags = flagsOfReps([
      rep(1, [c1("What you said matches what you said before.", true)]),
      rep(2, [c1('In the recruiter stage you said "four weeks". Here you said "two weeks".')]),
      rep(3, [c1('Your resume says "5 steps". Here you said "3 steps". In the panel stage you said "one team". Here you said "two teams".')]),
    ]);
    expect(flags.map((f) => [f.id, f.badge, f.earlierStage, f.earlierSaid, f.nowSaid, f.keepLabel])).toEqual([
      ["r2-0", "Said differently", "recruiter", "four weeks", "two weeks", "Two weeks is right now"],
      ["r3-0", "Said differently", "resume", "5 steps", "3 steps", "3 steps is right now"],
      ["r3-1", "Said differently", "panel", "one team", "two teams", "Two teams is right now"],
    ]);
    expect(flags[0].keptNote).toBe("Marked as updated. Two weeks is your answer from here on.");
  });

  it("counts a follow-up and ignores answers without the check, and repeated versions once", () => {
    const same = c1('In the recruiter stage you said "four weeks". Here you said "two weeks".');
    expect(flagsOfReps([rep(1, []), rep(2, [same]), rep(3, [same], { attempt: 2 })])).toHaveLength(1);
  });
});

describe("what the Mock debrief is told about the application", () => {
  it("is its company, role, posting summary, priorities and must-say list", () => {
    const base = mockStore.applications[0];
    const a = { ...base, company: "Kestrel Pay", role: "Lifecycle lead", analysis: { ...base.analysis!, summary: "Early startup", priorities: [{ title: "Keep new customers", detail: "x" }, { title: "Do more with less", detail: "y" }] }, resume: { ...base.resume!, mustSay: [{ id: "ms-1", text: "Ran lifecycle alone", resume: "", said: "" }] } };
    expect(debriefContext(a)).toEqual({ company: "Kestrel Pay", role: "Lifecycle lead", jdSummary: "Early startup", priorities: "Keep new customers\nDo more with less", mustSay: [{ id: "ms-1", text: "Ran lifecycle alone" }] });
  });

  it("is empty where the application has no posting or no resume", () => {
    const a = { ...mockStore.applications[0], analysis: null, resume: null };
    expect(debriefContext(a)).toMatchObject({ jdSummary: "", priorities: "", mustSay: [] });
  });
});

describe("a stage's date as the backend keeps it", () => {
  it("reads a date and time, with or without seconds, as local time", () => {
    expect(stageWhen("2026-10-23T14:00")).toEqual({ date: new Date(2026, 9, 23, 14, 0), hasTime: true });
    expect(stageWhen("2026-10-23T14:30:15")?.date).toEqual(new Date(2026, 9, 23, 14, 30, 15));
  });

  it("reads a date with no time as that local day", () => {
    expect(stageWhen("2026-10-23")).toEqual({ date: new Date(2026, 9, 23), hasTime: false });
  });

  it("is nothing for no date or one it cannot read", () => {
    expect(stageWhen(undefined)).toBeNull();
    expect(stageWhen("")).toBeNull();
    expect(stageWhen("next Friday")).toBeNull();
  });
});

describe("the next dated interview", () => {
  const now = new Date("2026-10-22T09:00:00");
  it("keeps a stage with only a date upcoming through that day, and drops it after", () => {
    const a = app("a", [stage("s1", "recruiter", 1, { at: "2026-10-22" })]);
    expect(nextDated([a], now)?.stage.id).toBe("s1");
    expect(nextDated([a], new Date("2026-10-22T23:00:00"))?.stage.id).toBe("s1");
    expect(nextDated([a], new Date("2026-10-23T00:30:00"))).toBeUndefined();
  });

  it("drops a past time, a done stage and a closed application, and picks the earliest", () => {
    const past = app("p", [stage("p1", "recruiter", 1, { at: "2026-10-22T08:00" })]);
    const done = app("d", [stage("d1", "recruiter", 1, { at: "2026-10-22T12:00", done: true })]);
    const shut = app("c", [stage("c1", "recruiter", 1, { at: "2026-10-22T12:00" })], { status: "closed" });
    const a = app("a", [stage("a1", "recruiter", 1, { at: "2026-10-27T10:00" })]);
    const b = app("b", [stage("b1", "recruiter", 1, { at: "2026-10-24T10:00" })]);
    expect(nextDated([past, done, shut, a, b], now)?.application.id).toBe("b");
    expect(nextDated([past, done, shut], now)).toBeUndefined();
  });
});
