// The "Add many at once" flow without the screen: the list of drafts, reading them one at a time, and which ones get
// saved. A failed read never stops the rest, Stop ends the run after the current one, and nothing here saves anything:
// the screen calls `savable` and the same saveStory the single flow uses, only for what the person chose.
import type { Story } from "../../data/types";
import { findDuplicate } from "./bulkDuplicates";
import { firstLine, titleFromFileName, type Piece } from "./bulkSplit";
import type { NumberRow } from "./Numbers";
import { draftToReview, storyFromReview, type ReviewFields } from "./parseDraft";
import { readStory } from "./readStory";
import type { ParsedDraft } from "./selection";

export type ItemStatus = "waiting" | "reading" | "read" | "failed";
export type Outcome = "open" | "saved" | "skipped";

export interface BulkItem {
  id: string;
  text: string;
  source?: string;
  status: ItemStatus;
  /** Why the read failed, in the backend's plain words. */
  error?: string;
  draft: ParsedDraft | null;
  /** "Start blank" on a read that failed: the fields start empty (the title from the first line) and the person fills them. */
  blank: boolean;
  /** What the person changed in Review; without it the draft is saved as it was read. */
  fields?: ReviewFields;
  rows?: NumberRow[];
  checked: boolean;
  /** The title of the saved story this one probably repeats. */
  duplicateOf?: string;
  outcome: Outcome;
  saveFailed?: boolean;
}

export const newItem = (p: Piece): BulkItem => ({ id: p.id, text: p.text, source: p.source, status: "waiting", draft: null, blank: false, checked: false, outcome: "open" });

type Review = { fields: ReviewFields; rows: NumberRow[]; missing: string[]; dropped: string[] };

const emptyFields = (title: string): ReviewFields => ({ title, company: "", headline: "", context: "", approach: "", action: "", ownership: "", result: "", goodFor: [] });

/** What the card and the Review fields start from: the draft as read, or empty fields for a blank start. */
export function reviewOf(item: BulkItem): Review {
  if (item.draft) {
    const r = draftToReview(item.draft.story, item.draft.missing, item.draft.dropped);
    const fields: ReviewFields = { title: r.title, company: r.company, headline: r.headline, context: r.context, approach: r.approach, action: r.action, ownership: r.ownership, result: r.result, goodFor: r.goodFor };
    return { fields: item.fields ?? fields, rows: item.rows ?? r.numbers, missing: r.missing, dropped: r.dropped };
  }
  const title = item.source ? titleFromFileName(item.source) || firstLine(item.text) : firstLine(item.text);
  return { fields: item.fields ?? emptyFields(title), rows: item.rows ?? [], missing: [], dropped: [] };
}

/** The story that would be saved for this item. */
export const itemStory = (item: BulkItem): Story => {
  const r = reviewOf(item);
  return storyFromReview(item.draft?.story ?? null, r.fields, r.rows);
};

/** An item can be saved once it has a draft or was started blank, and is still open. */
export const canSave = (item: BulkItem): boolean => item.outcome === "open" && (item.status === "read" || item.blank);

/** The items "Save all checked" saves: open, ready and checked. Never anything else. */
export const savable = (items: BulkItem[]): BulkItem[] => items.filter((i) => canSave(i) && i.checked);

/** Drafts the person has not dealt with yet: read or blank, still open. Leaving the screen asks about these. */
export const unsavedCount = (items: BulkItem[]): number => items.filter((i) => i.outcome === "open" && (i.status === "read" || i.blank)).length;

/** Marks an item read: its draft, whether it looks like a story already saved, and checked unless it does. */
export function withRead(item: BulkItem, draft: ParsedDraft, saved: Story[]): BulkItem {
  const dup = findDuplicate(draft.story, saved);
  return { ...item, status: "read", draft, error: undefined, blank: false, duplicateOf: dup?.title, checked: !dup };
}

export const withFailure = (item: BulkItem, error: string): BulkItem => ({ ...item, status: "failed", error, draft: null });

/** "Start blank" on a failed item. Checked, so Save all saves it once the person has filled it in; they can untick it. */
export const withBlank = (item: BulkItem, saved: Story[]): BulkItem => {
  const started = { ...item, status: "read" as const, blank: true, error: undefined, draft: null };
  const dup = findDuplicate(itemStory(started), saved);
  return { ...started, duplicateOf: dup?.title, checked: false };
};

export type RunEnd = "finished" | "stopped" | "gone";

export interface RunDeps {
  parse?: (raw: string, employerHint: string) => Promise<ParsedDraft>;
  /** True once the person pressed Stop: the run ends before it starts the next one. */
  stopRequested: () => boolean;
  /** False once the screen is gone. */
  alive: () => boolean;
  onStart: (id: string) => void;
  onRead: (id: string, draft: ParsedDraft) => void;
  onFail: (id: string, message: string) => void;
}

/** Reads the items one at a time, in order, with the same read as the single Add a story. */
export async function runReads(items: { id: string; text: string }[], deps: RunDeps): Promise<RunEnd> {
  for (const it of items) {
    if (!deps.alive()) return "gone";
    if (deps.stopRequested()) return "stopped";
    deps.onStart(it.id);
    let draft: ParsedDraft | null = null;
    let failure = "";
    const end = await readStory(it.text, "", { alive: deps.alive, parse: deps.parse, setDraft: (d) => (draft = d), setFailure: (e) => (failure = e), goTo: () => {} });
    if (end === "gone") return "gone";
    if (end === "reviewed" && draft) deps.onRead(it.id, draft);
    else deps.onFail(it.id, end === "stopped" ? "Stopped before it finished." : failure || "It could not be read.");
    if (end === "stopped") return "stopped";
  }
  return "finished";
}

/** "Reading 3 of 12". */
export const progressLine = (done: number, total: number): string => `Reading ${Math.min(done + 1, total)} of ${total}`;

/** Saves these items one after another with the same save the single flow uses. A save that fails is reported and the
 *  rest still go. Returns how many were saved. This is the only place the bulk flow saves, and it saves only what it is given. */
export async function saveItems(items: BulkItem[], save: (s: Story) => Promise<Story>, onResult: (id: string, ok: boolean) => void): Promise<number> {
  let saved = 0;
  for (const it of items) {
    if (!canSave(it)) continue;
    try {
      await save(itemStory(it));
      saved++;
      onResult(it.id, true);
    } catch {
      onResult(it.id, false);
    }
  }
  return saved;
}

/** "Saved 3 stories", "Saved 1 story, 1 could not be saved". */
export function savedLine(saved: number, failed: number): string {
  const ok = `Saved ${saved} ${saved === 1 ? "story" : "stories"}`;
  return failed > 0 ? `${ok}, ${failed} could not be saved. Check that your data folder is available, then try those again.` : `${ok}.`;
}
