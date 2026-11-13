import type { Method, ProofPoint, Story } from "../../data/types";
import type { StoryFilter } from "../../data/screens/stories";
import { storyGaps } from "../../data/store";

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
    if (unit.startsWith("%")) return `${unit.slice(1).trim() ? unit.slice(1).trim() + " " : ""}${after}%`;
    return unit && before === "0" ? `${after} ${unit}` : after;
  }
  return pct ? `${before}% → ${after}%` : `${before} → ${after}`;
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
