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
