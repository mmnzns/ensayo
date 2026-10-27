// A measured rep as the Result screen shows it. Plain words, written for the user: no "score", "fail" or criterion
// names. Until the AI check arrives (M4) the note comes from the rules only: the number, the stop, the length and the
// filler words, and there is no "try saying" line (it needs the transcript and the stories read by a model).

import { clock, type DetailRow, type PracticeAttempt, type TranscriptLine, type TranscriptSegment } from "../data/screens/practice";
import { consistencySentences, unknownCheckLabel } from "./applied";
import type { Check, Delta, FullRep, Metrics, RepOutcome } from "./types";

const checkOf = (m: Metrics, id: string): Check | undefined => m.checks.find((c) => c.id === id);
const seconds = (ms: number) => Math.round(ms / 1000);

function lastMatched(m: Metrics): string {
  const said = m.proof.matched;
  return said.length > 0 ? said[said.length - 1].raw : "the number";
}

/** The note: the coach's own words when a model judged the answer, else the timing-only sentence for the fix. */
function coachNote(rep: FullRep): string {
  return rep.note?.trim() || rulesNote(rep);
}

/** The one sentence the note says, for the check code picked as the fix. */
function rulesNote(rep: FullRep): string {
  const m = rep.metrics;
  switch (rep.fix) {
    case "proof":
      return m.unbanked.length > 0
        ? `You said ${m.unbanked.map((n) => n.raw).join(", ")}, but it is not in your stories. Check it, or say the number you wrote down.`
        : "No number from your stories came up. Say the result with its number.";
    case "clean_stop":
      return `You kept going for ${seconds(m.proof.tail_ms ?? 0)} seconds after ${lastMatched(m)}. Stop once the result lands.`;
    case "length":
      return `That ran ${clock(seconds(m.speaking_ms))}. This stage wants ${m.window.min_s} to ${m.window.max_s} seconds. Cut the setup.`;
    case "fillers":
      return `${m.fillers.count} filler words, about ${m.fillers.per_minute} a minute. Pause instead of filling.`;
    case "c1_consistent":
      return consistencySentences(checkOf(m, "c1_consistent")).join(" ");
    case "f4_short":
      return `A follow-up answer should take under half the time of the first. This one ran ${clock(seconds(m.speaking_ms))}.`;
    case undefined:
    case null:
    default:
      return rep.ai
        ? "Nothing to fix on this one: every check that applied came out clean."
        : "The timing checks are clean: the number, the stop, the length and the fillers.";
  }
}

/** For a timing-only rep, the main card says what was not judged and why, so a clean note is not read as a clean answer. */
function notJudgedLine(rep: FullRep, notice: string | null): string | undefined {
  if (rep.ai) return undefined;
  const parts = rep.follow_up ? "whether you answered the push first, added something new and held your position" : "whether you answered first, said what you decided and picked a story that fits";
  const why = notice?.trim() || "No AI engine is set up, so only the timing checks ran. Add one in Settings, under AI.";
  return `Not judged this time: ${parts}. ${why}`;
}

function wins(rep: FullRep): string[] {
  const m = rep.metrics;
  const passed = (id: string) => checkOf(m, id)?.passed === true;
  const out: string[] = [];
  if (rep.follow_up) {
    if (passed("f1_answer_push")) out.push("Answered it first");
    if (passed("f2_new_specific")) out.push("Added something new");
    if (passed("f3_consistent")) out.push("Matched your first answer");
    if (passed("f4_short")) out.push("Kept it short");
    if (passed("f5_held_position")) out.push("Held your position");
    return out.slice(0, 4);
  }
  const point = checkOf(m, "time_to_point");
  if (point?.passed === true && point.seconds !== null) out.push(`Point at ${clock(point.seconds)}`);
  if (m.proof.matched.length > 0) out.push(`Said ${m.proof.matched[0].raw}`);
  if (passed("ownership")) out.push("Said what you decided");
  if (passed("method_first")) out.push("Opened with how you work");
  if (passed("clean_stop")) out.push("Stopped right after it");
  if (passed("length")) out.push(`${clock(seconds(m.speaking_ms))} long`);
  if (passed("fillers")) out.push(m.fillers.count === 0 ? "No filler words" : `${m.fillers.count} filler word${m.fillers.count === 1 ? "" : "s"}`);
  return out.slice(0, 4);
}

/** The sentences the note is about: where the point landed, where the number landed, or the evidence for the fix. */
function highlighted(rep: FullRep): number[] {
  const m = rep.metrics;
  switch (rep.fix) {
    case "answer_first":
    case "time_to_point":
      return checkOf(m, "time_to_point")?.sentences ?? [];
    case "proof":
    case "clean_stop":
      return m.proof.landed_sentence ? [m.proof.landed_sentence] : (checkOf(m, rep.fix)?.sentences ?? []);
    case "length":
    case "fillers":
    case null:
      return [];
    default:
      return checkOf(m, rep.fix ?? "")?.sentences ?? [];
  }
}

