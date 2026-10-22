import { describe, expect, it } from "vitest";
import { habits } from "../data/mock/habits";
import { claimToUpdate } from "../practice/applied";
import type { SessionDetail } from "../practice/api";
import { debriefOfSession, type QuestionQuality } from "../practice/debrief";
import type { Check, FullRep } from "../practice/types";
import { mockStore } from "../data/mock";
import type { Application, Claim } from "../data/types";

const sentence = { index: 1, text: "Two weeks.", start_ms: 0, end_ms: 2000, first_word: 0, word_count: 2 };
function rep(n: number, checks: Check[], over: Partial<FullRep> = {}): FullRep {
  return { session_id: "s", n, question_id: `q${n}`, question_text: `Question ${n}`, question_type: "behavioral", behavioral_situation: null, commitment_check: false, builder_operator_check: false, is_major_story: true, founder_variant: false, attempt: 1, recorded_at: `2026-10-22T10:0${n}:00Z`, story_ids: [], follow_up: null, fix: null, note: null, rewrite: null, ai: null, feedback: null, transcript: [], metrics: { rubric_version: 1, outcome: "scored", words: [], sentences: [sentence], word_count: 2, speaking_ms: 50_000, wpm: 120, window: { min_s: 45, max_s: 60 }, length: "fits", fillers: { count: 0, per_minute: 0, items: [] }, pauses: [], proof: { matched: [], landed_sentence: null, tail_ms: null }, unbanked: [], restart_at: null, checks }, ...over };
}
const c1 = (passed: boolean, evidence: string): Check => ({ id: "c1_consistent", passed, evidence, sentences: [1], seconds: null });
const detail = (reps: FullRep[], application_id: string | null): SessionDetail => ({ session: { id: "s", mode: "mock", stage: "leadership", application_id, started: "2026-10-22T10:00:00Z" }, reps });
const quality = (said: string[]): QuestionQuality => ({ questions: [], weakest: 1, try_asking: "", note: "", must_say_said: ["ms-1", "ms-2"].map((id) => ({ id, said: said.includes(id), where: null, quote: null })) });

describe("the Mock debrief inside an application", () => {
  const flagged = [rep(1, [c1(true, "What you said matches what you said before.")]), rep(2, [c1(false, 'In the recruiter stage you said "four weeks". Here you said "two weeks".')], { fix: "c1_consistent" })];

  it("lists what was said differently and says the answers were compared", () => {
    const { data } = debriefOfSession(habits, detail(flagged, "app_1"), null, [])!;
    expect(data.consistencyChecked).toBe(true);
    expect(data.flags).toHaveLength(1);
    expect(data.flags[0]).toMatchObject({ badge: "Said differently", earlierStage: "recruiter", earlierSaid: "four weeks", nowSaid: "two weeks", keepLabel: "Two weeks is right now" });
  });

  it("says all matched when every answer matched", () => {
    const { data } = debriefOfSession(habits, detail([rep(1, [c1(true, "ok")])], "app_1"), null, [])!;
    expect(data.consistencyChecked).toBe(true);
    expect(data.flags).toEqual([]);
  });

  it("fills the must-say list from what the model heard", () => {
    const { data } = debriefOfSession(habits, detail([rep(1, [])], "app_1"), quality(["ms-2"]), [{ id: "ms-1", text: "No ops team" }, { id: "ms-2", text: "Activation 31% to 44%" }])!;
    expect(data.mustSay).toEqual([{ id: "ms-1", text: "No ops team", said: false }, { id: "ms-2", text: "Activation 31% to 44%", said: true }]);
  });

  it("outside an application nothing was compared, so it does not claim a match", () => {
    const { data } = debriefOfSession(habits, detail(flagged, null), null, [])!;
    expect(data.consistencyChecked).toBe(false);
    expect(data.flags).toEqual([]);
  });
});

describe("the claim a flag keeps", () => {
  const claim = (id: string, value: string, stage: string, over: Partial<Claim> = {}): Claim => ({ id, type: "notice", subject: "Notice period", value, quote: value, stage, stage_label: stage, status: "consistent", ...over });
  const app = (claims: Claim[], resumeClaims: Claim[] = []): Application => ({ ...mockStore.applications[0], claims, resume: { ...mockStore.applications[0].resume!, claims: resumeClaims } });
  const flag = { earlierSaid: "four weeks", nowSaid: "two weeks" };

  it("is the earlier version, found by what was said", () => {
    const a = app([claim("c_a", "Four weeks", "stg_1"), claim("c_b", "Two weeks", "stg_4")]);
    expect(claimToUpdate(a, flag)).toBe("c_a");
  });

  it("is a resume line when that is what was said earlier", () => {
    const a = app([], [claim("r_1", "four weeks", "resume")]);
    expect(claimToUpdate(a, flag)).toBe("r_1");
  });

  it("is the new version when the earlier one is not in the log", () => {
    expect(claimToUpdate(app([claim("c_b", "two weeks", "stg_4")]), flag)).toBe("c_b");
  });

  it("is nothing when neither is there", () => {
    expect(claimToUpdate(app([claim("c_x", "six weeks", "stg_1")]), flag)).toBeUndefined();
    expect(claimToUpdate(undefined, flag)).toBeUndefined();
  });
});
