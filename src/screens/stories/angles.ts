// Story angles (v0.1): one way in per target. An angle changes how the story opens and what it stresses; it never
// changes a number. `checkAngleNumbers` is the live version of the rule the backend enforces on save: an opening
// sentence may only contain numbers that are in the story's proof points (same value, any wording).

import type { Branch, ProofPoint, Story, StoryAngle, Target } from "../../data/types";
import { BRANCH_LABELS } from "./helpers";

// ---------- numbers said or written (a port of src-tauri/src/metrics/numbers.rs) ----------

interface Num {
  value: number;
  percent: boolean;
  raw: string;
}

const UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9 };

type Part = { kind: "unit"; v: number } | { kind: "tens"; v: number } | { kind: "hundred" } | { kind: "scale"; v: number };

function wordPart(w: string): Part | null {
  const u = UNITS.indexOf(w);
  if (u >= 0) return { kind: "unit", v: u };
  const t = TENS.indexOf(w);
  if (t >= 0) return { kind: "tens", v: (t + 2) * 10 };
  if (w === "hundred") return { kind: "hundred" };
  if (w in SCALES) return { kind: "scale", v: SCALES[w] };
  return null;
}

const scaleWord = (w: string | undefined): number | null => (w === "hundred" ? 100 : w && w in SCALES ? SCALES[w] : null);
const isWordChar = (c: string) => /[\p{L}\p{N}%.]/u.test(c);

/** Lower-case pieces of the text. Hyphenated words split ("twenty-four"); edge punctuation goes, except a trailing percent sign. */
function tokens(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    for (const piece of raw.split(/[-–—]/)) {
      const chars = [...piece];
      let a = 0;
      let b = chars.length;
      while (a < b && !isWordChar(chars[a])) a++;
      while (b > a && !isWordChar(chars[b - 1])) b--;
      const t = chars.slice(a, b).join("").replace(/\.+$/, "").toLowerCase();
      if (t) out.push(t);
    }
  }
  return out;
}

function percentFollows(toks: string[], at: number): number {
  const t = toks[at];
  if (t === "percent" || t === "%") return 1;
  if (t === "per" && toks[at + 1] === "cent") return 2;
  return 0;
}

/** A hyphenated token that names a thing rather than a number said: "seven-day", "7-day", "three-step". "twenty-four" is a number. */
function isCompound(token: string): boolean {
  const pieces = token.split(/[-–—]/);
  if (pieces.length < 2) return false;
  const isNum = (p: string) => /^\d/.test(p) || wordPart(p.toLowerCase().replace(/[^a-z]/g, "")) !== null;
  return isNum(pieces[0]) && pieces.slice(1).some((p) => /^[A-Za-z]/.test(p) && !isNum(p));
}

