// A stand-in for the Rust rep commands, used only by the dev preview (`?live=fake`) so the live practice screens can
// be looked at in a browser without a microphone. Not used in the app.

import type { RepApi } from "./api";
import type { FullRep, Metrics, RepOutcome, Word } from "./types";

const TEXT = [
  "So, um, at Fernhill I was on the lifecycle team and we owned onboarding.",
  "Activation was flat for a long time, you know, and everyone blamed the emails.",
  "We looked at the funnel and people stalled on bank linking.",
  "Then we changed the trigger and activation went from 31% to 44%.",
  "It took a while and we learned a lot along the way.",
];

function words(): Word[] {
  const out: Word[] = [];
  let t = 800;
  for (const sentence of TEXT) {
    for (const w of sentence.split(" ")) {
      out.push({ text: w, start_ms: t, end_ms: t + 380 });
      t += 460;
    }
    t += 500;
  }
  return out;
}

function metrics(attempt: number): Metrics {
  const w = words();
  let first = 0;
  const sentences = TEXT.map((text, i) => {
    const count = text.split(" ").length;
    const s = { index: i + 1, text, start_ms: w[first].start_ms, end_ms: w[first + count - 1].end_ms, first_word: first, word_count: count };
    first += count;
    return s;
  });
  const fillers = attempt === 1 ? [{ text: "um", start_ms: w[3].start_ms, word: 3 }, { text: "you know", start_ms: w[19].start_ms, word: 19 }] : [];
  const tail = attempt === 1 ? 31_000 : attempt === 2 ? 12_000 : 4_000;
  return {
    rubric_version: 1,
    outcome: "scored",
    words: w,
    sentences,
    word_count: w.length,
    speaking_ms: attempt === 1 ? 74_000 : attempt === 2 ? 58_000 : 52_000,
    wpm: 118.4,
    window: { min_s: 60, max_s: 90 },
    length: "fits",
    fillers: { count: fillers.length, per_minute: attempt === 1 ? 1.6 : 0, items: fillers },
    pauses: [{ at_ms: 9_000, length_ms: 1_400, after_word: 12 }],
    proof: { matched: [{ value: 31, percent: true, raw: "31%", token: 11 }, { value: 44, percent: true, raw: "44%", token: 13 }], landed_sentence: 4, tail_ms: tail },
    unbanked: [],
    restart_at: null,
    checks: [
      { id: "proof", passed: true, evidence: "You said 31%, 44%." },
      { id: "clean_stop", passed: tail < 15_000, evidence: "" },
      { id: "length", passed: true, evidence: "" },
      { id: "fillers", passed: true, evidence: "" },
    ],
  };
}

export function fakeApi(): RepApi {
  let attempt = 0;
  return {
    startRecording: async () => undefined,
    stopRecording: async () => ({ path: "/fake/rec.wav", duration_ms: 70_000 }),
    level: async () => ({ level: 0.2 + Math.random() * 0.3, elapsed_ms: 0 }),
    finishRep: async (args): Promise<RepOutcome> => {
      attempt = args.attempt;
      const m = metrics(attempt);
      const fix = m.checks.find((c) => c.passed === false)?.id ?? null;
      const rep: FullRep = {
        session_id: "ses_fake",
        n: attempt,
        question_id: args.question_id,
        question_text: args.question_text,
        question_type: args.question_type,
        attempt,
        recorded_at: new Date().toISOString(),
        story_ids: args.story_ids,
        fix,
        feedback: null,
        transcript: m.words,
        metrics: m,
      };
      const delta = attempt > 1 ? { check: "clean_stop", label: "Time after the number", from_seconds: attempt === 2 ? 31 : 12, to_seconds: attempt === 2 ? 12 : 4, from_count: null, to_count: null, improved: true } : null;
      await new Promise((r) => setTimeout(r, 900));
      return { outcome: "scored", session_id: "ses_fake", rep, delta, restart_offered: false, audio_kept: false };
    },
    rescoreRep: async () => {
      throw new Error("Not in the preview");
    },
    deleteRep: async () => undefined,
    labelRep: async () => undefined,
    discardRecording: async () => undefined,
    audioAvailable: async () => false,
    readAudio: async () => new ArrayBuffer(0),
  };
}
