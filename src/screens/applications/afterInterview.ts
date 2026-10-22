// After the interview: when a stage offers the sheet, and the sheet's fields as text and back.

import type { InterviewNoteInput } from "../../data/applicationCommands";
import { splitAsked } from "../../data/interviews";
import type { InterviewNote } from "../../data/screens/applications";
import type { Application, ProcessStage } from "../../data/types";
import { parseDate } from "./format";

/** The interview has happened once its stage is marked done or its date has passed. A date with no time counts after that day. */
export function interviewHappened(stage: Pick<ProcessStage, "done" | "at">, now: Date): boolean {
  if (stage.done) return true;
  const at = stage.at;
  const d = parseDate(at);
  if (!d) return false;
  if (at && at.includes("T")) return d.getTime() <= now.getTime();
  const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return endOfDay.getTime() <= now.getTime();
}

/** The stage the sheet is for when the link names none: the first one that has happened and has no note, else the last one that has happened, else the first. */
export function defaultStage(app: Application, notes: InterviewNote[] | undefined, now: Date): ProcessStage | undefined {
  const ordered = [...app.process].sort((a, b) => a.order - b.order);
  const happened = ordered.filter((s) => interviewHappened(s, now));
  return happened.find((s) => !notes?.some((n) => n.stageId === s.id)) ?? happened[happened.length - 1] ?? ordered[0];
}

/** What the fields hold. The questions are one text, one per line. */
export interface Draft {
  rating: number | null;
  asked: string;
  worked: string;
  differently: string;
  spokeTo: string;
  nextStep: string;
}

export const EMPTY_DRAFT: Draft = { rating: null, asked: "", worked: "", differently: "", spokeTo: "", nextStep: "" };

export function draftOf(note: InterviewNote | undefined): Draft {
  if (!note) return EMPTY_DRAFT;
  return { rating: note.rating, asked: note.asked.join("\n"), worked: note.worked, differently: note.differently, spokeTo: note.spokeTo, nextStep: note.nextStep };
}

/** The command's input: the questions split on new lines, trimmed, empties and repeats dropped, order kept. */
export function inputOf(stageId: string, d: Draft): InterviewNoteInput {
  return { stage_id: stageId, rating: d.rating, asked: splitAsked(d.asked), worked: d.worked, differently: d.differently, spoke_to: d.spokeTo, next_step: d.nextStep };
}

/** True when nothing was written at all (a note with nothing in it is not saved). */
export function isBlank(d: Draft): boolean {
  return d.rating === null && !d.asked.trim() && !d.worked.trim() && !d.differently.trim() && !d.spokeTo.trim() && !d.nextStep.trim();
}