function lines(rep: FullRep): TranscriptLine[] {
  const m = rep.metrics;
  const marked = new Set(highlighted(rep));
  const circled = new Set(rep.fix === "fillers" ? m.fillers.items.flatMap((f) => [f.word]) : []);
  return m.sentences.map((s) => {
    const words = m.words.slice(s.first_word, s.first_word + s.word_count);
    const hasCircle = words.some((_, i) => circled.has(s.first_word + i));
    const text: string | TranscriptSegment[] = hasCircle
      ? words.map((word, i) => ({ text: i === 0 ? word.text : ` ${word.text}`, circle: circled.has(s.first_word + i) || undefined }))
      : s.text;
    return { text, tone: marked.has(s.index) ? "highlight" : "normal" };
  });
}

function caption(rep: FullRep): string | undefined {
  const m = rep.metrics;
  if (rep.fix === "fillers") return "Circled: the filler words.";
  const marks = highlighted(rep);
  if (marks.length === 0) return undefined;
  if (rep.fix === "answer_first" || rep.fix === "time_to_point") {
    const t = checkOf(m, "time_to_point")?.seconds;
    return t !== null && t !== undefined ? `Highlighted: where your point finally landed, at ${clock(t)}.` : undefined;
  }
  if (rep.fix === "proof" || rep.fix === "clean_stop") {
    const s = m.sentences.find((x) => x.index === marks[0]);
    return s ? `Highlighted: where your number landed, by ${clock(seconds(s.end_ms))}.` : undefined;
  }
  return "Highlighted: what the note is about.";
}

/** The change on the fix since the previous attempt, with its unit, styled by whether it actually got better. */
export function deltaChip(d: Delta | null): PracticeAttempt["delta"] {
  if (!d) return undefined;
  const caption = d.improved ? "Better than your previous attempt" : "Not better than your previous attempt yet";
  if (d.from_seconds !== null && d.to_seconds !== null) return { label: d.label, fromSeconds: d.from_seconds, toSeconds: d.to_seconds, caption, improved: d.improved };
  if (d.from_count !== null && d.to_count !== null) return { label: `${d.from_count} → ${d.to_count} ${d.label.toLowerCase()}`, caption, improved: d.improved };
  return { label: d.label, caption, improved: d.improved };
}

// The pass lines of the timing checks, the same numbers as src-tauri/src/metrics/timing.rs.
const TAIL_PASS_SECONDS = 15;
const FILLERS_PASS_PER_MINUTE = 4;

/** One plain line per row: what the check looks at, and the line it has to clear when it is a number. */
const ROW_MEASURES: Record<string, string> = {
  f1_answer_push: "Whether your first sentence answered the push.",
  f2_new_specific: "Whether you added a detail the first answer did not have.",
  f3_consistent: "Whether the facts match your first answer.",
  f4_short: "Under half the time your first answer took.",
  f5_held_position: "Whether you kept your position instead of backing off.",
  answer_first: "Whether the answer came before the backstory.",
  proof: "A number from your stories, said out loud.",
  c1_consistent: "The same facts as your earlier stages and your resume.",
  story_fit: "Whether the story you picked answers this question.",
  context_short: "How long the setup ran before what you did.",
  clean_stop: `Seconds you kept talking after your number. Under ${TAIL_PASS_SECONDS} is a clean stop.`,
  ownership: 'Whether you said what you decided, with "I".',
  method_first: "Whether you opened with how you handle this kind of problem.",
  approach_before_action: "Whether you said why before what you built.",
  conviction: "Hedges and apologies before or during the answer.",
  no_complaining: "Blame aimed at past teams, bosses or companies.",
  type_fit: "Whether the answer suits the kind of question asked.",
  stage_fit: "Whether the answer suits this interviewer.",
  jd_fit: "Whether you used the needs and words from the posting.",
  commitment: "Whether you said up front that you want full-time.",
  builder_operator: "Whether you said which of the two you are.",
  fillers: `Words like um, uh and like, per minute of speech. Under ${FILLERS_PASS_PER_MINUTE} a minute is clean.`,
};

function rowMeasures(rep: FullRep, id: string): string {
  if (id === "length") return `Your speaking time against this stage's window of ${rep.metrics.window.min_s} to ${rep.metrics.window.max_s} seconds.`;
  return ROW_MEASURES[id] ?? "";
}

