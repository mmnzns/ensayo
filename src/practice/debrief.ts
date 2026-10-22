// What the Mock debrief shows (Build Plan, "Session results": Mock results read like a debrief): per question the note and
// the line to say instead, then how it went overall, then the notes on the candidate's own questions. Pure; the notes
// themselves were written by the model after each answer and are only arranged here.

import type { MockDebriefData, DebriefRow } from "../data/screens/results";
import type { Habit } from "../data/types";
import type { SessionDetail } from "./api";
import { drillView, STAGE_LABELS, summaryOfFull } from "./habits";
import type { FullRep } from "./types";

/** Prompt 10's result, as the backend returns it. */
export interface QuestionQuality {
  questions: { q: number; asked: boolean; result: "pass" | "fail"; early_logistics: boolean; quote: string; reason: string }[];
  weakest: number;
  try_asking: string;
  note: string;
  must_say_said: { id: string; said: boolean; where: string | null; quote: string | null }[];
}

export interface MustSayItem {
  id: string;
  text: string;
}

const OWN = "candidate_questions";
const text = (r: FullRep) => r.metrics.sentences.map((s) => s.text).join(" ");
const passed = (r: FullRep, id: string) => r.metrics.checks.find((c) => c.id === id)?.passed === true;
const applies = (r: FullRep, id: string) => r.metrics.checks.find((c) => c.id === id)?.passed != null;

/** The line under a question: the coach's note when there is one, else the plainest thing the measuring found. */
function noteFor(r: FullRep): string {
  if (r.note) return r.note;
  const miss = r.metrics.checks.find((c) => c.passed === false);
  return miss?.evidence || "Nothing needed fixing here.";
}

export interface LiveDebrief {
  data: MockDebriefData;
  /** The candidate reached their own questions, so question quality can be judged. */
  askedOwn: boolean;
}

export function debriefOfSession(habits: Habit[], detail: SessionDetail, quality: QuestionQuality | null, mustSay: MustSayItem[]): LiveDebrief | null {
  const reps = [...detail.reps].sort((a, b) => a.n - b.n);
  const main = reps.filter((r) => r.question_type !== OWN && !r.follow_up);
  const follow = reps.filter((r) => r.question_type !== OWN && r.follow_up);
  const own = [...reps].reverse().find((r) => r.question_type === OWN);
  if (main.length === 0 && !own) return null;

  const stage = STAGE_LABELS[detail.session.stage] ?? detail.session.stage;
  const lastAt = Math.max(...reps.map((r) => new Date(r.recorded_at).getTime()));
  const minutes = Math.max(1, Math.round((lastAt - new Date(detail.session.started).getTime()) / 60_000));
  const openers = main.filter((r) => applies(r, "answer_first"));
  const proofs = main.filter((r) => applies(r, "proof"));
  const heldOf = follow.filter((r) => r.metrics.checks.some((c) => c.passed != null));
  const held = heldOf.filter((r) => !r.metrics.checks.some((c) => c.passed === false));
  const average = main.length ? Math.round(main.reduce((s, r) => s + r.metrics.speaking_ms, 0) / main.length / 1000) : 0;

  const rows: DebriefRow[] = [];
  main.forEach((r, i) => {
    const label = String(i + 1);
    rows.push({ id: `r${r.n}`, kind: "question", label, prompt: r.question_text, note: noteFor(r), ...(r.rewrite ? { trySaying: r.rewrite.text, rehearse: true } : {}), listen: text(r) });
    follow.filter((f) => f.follow_up?.parent_n === r.n).forEach((f, j) => {
      rows.push({ id: `r${f.n}`, kind: "followup", label: `${label}${String.fromCharCode(97 + j)}`, prompt: f.question_text, note: noteFor(f), listen: text(f) });
    });
  });
  if (own) {
    const note = quality ? quality.note : "Notes on your questions need a feedback engine.";
    rows.push({ id: `r${own.n}`, kind: "yours", label: "Q", prompt: "Your questions for them", note, ...(quality?.try_asking ? { trySaying: quality.try_asking } : {}), listen: text(own) });
  } else if (main.length > 0) {
    rows.push({ id: "own-missing", kind: "yours", label: "Q", prompt: "Your questions for them", note: "The mock ended before you asked yours. Ask one or two next time: it is the last thing they hear.", listen: "" });
  }

  const view = drillView(habits, main.map((r) => summaryOfFull(r, detail.session)), [], []);
  const weakest = main.find((r) => r.fix) ?? main[0];
  const summary = weakest?.fix && weakest.note ? weakest.note : main.length ? "Every answer held up on what Ensayo can measure." : "";

  const data: MockDebriefData = {
    applicationId: detail.session.application_id ?? "",
    stageLabel: stage,
    durationMinutes: minutes,
    openedWithPoint: { count: openers.filter((r) => passed(r, "answer_first")).length, of: openers.length },
    summary,
    followUps: { held: held.length, of: heldOf.length },
    averageAnswerSeconds: average,
    numbers: { said: proofs.filter((r) => passed(r, "proof")).length, of: proofs.length },
    flags: [],
    consistencyChecked: false,
    mustSay: mustSay.map((m) => ({ id: m.id, text: m.text, said: quality?.must_say_said.find((f) => f.id === m.id)?.said ?? false })),
    rows,
    nextTime: view ? view.nextTime.advice : "Answer a few more questions and this will say what to carry.",
  };
  return { data, askedOwn: own !== undefined };
}
