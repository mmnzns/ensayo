import { describe, expect, it } from "vitest";
import { attemptFromOutcome } from "../practice/attempt";
import type { Check, Delta, FullRep, Metrics, RepOutcome, Sentence, Word } from "../practice/types";

const w = (text: string, i: number): Word => ({ text, start_ms: i * 500, end_ms: i * 500 + 400 });

function metrics(over: Partial<Metrics> = {}, checks: Check[] = []): Metrics {
  const words = ["We", "cut", "churn", "from", "24%", "to", "18%.", "Then", "um", "it", "took", "a", "while."].map(w);
  const sentences: Sentence[] = [
    { index: 1, text: "We cut churn from 24% to 18%.", start_ms: 0, end_ms: 3_400, first_word: 0, word_count: 7 },
    { index: 2, text: "Then um it took a while.", start_ms: 3_500, end_ms: 6_400, first_word: 7, word_count: 6 },
  ];
  return {
    rubric_version: 1,
    outcome: "scored",
    words,
    sentences,
    word_count: 13,
    speaking_ms: 62_000,
    wpm: 12.6,
    window: { min_s: 45, max_s: 60 },
    length: "long",
    fillers: { count: 1, per_minute: 1, items: [{ text: "um", start_ms: 4_000, word: 8 }] },
    pauses: [{ at_ms: 3_400, length_ms: 1_500, after_word: 6 }],
    proof: { matched: [{ value: 24, percent: true, raw: "24%", token: 4 }, { value: 18, percent: true, raw: "18%", token: 6 }], landed_sentence: 1, tail_ms: 40_000 },
    unbanked: [],
    restart_at: null,
    checks,
    ...over,
  };
}

const check = (id: string, passed: boolean | null, evidence = ""): Check => ({ id, passed, evidence });

function outcome(fix: string | null, checks: Check[], over: Partial<Metrics> = {}, delta: Delta | null = null, attempt = 1): RepOutcome {
  const m = metrics(over, checks);
  const rep: FullRep = {
    session_id: "ses_a",
    n: attempt,
    question_id: "gen-001",
    question_text: "Q",
    question_type: "behavioral",
    attempt,
    recorded_at: "2026-10-21T10:00:00Z",
    story_ids: [],
    fix,
    feedback: null,
    transcript: m.words,
    metrics: m,
  };
  return { outcome: "scored", session_id: "ses_a", rep, delta, restart_offered: false, audio_kept: true };
}

describe("a rep as the result screen shows it", () => {
  it("turns the clean-stop fix into one plain sentence and highlights where the number landed", () => {
    const a = attemptFromOutcome(outcome("clean_stop", [check("proof", true), check("clean_stop", false), check("length", false), check("fillers", true)]));
    expect(a.number).toBe(1);
    expect(a.coachNote).toBe("You kept going for 40 seconds after 18%. Stop once the result lands.");
    expect(a.trySaying).toBeUndefined();
    expect(a.durationSeconds).toBe(62);
    expect(a.transcript.map((l) => l.tone)).toEqual(["highlight", "normal"]);
    expect(a.highlightCaption).toContain("0:03");
    expect(a.wins).toBeUndefined();
  });

  it("explains a missing number, and flags a number that is not in the stories", () => {
    const none = attemptFromOutcome(outcome("proof", [check("proof", false, "No number or result from your stories came up.")], { proof: { matched: [], landed_sentence: null, tail_ms: null } }));
    expect(none.coachNote).toBe("No number from your stories came up. Say the result with its number.");
    const odd = attemptFromOutcome(
      outcome("proof", [check("proof", false)], { proof: { matched: [], landed_sentence: null, tail_ms: null }, unbanked: [{ value: 40, percent: true, raw: "40%", token: 3 }] }),
    );
    expect(odd.coachNote).toBe("You said 40%, but it is not in your stories. Check it, or say the number you wrote down.");
  });

  it("names the window for a long answer and counts the fillers for a filler fix", () => {
    const long = attemptFromOutcome(outcome("length", [check("length", false)]));
    expect(long.coachNote).toBe("That ran 1:02. This stage wants 45 to 60 seconds. Cut the setup.");
    const fill = attemptFromOutcome(outcome("fillers", [check("fillers", false)], { fillers: { count: 9, per_minute: 7.5, items: [{ text: "um", start_ms: 4_000, word: 8 }] } }));
    expect(fill.coachNote).toBe("9 filler words, about 7.5 a minute. Pause instead of filling.");
    // The fillers are circled in the transcript.
    const second = fill.transcript[1].text;
    expect(Array.isArray(second) && second.some((s) => s.circle && s.text.includes("um"))).toBe(true);
  });

  it("says so when the measured parts are clean and lists what went well", () => {
    const a = attemptFromOutcome(outcome(null, [check("proof", true), check("clean_stop", true), check("length", true), check("fillers", true)], { length: "fits", speaking_ms: 55_000, proof: { matched: [{ value: 24, percent: true, raw: "24%", token: 4 }], landed_sentence: 1, tail_ms: 4_000 } }));
    expect(a.coachNote).toBe("The parts that can be measured are clean: the number, the stop, the length and the fillers.");
    expect(a.wins).toEqual(["Said 24%", "Stopped right after it", "0:55 long", "1 filler word"]);
    expect(a.trySaying).toBeUndefined();
  });

  it("carries the change since the last attempt", () => {
    const secs: Delta = { check: "length", label: "Length of the answer", from_seconds: 90, to_seconds: 60, from_count: null, to_count: null, improved: true };
    const a = attemptFromOutcome(outcome("fillers", [check("fillers", false)], {}, secs, 2));
    expect(a.number).toBe(2);
    expect(a.delta).toEqual({ label: "Length of the answer", fromSeconds: 90, toSeconds: 60 });
    const count: Delta = { check: "fillers", label: "Filler words", from_seconds: null, to_seconds: null, from_count: 7, to_count: 2, improved: true };
    expect(attemptFromOutcome(outcome("fillers", [check("fillers", false)], {}, count, 2)).delta).toEqual({ label: "Filler words", caption: "7 → 2" });
    const said: Delta = { check: "proof", label: "Said the number this time", from_seconds: null, to_seconds: null, from_count: null, to_count: null, improved: true };
    expect(attemptFromOutcome(outcome("fillers", [check("fillers", false)], {}, said, 2)).delta).toEqual({ label: "Said the number this time" });
  });

  it("builds the details rows from what was measured and leaves out checks that do not apply", () => {
    const a = attemptFromOutcome(outcome("clean_stop", [check("proof", true), check("clean_stop", false), check("length", true), check("fillers", true)], { length: "fits" }));
    const labels = a.details.rows.map((r) => r.label);
    expect(labels).toEqual(["Said your number", "Stopped once the number landed", "Length", "Filler words", "Pace", "Pauses"]);
    expect(a.details.rows.find((r) => r.label === "Pace")).toMatchObject({ state: "info", note: "12.6 words a minute · 1:02" });
    expect(a.details.rows.find((r) => r.label === "Pauses")!.note).toContain("never counted against you");
    const nostop = attemptFromOutcome(outcome("proof", [check("proof", false), check("clean_stop", null)], { pauses: [] }));
    expect(nostop.details.rows.map((r) => r.label)).not.toContain("Stopped once the number landed");
    expect(nostop.details.rows.map((r) => r.label)).not.toContain("Pauses");
  });
});
