// Picking the questions for a session from the private question bank (questions/*.json). Bank questions are
// pre-tagged, so no model is needed to classify them.

import general from "../../questions/general.json";
import { roleFamilyOf } from "../data/targets";
import type { RoleFamily, Story, Target } from "../data/types";

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
  /** An application's own question can name the story that answers it best; that story is measured first. */
  best_story_id?: string | null;
}

// Question packs by kind of role (a target's `roleFamily`). The general set is always asked. A pack is a file in
// questions/ named below; one that does not exist yet adds nothing. Today only the lifecycle pack exists, so marketing
// ops, growth, product marketing and other roles get the general set until Opus drafts their packs. Drop the file in
// questions/ and the pack starts to apply, with no code change.
const PACK_FILE: Partial<Record<RoleFamily, string>> = {
  lifecycle: "pack-lifecycle-marketing-ops",
  marketing_ops: "pack-lifecycle-marketing-ops",
  growth: "pack-growth",
  product_marketing: "pack-product-marketing",
};
const PACK_FILES = import.meta.glob<{ questions: BankQuestion[] }>("../../questions/pack-*.json", { eager: true, import: "default" });
const packFor = (family: RoleFamily): BankQuestion[] => {
  const file = PACK_FILE[family];
  return (file && PACK_FILES[`../../questions/${file}.json`]?.questions) || [];
};

/** How many questions the pack for this kind of role adds to the general set; 0 while its file does not exist. */
export const packSize = (family: RoleFamily): number => packFor(family).length;

/** The general set, plus the pack that fits the target's kind of role. A role in words (the v0 profile) is read for its kind. */
export function banksFor(target: string | Pick<Target, "roleFamily">): BankQuestion[] {
  const family = typeof target === "string" ? roleFamilyOf(target) : target.roleFamily;
  return [...(general.questions as BankQuestion[]), ...packFor(family)];
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

/** The interviewer's closing "what questions do you have for me?" for a stage. Its type is the Mock's own-questions moment, which is judged together at the end rather than as an answer. */
export function pickClosing(bank: BankQuestion[], stage: string, seed = 1): BankQuestion | undefined {
  const pool = bank.filter((q) => q.moment === "candidate_questions" && q.stages.includes(stage) && q.modes.includes("mock") && !q.founder_variant);
  if (pool.length === 0) return undefined;
  const q = shuffle(pool, seed)[0];
  return { ...q, type: "candidate_questions" };
}

/** A question the user typed. Nobody tagged it, so its type is empty and the engine classifies it on the first answer. */
export function ownQuestion(text: string): BankQuestion {
  let h = 0;
  for (const ch of text.trim()) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return {
    id: `own-${h.toString(36)}`,
    text: text.trim(),
    type: "",
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

/** One question of an application's question set, as the backend lists it (`ExtrasView.questions`). */
export interface ExtraQuestion {
  id: string;
  /** The application's process stage this question belongs to. */
  stageId: string;
  /** The screens' names: `about_you` and `future` stand for `tell_me_about_yourself` and `future_looking`. */
  type: string;
  text: string;
  bestStoryId?: string | null;
  behavioralSituation?: string | null;
  commitmentCheck?: boolean;
  builderOperatorCheck?: boolean;
}

const ENGINE_TYPE: Record<string, string> = { about_you: "tell_me_about_yourself", future: "future_looking" };

/** An application question as a bank question, so the rest of the practice loop treats both the same way. `stageType` is the stage kind (`recruiter`...). */
export function bankQuestionFromExtra(e: ExtraQuestion, stageType: string): BankQuestion {
  return {
    id: e.id,
    text: e.text.trim(),
    type: ENGINE_TYPE[e.type] ?? e.type,
    behavioral_situation: e.behavioralSituation || null,
    stages: [stageType],
    modes: ["drill", "mock"],
    competencies: [],
    great_eight: [],
    commitment_check: e.commitmentCheck === true,
    builder_operator_check: e.builderOperatorCheck === true,
    difficulty: "standard",
    follow_up_angles: [],
    best_story_id: e.bestStoryId || null,
  };
}

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export interface ApplicationPickOptions {
  bank: BankQuestion[];
  /** The application's question set; undefined while it has not loaded, or in the browser preview. */
  extras?: ExtraQuestion[];
  /** The process stage being practised, and its kind. */
  stageId?: string | null;
  stage: string;
  mode: "drill" | "mock";
  count: number;
  startup?: boolean;
  seed?: number;
}

/** The questions for a session inside an application: that stage's own questions first, in the order they are kept, then the bank to make up the count. */
export function pickApplicationQuestions(o: ApplicationPickOptions): BankQuestion[] {
  const own = (o.extras ?? [])
    .filter((e) => e.stageId === o.stageId && e.text.trim() !== "")
    .map((e) => bankQuestionFromExtra(e, o.stage))
    .slice(0, o.count);
  if (own.length >= o.count) return own;
  const fill = pickQuestions({ bank: o.bank, stage: o.stage, mode: o.mode, count: o.count + own.length, startup: o.startup, seed: o.seed ?? 1 }).filter((q) => !own.some((x) => sameText(x.text, q.text)));
  return [...own, ...fill].slice(0, o.count);
}
