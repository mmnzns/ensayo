import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import { habits } from "../data/mock/habits";
import { StoreProvider } from "../data/store";
import type { PracticeAttempt } from "../data/screens/practice";
import { attemptFromOutcome } from "../practice/attempt";
import { drillView, summaryOfFull, type RepSummary } from "../practice/habits";
import type { CoachVerdict, FullRep, RepOutcome, SmartCoachReply } from "../practice/types";
import CoachFeedback, { MOVE_ON_LINE } from "../screens/practice/CoachFeedback";
import { registry } from "../screens/registry";
import { verdictPath } from "../screens/results/SessionResultsDrill";
import { BASIC_MODEL_LINE, coachLine, FULL_LINE, isFullCoach, LOCAL_LINE } from "../screens/settings/coachLevel";

const reply = (over: Partial<SmartCoachReply> = {}): SmartCoachReply => ({
  verdict: "nearly",
  verdict_line: "Close. One thing to tighten.",
  worked: [{ quote: "I cut churn from 24 to 18", why: "A real number." }],
  fix: { kind: "ownership", what: "Say what you decided.", why: "It was all we.", quote: "we picked it", do_instead: "Say I where you chose.", say_instead: "I chose the new trigger." },
  more: [{ kind: "fillers", what: "A few ums.", quote: "um" }],
  since_last: null,
  offer_follow_up: true,
  ...over,
});

const html = (coach: SmartCoachReply, startOpen = false) => renderToStaticMarkup(createElement(CoachFeedback, { coach, startOpen }));

describe("the coach's reply", () => {
  it("shows the verdict as a plain label, then its line", () => {
    for (const [v, label] of [["ready", "Ready"], ["nearly", "Nearly"], ["not_yet", "Not yet"]] as [CoachVerdict, string][]) {
      const out = html(reply({ verdict: v, verdict_line: `Line for ${v}` }));
      expect(out).toContain(`>${label}</span>`);
      expect(out).toContain(`Line for ${v}`);
    }
  });

  it("quotes the words that worked, with the why", () => {
    const out = html(reply());
    expect(out).toContain("What worked");
    expect(out).toContain("“I cut churn from 24 to 18”");
    expect(out).toContain("A real number.");
  });

  it("spells out the fix: what, why, where, next time", () => {
    const out = html(reply());
    expect(out).toContain("Work on this next");
    expect(out).toContain("Say what you decided.");
    expect(out).toContain("It was all we.");
    expect(out).toContain("Where: ");
    expect(out).toContain("“we picked it”");
    expect(out).toContain("Next time: ");
    expect(out).toContain("Say I where you chose.");
  });

  it("leaves Where out when the quote is empty", () => {
    const out = html(reply({ fix: { ...reply().fix!, quote: "" } }));
    expect(out).not.toContain("Where: ");
    expect(out).toContain("Next time: ");
  });

  it("says ready answers need no fix: move on", () => {
    const out = html(reply({ verdict: "ready", fix: null }));
    expect(out).toContain(MOVE_ON_LINE);
    expect(out).not.toContain("Work on this next");
  });

  it("shows how this try compares with the last", () => {
    const out = html(reply({ since_last: { direction: "better", fixed: ["The point comes first."], still: ["Still all we."] } }));
    expect(out).toContain("Since your last try");
    expect(out).toContain(">Better<");
    expect(out).toContain("The point comes first.");
    expect(out).toContain("Still all we.");
    expect(html(reply())).not.toContain("Since your last try");
  });

  it("folds More by default and opens it", () => {
    const closed = html(reply());
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).not.toContain("A few ums.");
    const open = html(reply(), true);
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain("A few ums.");
    expect(open).toContain("“um”");
  });

  it("shows no More when there is nothing more", () => {
    expect(html(reply({ more: [] }))).not.toContain("More ›");
  });

  it("shows at most three More items", () => {
    const more = ["a", "b", "c", "d"].map((x) => ({ kind: "k", what: `Item ${x}`, quote: "" }));
    const open = html(reply({ more }), true);
    expect(open).toContain("Item c");
    expect(open).not.toContain("Item d");
  });
});

