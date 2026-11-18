// "Likely duplicate of ...": a plain check of a new draft against the stories already saved. A normalised title match,
// or enough of the same words. It only warns; the person decides.
import type { Story } from "../../data/types";

const STOP = new Set(["that", "this", "with", "from", "have", "were", "they", "them", "then", "than", "into", "over", "about", "which", "their", "there", "would", "could", "your", "what", "when", "will", "been", "also", "just", "story", "untitled"]);

/** Lower case, letters and digits only, single spaces. */
export const normaliseTitle = (t: string): string =>
  t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** The words that say something: four letters or more, not filler. */
export function words(text: string): Set<string> {
  return new Set(
    normaliseTitle(text)
      .split(" ")
      .filter((w) => w.length >= 4 && !STOP.has(w)),
  );
}

/** Shared words over all the words in either, 0 to 1. */
export function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

const bodyOf = (s: Pick<Story, "title" | "direct_answer" | "context" | "approach" | "action" | "ownership" | "result">): string =>
  [s.title, s.direct_answer, s.context, s.approach, s.action, s.ownership, s.result].join(" ");

type Comparable = Parameters<typeof bodyOf>[0] & { employer?: string };

/** True when two stories are probably the same one. */
export function looksSame(a: Comparable, b: Comparable): boolean {
  const ta = normaliseTitle(a.title);
  const tb = normaliseTitle(b.title);
  if (ta && ta === tb && ta !== "untitled story") return true;
  const titleWords = overlap(words(a.title), words(b.title));
  if (titleWords >= 0.7 && words(a.title).size >= 2) return true;
  const wa = words(bodyOf(a));
  const wb = words(bodyOf(b));
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared >= 10 && overlap(wa, wb) >= 0.5;
}

/** The saved story this draft most likely repeats, or null. */
export function findDuplicate(draft: Comparable, saved: Story[]): Story | null {
  return saved.find((s) => looksSame(draft, s)) ?? null;
}
