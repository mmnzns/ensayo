// Picking the questions for a session from the private question bank (questions/*.json). Bank questions are
// pre-tagged, so no model is needed to classify them.

import general from "../../questions/general.json";
import lifecycle from "../../questions/pack-lifecycle-marketing-ops.json";
import type { Story } from "../data/types";

export interface BankQuestion {
  id: string;
  text: string;
  type: string;
  behavioral_situation: string | null;
  stages: string[];
  modes: string[];
  competencies: string[];
  great_eight: string[];
  commitment_check: boolean;
  builder_operator_check: boolean;
  difficulty: string;
  follow_up_angles: string[];
  founder_variant?: boolean;
  moment?: "opener" | "candidate_questions";
}

/** The general set, plus the role pack that fits the target role. */
export function banksFor(targetRole: string): BankQuestion[] {
  const packs = /lifecycle|crm|marketing|martech|automation|growth/i.test(targetRole) ? (lifecycle.questions as BankQuestion[]) : [];
  return [...(general.questions as BankQuestion[]), ...packs];
}

/** A small seeded generator so a session's order is stable and testable. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function shuffle<T>(items: T[], seed: number): T[] {
  const r = rng(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);

/** How well a story fits a question by shared competencies and theme words. */
export function storyFit(q: BankQuestion, s: Story): number {
  const comp = s.competencies.map((c) => c.toLowerCase());
  const shared = q.competencies.filter((c) => comp.includes(c.toLowerCase())).length;
  const themes = new Set(s.best_for.flatMap(words));
  const overlap = [...new Set([...words(q.text), ...q.competencies.flatMap(words)])].filter((w) => themes.has(w)).length;
  return shared * 3 + overlap;
}

export interface PickOptions {
  bank: BankQuestion[];
  stage: string;
  mode: "drill" | "mock";
  count: number;
  /** Ids already asked this session or recently; used only when nothing else is left. */
  seen?: Set<string>;
  /** The company is a startup: founder-variant questions are allowed in the leadership stage. */
  startup?: boolean;
  /** "One of your stories": ask what that story answers best. */
  story?: Story;
  seed?: number;
}

export function pickQuestions(o: PickOptions): BankQuestion[] {
  const pool = o.bank.filter(
    (q) =>
      q.stages.includes(o.stage) &&
      q.modes.includes(o.mode) &&
      q.moment !== "candidate_questions" &&
      (!q.founder_variant || (o.stage === "leadership" && o.startup === true)),
  );
  const fresh = pool.filter((q) => !o.seen?.has(q.id));
  const source = fresh.length >= o.count ? fresh : [...fresh, ...pool.filter((q) => o.seen?.has(q.id))];
  const story = o.story;
  const ranked = story ? [...source].sort((a, b) => storyFit(b, story) - storyFit(a, story) || a.id.localeCompare(b.id)) : shuffle(source, o.seed ?? 1);
  const openers = ranked.filter((q) => q.moment === "opener");
  const rest = ranked.filter((q) => q.moment !== "opener");
  return [...openers.slice(0, 1), ...rest, ...openers.slice(1)].slice(0, o.count);
}

/** A question the user typed. There is no tag for it, so it is treated as a story question. */
export function ownQuestion(text: string): BankQuestion {
  let h = 0;
  for (const ch of text.trim()) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return {
    id: `own-${h.toString(36)}`,
    text: text.trim(),
    type: "behavioral",
    behavioral_situation: null,
    stages: [],
    modes: ["drill"],
    competencies: [],
    great_eight: [],
    commitment_check: false,
    builder_operator_check: false,
    difficulty: "standard",
    follow_up_angles: [],
  };
}