function result(id: string, attempts: PracticeAttempt[]): string {
  const store = { ...mockStore, screens: { ...mockStore.screens, practice: { ...mockStore.screens.practice, attempts } } };
  return renderToStaticMarkup(createElement(StoreProvider, { store, children: createElement(registry[id]) }));
}
const sample = mockStore.screens.practice.attempts;
const bigButton = (out: string) => out.match(/e-btn e-btn-primary e-btn-big[^>]*>(?:<svg.*?<\/svg>)?([^<]*)</)?.[1];
const FIRST = "3-4-result-attempt-1-details-open";

describe("the result screen with the coach", () => {
  it("shows the not-yet sample: verdict, fix with Try saying, no since-last, no old note, no follow-up", () => {
    const out = result(FIRST, sample);
    expect(out).toContain(">Not yet</span>");
    expect(out).toContain("Work on this next");
    expect(out).toContain("Try saying");
    expect(out).not.toContain("Since your last try");
    expect(out).not.toContain("Coach&#x27;s note");
    expect(out).not.toContain("They have a follow-up");
    expect(bigButton(out)).toBe("Again");
  });

  it("shows the nearly sample with how it compares to the last try", () => {
    const out = result("3-5-result-attempt-2", sample);
    expect(out).toContain(">Nearly</span>");
    expect(out).toContain("Since your last try");
    expect(out).toContain(">Better<");
  });

  it("makes Next question the primary button on a ready answer, and moves on", () => {
    const out = result("3-8-result-everything-worked", sample);
    expect(out).toContain(">Ready</span>");
    expect(out).toContain(MOVE_ON_LINE);
    expect(bigButton(out)).toBe("Next question →");
    expect(out).toContain("They have a follow-up");
  });

  it("hides the follow-up on a ready answer when the coach does not offer one", () => {
    const ready = { ...sample[2], coach: { ...sample[2].coach!, offer_follow_up: false } };
    const out = result("3-8-result-everything-worked", [sample[0], sample[1], ready]);
    expect(out).not.toContain("They have a follow-up");
    expect(out).not.toContain("Take a follow-up");
    expect(bigButton(out)).toBe("Next question →");
  });

  it("keeps the transcript and the details card", () => {
    const out = result(FIRST, sample);
    expect(out).toContain("Your answer");
    expect(out).toContain("Pace and length");
  });

  it("shows an answer without a coach reply as before, with no basic line when no AI judged it", () => {
    const { coach: _c, ...old } = sample[0];
    const out = result(FIRST, [old as PracticeAttempt, sample[1], sample[2]]);
    expect(out).toContain("Coach&#x27;s note");
    expect(out).toContain(old.coachNote);
    expect(out).not.toContain("Basic feedback");
    expect(out).not.toContain("Work on this next");
  });

  it("adds the quiet basic line on an AI-judged answer without a coach reply", () => {
    const { coach: _c, ...old } = sample[0];
    const out = result(FIRST, [{ ...old, basicFeedback: true } as PracticeAttempt, sample[1], sample[2]]);
    expect(out).toContain("Basic feedback. The full coach needs a stronger model, set in Settings › AI.");
  });
});

