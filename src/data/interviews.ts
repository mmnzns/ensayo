// After the interview: the pieces of the note that need no backend. The same rules run in the browser preview (in
// memory) as in the app (src-tauri/src/applications/interviews.rs), so what the preview shows is what the app does.

import type { AppBundle, InterviewNoteInput } from "./applicationCommands";
import type { InterviewNote, PrepQuestion, QuestionType } from "./screens/applications";

/** The plain words for "how it went", 1 to 5. */
export const RATING_LABELS: { value: number; label: string }[] = [
  { value: 1, label: "Badly" },
  { value: 2, label: "Not great" },
  { value: 3, label: "Okay" },
  { value: 4, label: "Well" },
  { value: 5, label: "Very well" },
];

/** A question's text as compared for "the same question": trimmed, lower case, spaces collapsed. */
export const questionKey = (text: string): string => text.split(/\s+/).filter(Boolean).join(" ").toLowerCase();

/** One question per line: trimmed, empty lines dropped, the same question once, order kept. */
export function splitAsked(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const t = line.split(/\s+/).filter(Boolean).join(" ");
    const key = questionKey(t);
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** A guess at the kind of a question from its words (the backend makes the same guess); behavioral when nothing says otherwise. */
export function guessKind(text: string): QuestionType {
  const t = text.toLowerCase();
  const has = (words: string[]) => words.some((w) => t.includes(w));
  if (has(["tell me about yourself", "walk me through your", "your background", "introduce yourself"])) return "about_you";
  if (has(["salary", "compensation", "pay range", "notice period", "when can you start", "how soon", "visa", "relocate", "work authorization", "work authorisation", "how much"])) return "factual";
  if (t.trim().startsWith("why ") || has(["what motivates", "what interests you"])) return "motivation";
  if (has(["where do you see", "five years", "5 years", "first 90 days", "first 60 days", "first 30 days", "how would you approach", "what would you do"])) return "future";
  return "behavioral";
}

/** The note for a stage, if one was written. */
export const noteFor = (notes: InterviewNote[] | undefined, stageId: string): InterviewNote | undefined => notes?.find((n) => n.stageId === stageId);

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Browser preview: saves the note, marks the stage done and adds the asked questions to the question set. */
export function mockSaveInterviewNote(bundle: AppBundle, input: InterviewNoteInput, now: Date): AppBundle {
  const stage = bundle.application.process.find((p) => p.id === input.stage_id);
  if (!stage) throw new Error("That stage isn't here any more.");
  if (input.rating != null && !(input.rating >= 1 && input.rating <= 5)) throw new Error("How it went is a number from 1 to 5.");
  const asked = splitAsked(input.asked.join("\n"));
  const old = bundle.extras.interviewNotes ?? [];
  const before = old.find((n) => n.stageId === input.stage_id);
  const stamp = now.toISOString();
  const note: InterviewNote = {
    stageId: input.stage_id,
    heldOn: input.held_on?.trim() || localDay(now),
    rating: input.rating ?? null,
    asked,
    worked: input.worked.trim(),
    differently: input.differently.trim(),
    spokeTo: input.spoke_to.trim(),
    nextStep: input.next_step.trim(),
    created: before?.created || stamp,
    edited: stamp,
  };
  const order = (id: string) => {
    const i = bundle.application.process.findIndex((p) => p.id === id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const notes = [...old.filter((n) => n.stageId !== note.stageId), note].sort((a, b) => order(a.stageId) - order(b.stageId));
  let n = bundle.extras.questions.reduce((m, q) => Math.max(m, Number(/(\d+)$/.exec(q.id)?.[1] ?? 0)), 0);
  const added: PrepQuestion[] = [];
  for (const text of asked) {
    if (bundle.extras.questions.some((q) => q.stageId === stage.id && questionKey(q.text) === questionKey(text))) continue;
    n += 1;
    added.push({ id: `q_${n}`, stageId: stage.id, type: guessKind(text), text, editedByUser: true, source: "asked" });
  }
  const process = bundle.application.process.map((p) => (p.id === stage.id ? { ...p, done: true } : p));
  return { application: { ...bundle.application, process }, extras: { ...bundle.extras, interviewNotes: notes, questions: [...bundle.extras.questions, ...added] } };
}

export function mockDeleteInterviewNote(bundle: AppBundle, stageId: string): AppBundle {
  return { ...bundle, extras: { ...bundle.extras, interviewNotes: (bundle.extras.interviewNotes ?? []).filter((n) => n.stageId !== stageId) } };
}

/** Browser preview: taking an asked question out of the question set takes it out of the note too. */
export function mockForgetAsked(bundle: AppBundle, questionId: string): AppBundle {
  const q = bundle.extras.questions.find((x) => x.id === questionId);
  if (!q || q.source !== "asked") return bundle;
  const key = questionKey(q.text);
  const notes = (bundle.extras.interviewNotes ?? []).map((n) => (n.stageId === q.stageId ? { ...n, asked: n.asked.filter((a) => questionKey(a) !== key) } : n));
  return { ...bundle, extras: { ...bundle.extras, interviewNotes: notes } };
}

export function mockSetAskedFirst(bundle: AppBundle, on: boolean): AppBundle {
  return { ...bundle, extras: { ...bundle.extras, askedFirst: on } };
}

/** The sentence under a stage on the Overview and Stages tab: "They asked 4 questions at the recruiter stage". */
export function askedLine(note: InterviewNote, stageLabel: string): string {
  const n = note.asked.length;
  return `They asked ${n} ${n === 1 ? "question" : "questions"} at the ${stageLabel.toLowerCase()} stage`;
}
