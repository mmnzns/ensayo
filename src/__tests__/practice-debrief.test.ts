import { describe, expect, it } from "vitest";
import { habits } from "../data/mock/habits";
import type { SessionDetail } from "../practice/api";
import { debriefOfSession, type QuestionQuality } from "../practice/debrief";
import type { FullRep } from "../practice/types";

function rep(n: number, over: Partial<FullRep> & { checks?: FullRep["metrics"]["checks"]; text?: string; speaking_ms?: number } = {}): FullRep {
  const text = over.text ?? "I decided to rebuild onboarding.";
  return {
    session_id: "s",
    n,
    question_id: `q${n}`,
    question_text: `Question ${n}`,
    question_type: "behavioral",
    behavioral_situation: null,
    commitment_check: false,
    builder_operator_check: false,
    is_major_story: true,
    founder_variant: false,
    attempt: 1,
    recorded_at: `2026-10-22T10:0${n}:00Z`,
    story_ids: [],
    follow_up: null,
    fix: null,
    note: null,
    rewrite: null,
    ai: null,
    feedback: null,
    transcript: [],
    metrics: {
      rubric_version: 1,
      outcome: "scored",
      words: [],
      sentences: [{ index: 1, text, start_ms: 0, end_ms: 2000, first_word: 0, word_count: 5 }],
      word_count: 5,
      speaking_ms: over.speaking_ms ?? 60_000,
      wpm: 120,
      window: { min_s: 60, max_s: 90 },
      length: "fits",
      fillers: { count: 0, per_minute: 0, items: [] },
      pauses: [],
      proof: { matched: [], landed_sentence: null, tail_ms: null },
      unbanked: [],
      restart_at: null,
      checks: over.checks ?? [{ id: "answer_first", passed: true, evidence: "", sentences: [1], seconds: null }],
    },
    ...over,
  } as FullRep;
}

const detail = (reps: FullRep[]): SessionDetail => ({ session: { id: "s", mode: "mock", stage: "hiring_manager", application_id: null, started: "2026-10-22T10:00:00Z" }, reps });
const chk = (id: string, passed: boolean | null) => ({ id, passed, evidence: id === "proof" ? "No number came up." : "", sentences: [], seconds: null });

describe("the Mock debrief", () => {
  it("counts what held, in order, with follow-ups under their question and the own questions last", () => {
    const reps = [
      rep(1, { checks: [chk("answer_first", true), chk("proof", true)], speaking_ms: 50_000 }),
      rep(2, { checks: [chk("answer_first", false), chk("proof", false)], fix: "answer_first", note: "Open with the decision.", rewrite: { text: "I decided to rebuild it.", position: "open", replaces_sentence: null }, speaking_ms: 70_000 }),
      rep(3, { question_text: "What was your part?", follow_up: { parent_n: 2, kind: "ownership_probe", question: "What was your part?", number: 1 }, checks: [chk("f1_answer_push", true)] }),
      rep(4, { question_text: "What would you like to ask?", question_type: "candidate_questions", text: "How will you judge this hire?", checks: [] }),
    ];
    const quality: QuestionQuality = { questions: [], weakest: 1, try_asking: "At this stage I'd guess churn matters; how will you judge it?", note: "Open with your guess, then ask.", must_say_said: [] };
    const out = debriefOfSession(habits, detail(reps), quality, [])!;
    const d = out.data;
    expect(d.openedWithPoint).toEqual({ count: 1, of: 2 });
    expect(d.numbers).toEqual({ said: 1, of: 2 });
    expect(d.followUps).toEqual({ held: 1, of: 1 });
    expect(d.averageAnswerSeconds).toBe(60);
    expect(d.rows.map((r) => `${r.label}:${r.kind}`)).toEqual(["1:question", "2:question", "2a:followup", "Q:yours"]);
    expect(d.rows[1]).toMatchObject({ note: "Open with the decision.", trySaying: "I decided to rebuild it.", rehearse: true });
    expect(d.rows[3]).toMatchObject({ note: "Open with your guess, then ask.", trySaying: quality.try_asking });
    expect(out.askedOwn).toBe(true);
    expect(d.summary).toBe("Open with the decision.");
  });

  it("says plainly when the mock ended before the candidate's own questions, and when no engine judged them", () => {
    const early = debriefOfSession(habits, detail([rep(1)]), null, [])!;
    expect(early.askedOwn).toBe(false);
    expect(early.data.rows[early.data.rows.length - 1].note).toContain("ended before you asked yours");
    const noEngine = debriefOfSession(habits, detail([rep(1), rep(2, { question_type: "candidate_questions", checks: [] })]), null, [])!;
    expect(noEngine.data.rows[noEngine.data.rows.length - 1].note).toContain("feedback engine");
  });

  it("has nothing to show for a mock with no answers", () => {
    expect(debriefOfSession(habits, detail([]), null, [])).toBeNull();
  });

  it("marks which resume points were said out loud", () => {
    const quality: QuestionQuality = { questions: [], weakest: 1, try_asking: "", note: "", must_say_said: [{ id: "ms-1", said: true, where: "[A 1.1]", quote: "ran it alone" }] };
    const out = debriefOfSession(habits, detail([rep(1)]), quality, [{ id: "ms-1", text: "No ops team" }, { id: "ms-2", text: "Weekly reporting" }])!;
    expect(out.data.mustSay).toEqual([{ id: "ms-1", text: "No ops team", said: true }, { id: "ms-2", text: "Weekly reporting", said: false }]);
  });
});
