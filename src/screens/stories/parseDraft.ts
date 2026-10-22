// A parsed story on the review screen (5-3) and back: the draft the engine made, shown for the user to check, and the
// story that is saved once they confirm. The parse never verifies anything; the ticks are the user's.

import { cardHeadline, emptyStory, proofPointsFromRows } from "../../data/actions";
import type { Story } from "../../data/types";
import { numberText } from "./helpers";
import type { NumberRow } from "./Numbers";

export interface ReviewFields {
  title: string;
  company: string;
  headline: string;
  context: string;
  approach: string;
  action: string;
  ownership: string;
  result: string;
  goodFor: string[];
}

export interface ReviewDraft extends ReviewFields {
  numbers: NumberRow[];
  followUps: { question: string; angle: string }[];
  /** The parts the story still needs (approach, proof_points, ownership, result, scale). */
  missing: string[];
  /** Plain lines about anything dropped because it was not in the pasted text. */
  dropped: string[];
}

export function draftToReview(draft: Story, missing: string[], dropped: string[]): ReviewDraft {
  return {
    title: draft.title,
    company: draft.employer,
    headline: draft.direct_answer,
    context: draft.context,
    approach: draft.approach,
    action: draft.action,
    ownership: draft.ownership,
    result: draft.result,
    goodFor: draft.best_for,
    numbers: draft.proof_points.map((p) => ({ id: p.label, label: p.metric, value: numberText(p), checked: false })),
    followUps: draft.branches.map((b) => ({ question: b.trigger, angle: b.angle })),
    missing,
    dropped,
  };
}

/** The story to save: the draft's own parts (scale, themes, branches, each number's fields) with what the user
 *  confirmed or changed laid over them. With no draft (typed from scratch) it is a new story from the fields. */
export function storyFromReview(draft: Story | null, f: ReviewFields, rows: NumberRow[]): Story {
  const base = draft ?? emptyStory();
  const known = new Set(base.proof_points.map((p) => p.label));
  // A row that is one of the draft's numbers keeps its fields; anything else was typed by the user.
  const marked = rows.map((r) => (known.has(r.id) && !r.isNew ? r : { ...r, isNew: true }));
  const proof_points = proofPointsFromRows(marked, base.proof_points);
  return {
    ...base,
    title: f.title.trim() || "Untitled story",
    employer: f.company.trim(),
    direct_answer: f.headline.trim(),
    context: f.context.trim(),
    approach: f.approach.trim(),
    action: f.action.trim(),
    ownership: f.ownership.trim(),
    result: f.result.trim(),
    best_for: f.goodFor,
    proof_points,
    verified: false,
    headline: cardHeadline(proof_points, base.headline),
  };
}
