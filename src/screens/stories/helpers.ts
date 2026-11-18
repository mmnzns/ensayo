import type { Method, ProofPoint, Story } from "../../data/types";
import type { StoryFilter } from "../../data/screens/stories";
import { storyGaps } from "../../data/store";
import { withParams } from "../../data/selection";
import { withPercent } from "./percent";

/** "Practiced 9 times", "Practiced once", "Not practiced yet". */
export function practicedText(practiced: number): string {
  if (practiced <= 0) return "Not practiced yet";
  if (practiced === 1) return "Practiced once";
  return `Practiced ${practiced} times`;
}

/** "fits 5 questions", "fits 1 question", "fits no questions yet". */
export function fitsText(fits: number): string {
  if (fits <= 0) return "fits no questions yet";
  if (fits === 1) return "fits 1 question";
  return `fits ${fits} questions`;
}

export const usageText = (usage: Story["usage"]): string => `${practicedText(usage.practiced)} · ${fitsText(usage.fits)}`;

/** "31% → 44%", "3 → 1", "40,000", "up 18%", "2 weeks". */
export function numberText(p: Pick<ProofPoint, "before" | "after" | "unit">): string {
  const { before, after, unit } = p;
  const pct = unit === "%";
  if (!before || before === "0") {
    if (unit.startsWith("%")) return `${unit.slice(1).trim() ? unit.slice(1).trim() + " " : ""}${withPercent(after)}`;
    return unit && before === "0" ? `${after} ${unit}` : after;
  }
  return pct ? `${withPercent(before)} → ${withPercent(after)}` : `${before} → ${after}`;
}

/** Stories that pass the chosen filter chip. */
export function filterStories(stories: Story[], filter: StoryFilter | undefined): Story[] {
  if (!filter || (!filter.competency && !filter.gaps)) return stories;
  return stories.filter((s) => {
    if (filter.gaps) return storyGaps(s).length > 0;
    return s.competencies.some((c) => c.toLowerCase() === filter.competency);
  });
}

/** The first application belief nobody's story covers: where the "none of yours fits yet" strip comes from. */
export function firstUncovered(apps: { company: string; analysis: { beliefs: { covered: boolean }[] } | null }[]): { company: string } | undefined {
  for (const a of apps) if (a.analysis?.beliefs.some((b) => !b.covered)) return { company: a.company };
  return undefined;
}

export const methodsFilled = (methods: Method[]): number => methods.filter((m) => m.spoken.trim()).length;

/** Follow-up kinds, in the order the story screen lists them, with plain labels. */
export const BRANCH_LABELS: Record<string, string> = {
  data: "Data",
  failure: "What went wrong",
  pushback: "Pushback",
  leadership: "Leading people",
  ambiguity: "When it was unclear",
  technical: "Technical depth",
  avoided_failure: "What you avoided",
};
export const CORE_BRANCHES = ["data", "failure", "pushback"];

/** "improving a metric" as a chip label: the first letter up. */
const chipLabel = (c: string): string => c.charAt(0).toUpperCase() + c.slice(1);

/**
 * The filter chips for the story list, from the user's own stories: All, the `limit` competencies most of them carry
 * (the most common first, ties in the order they first appear), then Has gaps. Competencies are matched ignoring case.
 */
export function storyFilters(stories: Story[], limit = 4): StoryFilter[] {
  const counts = new Map<string, { label: string; n: number }>();
  for (const s of stories) {
    // A story counts once for a competency, however many times it repeats it.
    for (const c of new Set(s.competencies.map((x) => x.trim().toLowerCase()).filter(Boolean))) {
      const seen = counts.get(c);
      if (seen) seen.n += 1;
      else counts.set(c, { label: chipLabel(s.competencies.find((x) => x.trim().toLowerCase() === c)!.trim()), n: 1 });
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, limit);
  return [
    { id: "all", label: "All" },
    ...top.map(([c, v]): StoryFilter => ({ id: `competency:${c}`, label: v.label, competency: c })),
    { id: "gaps", label: "Has gaps", gaps: true },
  ];
}

// ---- Stories to add for one job ----

/** The belief in a few words, for the Title field's hint: "You can own lifecycle end to end, with no ops team." becomes "Own lifecycle end to end". */
export function titleHint(text: string, maxWords = 5): string {
  const core = text
    .trim()
    .replace(/^you(?:'ll|'re|'ve| can| could| will| have| are)?\s+/i, "")
    .split(/[,.;:!?]/)[0]
    .trim();
  const words = core.split(/\s+/).filter(Boolean).slice(0, maxWords).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const lowerFirst = (s: string): string => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const noEnd = (s: string): string => s.trim().replace(/[.!?\s]+$/, "");

/** A question the story would answer, built only from the reading's own words. */
export function questionFor(kind: "belief" | "gap", text: string): string {
  const t = noEnd(text);
  if (kind === "gap") return `Tell me about a time you worked on ${lowerFirst(t)}.`;
  if (/^you\b/i.test(t)) return `Tell me about a time you showed that ${t.replace(/^you/i, "you")}.`;
  return `Tell me about a time that shows this: ${lowerFirst(t)}.`;
}

export interface StoryToAdd {
  key: string;
  kind: "belief" | "gap";
  /** What the story should prove, in the reading's words. */
  proves: string;
  /** The reading's own note on why nothing fits yet, when it gave one. */
  why?: string;
  question: string;
  titleHint: string;
  /** An existing story the reading already points at for this belief, so a new angle may do instead of a new story. */
  related?: { id: string; title: string };
}

/**
 * Every belief nobody's story covers, then every gap, each in the reading's own order (the reading lists the most
 * important first). Nothing is added that the reading did not say.
 */
export function storiesToAdd(
  analysis: { beliefs: { text: string; storyId: string | null; covered: boolean; why?: string }[]; gaps: string[] },
  stories: { id: string; title: string }[],
): StoryToAdd[] {
  const out: StoryToAdd[] = [];
  analysis.beliefs.forEach((b, i) => {
    if (b.covered && b.storyId) return;
    const s = b.storyId ? stories.find((x) => x.id === b.storyId) : undefined;
    out.push({ key: `belief-${i}`, kind: "belief", proves: b.text, why: b.why, question: questionFor("belief", b.text), titleHint: titleHint(b.text), related: s ? { id: s.id, title: s.title } : undefined });
  });
  analysis.gaps.forEach((g, i) => {
    if (g.trim()) out.push({ key: `gap-${i}`, kind: "gap", proves: g, question: questionFor("gap", g), titleHint: titleHint(g) });
  });
  return out;
}

/** The Add a story screen for one application's belief: the company and a title hint travel in the link, and nothing else changes. */
export function addStoryLink(app: { id: string; company: string }, text: string): string {
  return withParams("5-2-add-a-story-paste", { app: app.id, company: app.company, hint: titleHint(text) });
}
