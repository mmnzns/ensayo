// A measured rep as the Result screen shows it. Plain words, written for the user: no "score", "fail" or criterion
// names. Until the AI check arrives (M4) the note comes from the rules only: the number, the stop, the length and the
// filler words, and there is no "try saying" line (it needs the transcript and the stories read by a model).

import { clock, type DetailRow, type PracticeAttempt, type TranscriptLine, type TranscriptSegment } from "../data/screens/practice";
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
    default:
      return "The parts that can be measured are clean: the number, the stop, the length and the fillers.";
  }
}

function wins(rep: FullRep): string[] {
  const m = rep.metrics;
  const passed = (id: string) => checkOf(m, id)?.passed === true;
  const out: string[] = [];
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

function deltaChip(d: Delta | null): PracticeAttempt["delta"] {
  if (!d) return undefined;
  if (d.from_seconds !== null && d.to_seconds !== null) return { label: d.label, fromSeconds: d.from_seconds, toSeconds: d.to_seconds };
  if (d.from_count !== null && d.to_count !== null) return { label: d.label, caption: `${d.from_count} → ${d.to_count}` };
  return { label: d.label };
}

const ROW_LABELS: [string, string][] = [
  ["answer_first", "Answered the question first"],
  ["proof", "Said your number"],
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
      return t !== null && t !== undefined ? `point at ${clock(t)}` : c.passed ? "" : c.evidence;
    }
    case "proof":
      return m.proof.matched.length > 0 ? m.proof.matched.map((n) => n.raw).join(", ") : m.unbanked.length > 0 ? `${m.unbanked.map((n) => n.raw).join(", ")} is not in your stories` : c.passed ? "" : "none came up";
    case "clean_stop":
      return m.proof.tail_ms !== null ? `${seconds(m.proof.tail_ms)} s after` : "";
    case "length":
      return `${clock(seconds(m.speaking_ms))} · window ${m.window.min_s} to ${m.window.max_s} s`;
    case "fillers":
      return `${m.fillers.per_minute} a minute${m.fillers.items.length > 0 ? ` · ${[...new Set(m.fillers.items.map((f) => f.text))].join(", ")}` : ""}`;
    default:
      return c.passed ? "" : c.evidence;
  }
}

function rows(rep: FullRep): DetailRow[] {
  const m = rep.metrics;
  const out: DetailRow[] = [];
  for (const [id, label] of ROW_LABELS) {
    const c = checkOf(m, id);
    if (c && c.passed !== null) out.push({ id, label, state: c.passed ? "yes" : "notyet", note: rowNote(rep, c) });
  }
  out.push({ label: "Pace", state: "info", note: `${m.wpm} words a minute · ${clock(seconds(m.speaking_ms))}` });
  if (m.pauses.length > 0) out.push({ label: "Pauses", state: "info", note: `${m.pauses.length} of a second or more, never counted against you` });
  return out;
}

export function attemptFromOutcome(o: RepOutcome): PracticeAttempt {
  const rep = o.rep;
  if (!rep) throw new Error("A rep that was not scored has no result to show");
  const worked = rep.fix === null;
  return {
    number: Math.min(3, Math.max(1, rep.attempt)) as 1 | 2 | 3,
    coachNote: coachNote(rep),
    trySaying: rep.rewrite?.text,
    delta: deltaChip(o.delta),
    wins: worked ? wins(rep) : undefined,
    durationSeconds: seconds(rep.metrics.speaking_ms),
    transcript: lines(rep),
    highlightCaption: caption(rep),
    details: {
      rows: rows(rep),
      footnote: rep.ai ? "" : "The other checks, like answering first and saying what you decided, turn on once you add an AI key or a local model.",
    },
  };
}