const ROW_LABELS: [string, string][] = [
  ["f1_answer_push", "Answered the push first"],
  ["f2_new_specific", "Added something new"],
  ["f3_consistent", "Matched your first answer"],
  ["f4_short", "Kept it short"],
  ["f5_held_position", "Held your position"],
  ["answer_first", "Answered the question first"],
  ["proof", "Said your number"],
  ["c1_consistent", "Said it the way you said it before"],
  ["story_fit", "Picked a story that fits"],
  ["context_short", "Kept the setup short"],
  ["clean_stop", "Stopped once the number landed"],
  ["ownership", "Said what you decided"],
  ["method_first", "Opened with how you work"],
  ["approach_before_action", "Said what you noticed before what you built"],
  ["conviction", "Spoke with conviction"],
  ["no_complaining", "No knocks on past teams"],
  ["type_fit", "Fit the question"],
  ["stage_fit", "Fit the stage"],
  ["jd_fit", "Used the posting's words"],
  ["commitment", "Led with full-time"],
  ["builder_operator", "Answered builder or operator"],
  ["length", "Length"],
  ["fillers", "Filler words"],
];

function rowNote(rep: FullRep, c: Check): string {
  const m = rep.metrics;
  switch (c.id) {
    case "answer_first": {
      const t = checkOf(m, "time_to_point")?.seconds;
      return t !== null && t !== undefined ? `point at ${clock(t)}` : c.evidence;
    }
    case "proof":
      return m.proof.matched.length > 0 ? `said ${m.proof.matched.map((n) => n.raw).join(", ")}` : m.unbanked.length > 0 ? `${m.unbanked.map((n) => n.raw).join(", ")} is not in your stories` : c.evidence || "none came up";
    case "clean_stop":
      return m.proof.tail_ms !== null ? `${seconds(m.proof.tail_ms)} s after ${lastMatched(m)}` : c.evidence;
    case "length":
      return `ran ${clock(seconds(m.speaking_ms))}`;
    case "fillers":
      return `${m.fillers.count} in all, ${m.fillers.per_minute} a minute${m.fillers.items.length > 0 ? ` · ${[...new Set(m.fillers.items.map((f) => f.text))].join(", ")}` : ""}`;
    case "c1_consistent":
      return consistencySentences(c).join(" ") || c.evidence;
    default:
      return c.evidence;
  }
}

/** Checks that are measured but never listed as a row of their own (the time to the point is shown on the answer-first row). */
const NOT_LISTED = new Set(["time_to_point"]);
const KNOWN = new Set(ROW_LABELS.map(([id]) => id));

function rows(rep: FullRep): DetailRow[] {
  const m = rep.metrics;
  const out: DetailRow[] = [];
  for (const [id, label] of ROW_LABELS) {
    const c = checkOf(m, id);
    if (c && c.passed !== null) out.push({ id, label, measures: rowMeasures(rep, id), state: c.passed ? "yes" : "notyet", note: rowNote(rep, c) });
  }
  // A check this version has no wording for still shows, in the words of its id, so nothing the engine measured is hidden.
  for (const c of m.checks) {
    if (c.passed === null || KNOWN.has(c.id) || NOT_LISTED.has(c.id)) continue;
    out.push({ id: c.id, label: unknownCheckLabel(c.id), state: c.passed ? "yes" : "notyet", note: c.evidence });
  }
  out.push({ label: "Pace", measures: "Shown for you, never counted against you.", state: "info", note: `${m.wpm} words a minute · ${clock(seconds(m.speaking_ms))}` });
  if (m.pauses.length > 0) out.push({ label: "Pauses", state: "info", note: `${m.pauses.length} ${m.pauses.length === 1 ? "pause" : "pauses"} of a second or more, never counted against you` });
  return out;
}

export function attemptFromOutcome(o: RepOutcome): PracticeAttempt {
  const rep = o.rep;
  if (!rep) throw new Error("A rep that was not scored has no result to show");
  const worked = rep.fix === null;
  return {
    number: Math.min(3, Math.max(1, rep.attempt)) as 1 | 2 | 3,
    coachNote: coachNote(rep),
    notJudged: notJudgedLine(rep, o.notice),
    trySaying: rep.rewrite?.text,
    delta: deltaChip(o.delta),
    wins: worked ? wins(rep) : undefined,
    durationSeconds: seconds(rep.metrics.speaking_ms),
    transcript: lines(rep),
    highlightCaption: caption(rep),
    details: {
      rows: rows(rep),
      footnote: rep.ai ? "" : "Only the timing checks ran on this answer. Answering first, saying what you decided and story fit need an AI engine: your own key or the local AI, in Settings under AI.",
    },
  };
}
