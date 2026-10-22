// Pure changes to the user's own data (profile, stories, methods). The app applies each one after the backend has
// saved it; the browser preview applies them in memory. Nothing here mutates its input.

import type { Method, Profile, ProofPoint, Story } from "./types";

export interface DataState {
  profile: Profile | null;
  stories: Story[];
  /** All six situations, in order, with their labels and prompts. */
  methods: Method[];
}

/** A story is verified only when it has at least one number and every number is ticked (Build Plan, Story Bank). */
export const allVerified = (s: Story): boolean => s.proof_points.length > 0 && s.proof_points.every((p) => p.verified);

let counter = 0;
export function newStoryId(): string {
  counter += 1;
  return `st_${Date.now().toString(36)}${counter.toString(36)}`;
}

/** A blank story: nothing is invented, so the strategy and the numbers start as gaps to fill. */
export function emptyStory(): Story {
  return {
    id: newStoryId(),
    title: "",
    employer: "",
    best_for: [],
    direct_answer: "",
    context: "",
    approach: "",
    action: "",
    ownership: "",
    result: "",
    proof_points: [],
    scale: "",
    competencies: [],
    great_eight: [],
    branches: [],
    verified: false,
    headline: "",
    usage: { practiced: 0, fits: 0 },
  };
}

export function saveStory(state: DataState, story: Story): DataState {
  const saved = { ...story, verified: allVerified(story) };
  const i = state.stories.findIndex((s) => s.id === saved.id);
  const stories = i >= 0 ? state.stories.map((s, j) => (j === i ? saved : s)) : [...state.stories, saved];
  return { ...state, stories };
}

export function deleteStory(state: DataState, id: string): DataState {
  return {
    ...state,
    stories: state.stories.filter((s) => s.id !== id),
    methods: state.methods.map((m) => (m.storyIds.includes(id) ? { ...m, storyIds: m.storyIds.filter((x) => x !== id) } : m)),
  };
}

export function setProofVerified(state: DataState, storyId: string, label: string, verified: boolean): DataState {
  const story = state.stories.find((s) => s.id === storyId);
  if (!story) return state;
  return saveStory(state, { ...story, proof_points: story.proof_points.map((p) => (p.label === label ? { ...p, verified } : p)) });
}

export function saveMethod(state: DataState, method: Method): DataState {
  return { ...state, methods: state.methods.map((m) => (m.situation === method.situation ? { ...m, ...method } : m)) };
}

/** Methods read from disk (situation, sentence, linked stories) laid over the six situations with their labels and prompts. */
export function mergeMethods(disk: { situation: string; spoken: string; storyIds: string[] }[], base: Method[]): Method[] {
  return base.map((b) => {
    const d = disk.find((x) => x.situation === b.situation);
    return d ? { ...b, spoken: d.spoken, storyIds: d.storyIds } : { ...b, spoken: "", storyIds: [] };
  });
}

// ---------- the Numbers list on the story screens ----------

export interface NumberRowLike {
  id: string;
  label: string;
  value: string;
  checked: boolean;
  /** Typed in on the screen, so label and value are the user's own words. */
  isNew?: boolean;
}

export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** "21% → 36%" is before and after; a single value is just the after. A missing side stays empty. */
function parseTyped(label: string, value: string, checked: boolean): ProofPoint {
  const parts = value.split(/→|->|=>/).map((p) => p.trim());
  const [before, after] = parts.length > 1 ? [parts[0], parts[1]] : ["", parts[0] ?? ""];
  const percent = before !== "" && before.endsWith("%") && after.endsWith("%");
  return {
    label: slug(label),
    metric: label.trim(),
    before: percent ? before.slice(0, -1) : before,
    after: percent ? after.slice(0, -1) : after,
    unit: percent ? "%" : "",
    approximate: false,
    verified: checked,
  };
}

/** The proof points for a story after the user edited its Numbers list: existing numbers keep their fields and only
 *  change whether they are ticked; numbers typed in become new proof points. */
export function proofPointsFromRows(rows: NumberRowLike[], original: ProofPoint[]): ProofPoint[] {
  const out: ProofPoint[] = [];
  for (const r of rows) {
    if (r.isNew) {
      if (!r.label.trim() && !r.value.trim()) continue;
      out.push(parseTyped(r.label, r.value, r.checked));
      continue;
    }
    const found = original.find((p) => p.label === r.id);
    if (found) out.push({ ...found, verified: r.checked });
  }
  return out;
}

/** The one line on a story card, built from its first number ("Seven-day activation 31% → 44%"). Without numbers the
 *  existing line stays, so a story is never given a number it does not have. */
export function cardHeadline(points: ProofPoint[], fallback: string): string {
  const p = points[0];
  if (!p) return fallback;
  const u = p.unit === "%" ? "%" : "";
  const value = p.before ? `${p.before}${u} → ${p.after}${u}` : p.after;
  return `${p.metric} ${value}`.trim();
}