describe("attemptFromOutcome and the coach", () => {
  const rep = (over: Partial<FullRep>) => {
    const m = {
      rubric_version: 1, outcome: "scored", words: [], sentences: [], word_count: 0, speaking_ms: 30_000, wpm: 100, window: { min_s: 45, max_s: 60 }, length: "short",
      fillers: { count: 0, per_minute: 0, items: [] }, pauses: [], proof: { matched: [], landed_sentence: null, tail_ms: null }, unbanked: [], restart_at: null, checks: [],
    } as unknown as FullRep["metrics"];
    return { session_id: "s", n: 1, question_id: "q", question_text: "Q", question_type: "behavioral", behavioral_situation: null, commitment_check: false, builder_operator_check: false, is_major_story: false, founder_variant: false, attempt: 1, recorded_at: "2026-10-21T10:00:00Z", story_ids: [], follow_up: null, fix: null, note: null, rewrite: null, ai: null, feedback: null, transcript: [], metrics: m, ...over } as FullRep;
  };
  const out = (r: FullRep): RepOutcome => ({ outcome: "scored", session_id: "s", rep: r, delta: null, restart_offered: false, audio_kept: true, notice: null, transcript_text: null });
  const ai = { prompts: [], rubric_version: 1, cost_usd: 0, model: "x" };

  it("carries the coach reply and the say-instead line", () => {
    const a = attemptFromOutcome(out(rep({ coach: reply(), fix: "ownership", note: "Say what you decided.", rewrite: { text: "I chose the new trigger." } as FullRep["rewrite"], ai })));
    expect(a.coach?.verdict).toBe("nearly");
    expect(a.trySaying).toBe("I chose the new trigger.");
    expect(a.basicFeedback).toBeUndefined();
  });

  it("marks an AI-judged answer without a coach reply as basic", () => {
    expect(attemptFromOutcome(out(rep({ ai, note: "n", fix: "proof" }))).basicFeedback).toBe(true);
    expect(attemptFromOutcome(out(rep({ ai, note: "n", fix: "proof", coach: null }))).basicFeedback).toBe(true);
  });

  it("marks nothing on an answer no model judged", () => {
    const a = attemptFromOutcome(out(rep({})));
    expect(a.basicFeedback).toBeUndefined();
    expect(a.coach).toBeUndefined();
  });

  it("puts the verdict on the history summary", () => {
    const session = { mode: "drill", stage: "recruiter", application_id: null, started: "2026-10-21T10:00:00Z" };
    expect(summaryOfFull(rep({ coach: reply({ verdict: "ready" }) }), session).verdict).toBe("ready");
    expect(summaryOfFull(rep({}), session).verdict).toBeNull();
  });
});

describe("session results", () => {
  const sum = (attempt: number, verdict: string | null, qid = "q1"): RepSummary => ({
    session_id: "s", mode: "drill", stage: "recruiter", application_id: null, started: "2026-10-21T10:00:00Z", n: attempt, question_id: qid, question_text: "Q", question_type: "behavioral",
    attempt, follow_up: false, recorded_at: `2026-10-21T10:0${attempt}:00Z`, rubric_version: 1, fix: null, note: null, note_was_wrong: false,
    checks: [{ id: "proof", passed: true, evidence: "", sentences: [], seconds: null }], speaking_ms: 30_000, fillers: 0, tail_ms: null, ai_cost_usd: null, ...(verdict ? { verdict } : {}),
  });

  it("lists the verdicts of each question's tries in order", () => {
    const reps = [sum(3, "ready"), sum(1, "not_yet"), sum(2, "nearly")];
    const v = drillView(habits, reps, reps, ["numbers"])!;
    expect(v.questions[0].verdicts).toEqual(["not_yet", "nearly", "ready"]);
    expect(verdictPath(v.questions[0].verdicts!)).toBe("Not yet → Nearly → Ready");
  });

  it("has no verdicts for tries without a coach reply", () => {
    const reps = [sum(1, null), sum(2, null)];
    expect(drillView(habits, reps, reps, ["numbers"])!.questions[0].verdicts).toBeUndefined();
  });
});

describe("Settings: which models run the full coach", () => {
  const provider = { coach_models: ["strong-1"] };

  it("knows a full-coach model from the rest, and from a missing list", () => {
    expect(isFullCoach(provider, "strong-1")).toBe(true);
    expect(isFullCoach(provider, "small-1")).toBe(false);
    expect(isFullCoach({}, "strong-1")).toBe(false);
    expect(isFullCoach(undefined, "strong-1")).toBe(false);
    expect(isFullCoach(provider, "")).toBe(false);
  });

  it("says one line for the picked model", () => {
    expect(coachLine("key", provider, "strong-1")).toBe(FULL_LINE);
    expect(coachLine("key", provider, "small-1")).toBe(BASIC_MODEL_LINE);
    expect(coachLine("key", {}, "small-1")).toBe(BASIC_MODEL_LINE);
  });

  it("says you get basic feedback on this computer, and nothing for timing only", () => {
    expect(coachLine("local", provider, "strong-1")).toBe(LOCAL_LINE);
    expect(coachLine("timing", provider, "strong-1")).toBeNull();
  });

  it("uses the exact words", () => {
    expect(FULL_LINE).toBe("This model runs the full coach.");
    expect(BASIC_MODEL_LINE).toBe("Basic feedback with this model. Pick one marked Full coach for the full coach.");
    expect(LOCAL_LINE).toBe("On this computer you get basic feedback. The full coach needs your own key with a model marked Full coach.");
  });
});
