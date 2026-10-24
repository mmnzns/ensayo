// Settings, You and the target editor: what, if anything, to save for what is on screen. Pure, so the screens only call
// these and then `saveYou` or `saveTarget`.

import { roleFamilyOf, targetName } from "../../data/targets";
import type { CompanyStage, HabitId, RoleFamily, SellsTo, Seniority, StageId, Target, You } from "../../data/types";
import { NAME_PROBLEM, osOf, ROLE_PROBLEM } from "../first-run/setup";

export const SAVE_FAILED = "That change didn't save. Ensayo will try again when you change something else.";

// ---------- You ----------

export interface YouFields {
  name: string;
  focus: HabitId[];
}

export type YouSave = { kind: "same" } | { kind: "problem"; name: string } | { kind: "save"; you: You };

/** Up to two focus habits: picking a third lets go of the one picked first. */
export const MAX_FOCUS = 2;

export function youToSave(saved: You, f: YouFields): YouSave {
  if (!f.name.trim()) return { kind: "problem", name: NAME_PROBLEM };
  const next: You = { ...saved, name: f.name.trim(), focusHabits: f.focus.slice(-MAX_FOCUS) };
  return JSON.stringify(next) === JSON.stringify(saved) ? { kind: "same" } : { kind: "save", you: next };
}

// ---------- Target ----------

export const MAX_LEAD_WITH = 3;
export const PAY_PROBLEM = "Add both ends of the pay range, from low to high, or leave both empty.";

export interface TargetFields {
  name: string;
  role: string;
  roleFamily: RoleFamily;
  seniority: Seniority;
  industry: string;
  sellsTo: SellsTo;
  companyStage: CompanyStage;
  pitch: string;
  leadWith: string[];
  defaultProcess: StageId[];
  baseResume: Target["baseResume"];
  /** As typed: "$115,000". */
  payLow: string;
  payHigh: string;
  currency: string;
}

export type TargetSave = { kind: "same" } | { kind: "problem"; role?: string; pay?: string } | { kind: "save"; target: Target };

/** An amount as typed ("$115,000", "115000") to a number, or null when there is none. */
export function parsePay(text: string): number | null {
  const digits = text.replace(/[^0-9.]/g, "");
  const n = Number.parseFloat(digits);
  return digits === "" || Number.isNaN(n) ? null : Math.round(n);
}

const SYMBOL: Record<string, string> = { USD: "$", CAD: "$", AUD: "$", EUR: "€", GBP: "£" };

/** "$115,000". The currency code only picks the symbol; the screen shows the code beside it. */
export const formatPay = (amount: number, currency: string): string => `${SYMBOL[currency] ?? ""}${amount.toLocaleString("en-US")}`;

/** The target to save over `saved`, which keeps what the form does not show (colour, pinned and hidden stories, archive state). */
export function targetToSave(saved: Target, f: TargetFields): TargetSave {
  if (!f.role.trim()) return { kind: "problem", role: ROLE_PROBLEM };
  const low = parsePay(f.payLow);
  const high = parsePay(f.payHigh);
  if ((low === null) !== (high === null) || (low !== null && high !== null && low > high)) return { kind: "problem", pay: PAY_PROBLEM };
  const family = f.roleFamily === "other" ? roleFamilyOf(f.role) : f.roleFamily;
  const next: Target = {
    ...saved,
    name: f.name.trim() || targetName(f.role, f.sellsTo, family),
    role: f.role.trim(),
    roleFamily: f.roleFamily,
    seniority: f.seniority,
    industry: f.industry.trim(),
    sellsTo: f.sellsTo,
    companyStage: f.companyStage,
    pitch: f.pitch.trim(),
    leadWith: f.leadWith.map((p) => p.trim()).filter(Boolean).slice(0, MAX_LEAD_WITH),
    defaultProcess: f.defaultProcess,
    baseResume: f.baseResume,
    payRange: low !== null && high !== null ? { low, high, currency: f.currency } : null,
  };
  return JSON.stringify(next) === JSON.stringify(saved) ? { kind: "same" } : { kind: "save", target: next };
}

// ---------- stages and resume ----------

const ALL_STAGES: StageId[] = ["recruiter", "hiring_manager", "technical", "panel", "leadership"];

export const addStage = (stages: StageId[], stage: StageId): StageId[] => (stages.includes(stage) ? stages : [...stages, stage]);
export const removeStage = (stages: StageId[], stage: StageId): StageId[] => stages.filter((s) => s !== stage);
/** The stages not yet in the list, in the usual order. */
export const stageChoices = (stages: StageId[]): StageId[] => ALL_STAGES.filter((s) => !stages.includes(s));

/** Path placeholders show this computer's kind of path. */
export const onWindows = (): boolean => osOf(typeof navigator === "undefined" ? "" : navigator.userAgent) === "windows";

/** A path as pasted: trimmed, and without the quotes Windows' "Copy as path" puts around it. */
export const pastedPath = (text: string): string => text.trim().replace(/^(["'])(.*)\1$/, "$2").trim();

/** The file name at the end of a path from either kind of computer. */
export const fileNameOf = (path: string): string => pastedPath(path).split(/[\\/]/).pop() ?? "";

/** Ensayo reads PDF and Word files. */
export const isResumeFileName = (name: string): boolean => /\.(pdf|docx?)$/i.test(name.trim());
export const RESUME_PROBLEM = "Ensayo reads PDF and Word files. Choose one of those.";