/** The text without compound adjectives, which name a metric and are not numbers said. */
function withoutCompounds(text: string): string {
  return text
    .split(/\s+/)
    .filter((t) => t && !isCompound(t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")))
    .join(" ");
}

function extract(text: string): Num[] {
  const toks = tokens(text);
  const out: Num[] = [];
  let i = 0;
  while (i < toks.length) {
    const word = toks[i];
    if (/^[0-9]/.test(word)) {
      let body = word.replace(/,/g, "");
      let percent = false;
      let mult = 1;
      let consumed = 1;
      if (body.endsWith("%")) {
        percent = true;
        body = body.slice(0, -1);
      } else if (body.endsWith("k")) {
        mult = 1e3;
        body = body.slice(0, -1);
      } else if (body.endsWith("m")) {
        mult = 1e6;
        body = body.slice(0, -1);
      } else if (body.endsWith("b")) {
        mult = 1e9;
        body = body.slice(0, -1);
      } else if (body.endsWith("x")) {
        body = body.slice(0, -1);
      }
      if (!/^\d*\.?\d+$|^\d+\.$/.test(body)) {
        i += 1;
        continue;
      }
      let value = parseFloat(body);
      if (!percent) {
        const m = scaleWord(toks[i + 1]);
        if (m) {
          mult *= m;
          consumed += 1;
        }
      }
      value *= mult;
      if (!percent) {
        const n = percentFollows(toks, i + consumed);
        if (n) {
          percent = true;
          consumed += n;
        }
      }
      out.push({ value, percent, raw: word });
      i += consumed;
      continue;
    }
    if (wordPart(word)) {
      let total = 0;
      let current = 0;
      let j = i;
      let seenBig = false;
      while (j < toks.length) {
        const w = toks[j];
        const p = wordPart(w);
        if (p && (p.kind === "unit" || p.kind === "tens")) current += p.v;
        else if (p && p.kind === "hundred") {
          current = Math.max(current, 1) * 100;
          seenBig = true;
        } else if (p && p.kind === "scale") {
          total += Math.max(current, 1) * p.v;
          current = 0;
          seenBig = true;
        } else if (w === "and" && seenBig && toks[j + 1] !== undefined && wordPart(toks[j + 1])) {
          // "two hundred and fifty"
        } else break;
        j += 1;
      }
      let consumed = j - i;
      const bareOne = consumed === 1 && word === "one";
      const n = percentFollows(toks, j);
      if (n) consumed += n;
      if (!(bareOne && !n)) out.push({ value: total + current, percent: n > 0, raw: toks.slice(i, i + consumed).join(" ") });
      i += consumed;
      continue;
    }
    i += 1;
  }
  return out;
}

/** The same number, ignoring rounding noise only. */
export const sameNumber = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(Math.max(Math.abs(a), Math.abs(b)) * 0.005, 0.05);

const show = (n: Num): string => {
  const v = Number.isInteger(n.value) ? String(n.value) : String(Math.round(n.value * 100) / 100);
  return n.percent ? `${v}%` : v;
};

/** Every number in a story's proof points (before and after values), as plain values. */
export function storyNumbers(proofPoints: Pick<ProofPoint, "before" | "after">[]): number[] {
  return proofPoints.flatMap((p) => [p.before, p.after]).flatMap((v) => extract(v ?? "").map((n) => n.value));
}

export interface NumberCheck {
  ok: boolean;
  /** The numbers the sentence says that the story does not have, as written ("52%"). */
  extra: string[];
}

/** An opening sentence may only say numbers that are in the story. "seven-day" is a name, not a number. */
export function checkAngleNumbers(headline: string, proofPoints: Pick<ProofPoint, "before" | "after">[]): NumberCheck {
  const have = storyNumbers(proofPoints);
  const said = extract(withoutCompounds(headline));
  const extra: string[] = [];
  for (const n of said) if (!have.some((h) => sameNumber(h, n.value)) && !extra.includes(show(n))) extra.push(show(n));
  return { ok: extra.length === 0, extra };
}

/** The reason Save is blocked, in plain words; empty when the numbers match. */
export function numberProblem(targetName: string, check: NumberCheck): string {
  if (check.ok) return "";
  const list = check.extra.length === 1 ? check.extra[0] : `${check.extra.slice(0, -1).join(", ")} and ${check.extra[check.extra.length - 1]}`;
  return `The opening sentence for ${targetName} says ${list}, which ${check.extra.length === 1 ? "is not one of this story's numbers" : "are not this story's numbers"}.`;
}

/** The story's numbers as the read-only list shows them ("Seven-day activation", "31% → 44%"). */
export function numberList(story: Pick<Story, "proof_points">): { label: string; value: string; verified: boolean }[] {
  return story.proof_points.map((p) => {
    const pct = p.unit === "%";
    const value = p.before ? (pct ? `${p.before}% → ${p.after}%` : `${p.before} → ${p.after}`) : pct ? `${p.after}%` : p.after;
    return { label: p.metric, value, verified: p.verified };
  });
}

// ---------- the angle cards ----------

/** The targets that get a card: every one that is not archived. */
export const angleTargets = (targets: Target[]): Target[] => targets.filter((t) => !t.archived);

/** How many targets have an angle on this story, for the "Angles · N" tab. Archived targets do not count. */
export function angleCount(story: Pick<Story, "angles">, targets: Target[]): number {
  const live = new Set(angleTargets(targets).map((t) => t.id));
  return (story.angles ?? []).filter((a) => live.has(a.target_id) && a.headline.trim() !== "").length;
}

/** What one target's card edits: its angle, or an empty one when the target has none yet. */
export function draftAngle(story: Pick<Story, "angles">, targetId: string): StoryAngle {
  return story.angles?.find((a) => a.target_id === targetId) ?? { target_id: targetId, headline: "", emphasis: [], lead_branch: null };
}

/** Stress tags: trimmed, no empties, no repeats (ignoring case), at most 6. */
export function addStress(tags: string[], tag: string): string[] {
  const t = tag.trim();
  if (!t || tags.some((x) => x.toLowerCase() === t.toLowerCase())) return tags;
  return [...tags, t].slice(0, 6);
}

export const removeStress = (tags: string[], tag: string): string[] => tags.filter((t) => t !== tag);

/** The story's angles after the cards were edited: one per target, empty ones left out (a target with no opening sentence has no angle).
 *  Angles for targets that are archived or gone are kept as they were, so archiving never loses work. */
export function anglesToSave(story: Pick<Story, "angles">, edited: StoryAngle[], targets: Target[]): StoryAngle[] {
  const live = new Set(angleTargets(targets).map((t) => t.id));
  const kept = (story.angles ?? []).filter((a) => !live.has(a.target_id));
  const mine = edited
    .filter((a) => live.has(a.target_id) && a.headline.trim() !== "")
    .map((a) => ({ target_id: a.target_id, headline: a.headline.trim(), emphasis: a.emphasis.map((e) => e.trim()).filter(Boolean), lead_branch: a.lead_branch || null }));
  return [...kept, ...mine];
}

/** The choices for "Be ready to go deeper on": the story's own follow-ups, by what they are about. */
export function branchChoices(branches: Branch[]): { value: string; label: string }[] {
  return branches.map((b) => ({ value: b.kind, label: BRANCH_LABELS[b.kind] ? `${BRANCH_LABELS[b.kind]}: ${b.trigger.replace(/[?]+$/, "")}` : b.trigger }));
}

/** Where a story stands for a target on the Stories list: pinned, hidden, or neither. */
export function priorityFor(target: Pick<Target, "pinnedStoryIds" | "hiddenStoryIds"> | undefined, storyId: string): "pin" | "hide" | "none" {
  if (!target) return "none";
  if (target.pinnedStoryIds.includes(storyId)) return "pin";
  if (target.hiddenStoryIds.includes(storyId)) return "hide";
  return "none";
}
