// Targets on the application screens (v0.1): which target a new application starts under, how the list filters,
// and how the "this posting fits another target" banner and the per-target reading are worded. Pure; the screens
// call these and the data layer holds the truth.

import { applicationTarget, fitBanner, pickableTargets, roleFamilyOf, targetName } from "../../data/targets";
import type { Application, FitLevel, RoleFamily, SellsTo, StageId, Target, TargetFit } from "../../data/types";

const B2B_WORDS = /\b(b2b|saas|enterprise|business customers|sales teams?|finance teams?|mid-size companies|other businesses)\b/i;
const B2C_WORDS = /\b(b2c|consumers?|subscribers?|shoppers?|app users?|everyday people)\b/i;

/** Who a typed role and posting say the company sells to, when they say. */
export function sellsToFrom(text: string): SellsTo | null {
  const b2b = B2B_WORDS.test(text);
  const b2c = B2C_WORDS.test(text);
  if (b2b && !b2c) return "b2b";
  if (b2c && !b2b) return "b2c";
  return null;
}

/** The target a new application starts under. With nothing to go on it is the active target; the role typed (and the
 *  posting, once pasted) can point at another one. `touched` pickers are never changed by this: the caller checks. */
export function suggestTarget(role: string, posting: string, targets: Target[], activeId: string | null | undefined): string | null {
  const live = pickableTargets(targets, activeId);
  if (live.length === 0) return null;
  const family = roleFamilyOf(role);
  const kind = sellsToFrom(`${role} ${posting}`);
  let best = live[0];
  let bestScore = -1;
  for (const t of live) {
    let score = 0;
    if (family !== "other" && t.roleFamily === family) score += 3;
    if (kind && t.sellsTo === kind) score += 2;
    else if (kind && t.sellsTo === "both") score += 1;
    // The active target is first in the list, so it keeps a tie.
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best.id;
}

const DEFAULT_STAGES: StageId[] = ["recruiter", "hiring_manager", "technical", "panel"];

/** The stages a new application starts with: the target's usual process, or the usual four when it has none. */
export const stagesFor = (target: Pick<Target, "defaultProcess"> | undefined): StageId[] => (target && target.defaultProcess.length > 0 ? [...target.defaultProcess] : [...DEFAULT_STAGES]);

/** Applications under one target, or all of them. A missing target id on an application means the first target. */
export function filterByTarget(apps: Application[], targets: Target[], targetId: string | "all"): Application[] {
  if (targetId === "all") return apps;
  return apps.filter((a) => applicationTarget(a, targets)?.id === targetId);
}

/** The targets to filter by: the live ones, plus any archived one an application is still filed under. */
export function filterChoices(apps: Application[], targets: Target[]): Target[] {
  const used = new Set(apps.map((a) => applicationTarget(a, targets)?.id));
  return targets.filter((t) => !t.archived || used.has(t.id));
}

const KIND: Record<SellsTo, string> = { b2b: "B2B", b2c: "B2C", both: "both B2B and B2C" };
const FAMILY: Record<RoleFamily, string> = { lifecycle: "a lifecycle role", marketing_ops: "a marketing ops role", growth: "a growth role", product_marketing: "a product marketing role", other: "a different kind of role" };

export interface FitNote {
  /** "This posting is B2B. It's filed under B2C lifecycle." */
  headline: string;
  body: string;
  suggested: Target | null;
  closest: Target | undefined;
  filed: Target | undefined;
}

/** The banner on the application page, or null when the target it is filed under fits (or the posting has not been read). */
export function fitNote(app: Pick<Application, "targetId" | "targetFit" | "company">, targets: Target[]): FitNote | null {
  const b = fitBanner(app, targets);
  const fit = app.targetFit;
  if (!b || !fit) return null;
  const filedName = b.filed?.name ?? "your target";
  const differentBuyer = !!b.filed && fit.sellsTo !== "both" && b.filed.sellsTo !== "both" && b.filed.sellsTo !== fit.sellsTo;
  const what = differentBuyer ? KIND[fit.sellsTo] : b.filed && b.filed.roleFamily !== fit.roleFamily ? FAMILY[fit.roleFamily] : KIND[fit.sellsTo];
  const notes = fit.mismatchNotes.map((n) => n.trim()).filter(Boolean).join(" ");
  const tail = b.suggested ? `Your ${b.suggested.name} target fits better: its pitch, questions and lead stories match this job.` : "None of your targets fits this posting closely. You can make a new one from it.";
  return { headline: `This posting is ${what}. It's filed under ${filedName}.`, body: [notes, tail].filter(Boolean).join(" "), suggested: b.suggested, closest: b.closest, filed: b.filed };
}

export const FIT_LABEL: Record<FitLevel, string> = { strong: "Strong fit", ok: "Okay fit", weak: "Weak fit" };

/** The badge class for a fit, in the design's own classes. */
export const fitClass = (fit: FitLevel): string => (fit === "strong" ? "e-badge e-badge-ok" : fit === "ok" ? "e-pill" : "e-badge");

/** "How each target reads this posting": one row per live target the reading mentions, in the targets' own order. */
export function fitRows(fit: TargetFit | null | undefined, targets: Target[]): { target: Target; fit: FitLevel; why: string }[] {
  if (!fit) return [];
  return targets
    .filter((t) => !t.archived)
    .flatMap((t) => {
      const p = fit.perTarget.find((x) => x.targetId === t.id);
      return p ? [{ target: t, fit: p.fit, why: p.why }] : [];
    });
}

/** Whether changing an application's target should ask about rebuilding its question set: the target changed and a set exists. */
export const asksToRebuild = (app: Pick<Application, "targetId" | "analysis">, questionCount: number, nextTargetId: string, targets: Target[]): boolean =>
  applicationTarget(app, targets)?.id !== nextTargetId && (questionCount > 0 || app.analysis !== null);

/** The hint under the picker on New application. */
export const PICKER_HINT = "Suggested from the role you typed. Once Ensayo reads the posting, it tells you if another target fits better.";

/** "Started from B2C lifecycle's usual stages. Use the arrows to reorder. Add dates as you get them." */
export const stagesLine = (target: Pick<Target, "name"> | undefined, touched: boolean): string =>
  target && !touched ? `Started from ${target.name}'s usual stages. Use the arrows to reorder. Add dates as you get them.` : "In the order you'll meet them. Use the arrows to reorder. Add dates as you get them.";

// ---------- a new target from a posting ----------

/** The target that reads closest to the posting: the best fit, else the best ranked, else the one it is filed under. */
export function closestTarget(app: Pick<Application, "targetId" | "targetFit">, targets: Target[]): Target | undefined {
  const fit = app.targetFit;
  const live = targets.filter((t) => !t.archived);
  const best = fit?.bestTargetId ? live.find((t) => t.id === fit.bestTargetId) : undefined;
  if (best) return best;
  if (fit) {
    const rank = (id: string) => ({ strong: 3, ok: 2, weak: 1 })[fit.perTarget.find((p) => p.targetId === id)?.fit ?? "weak"];
    const ranked = [...live].sort((a, b) => rank(b.id) - rank(a.id));
    if (ranked[0]) return ranked[0];
  }
  return applicationTarget(app, targets);
}

/** What the browser preview shows for "Make a new target from this posting" (the app asks the backend). Nothing is written
 *  for the person: the pitch is the closest target's, copied, and the screen says it needs rewriting. */
export function draftFromPosting(app: Pick<Application, "role" | "startup" | "targetId" | "targetFit">, targets: Target[], blank: Target): { target: Target; pitchCopied: boolean } {
  const closest = closestTarget(app, targets);
  const fit = app.targetFit;
  const sellsTo = fit?.sellsTo ?? closest?.sellsTo ?? "both";
  const roleFamily = fit?.roleFamily ?? roleFamilyOf(app.role);
  const role = app.role.trim() || closest?.role || "";
  const target: Target = {
    ...blank,
    role,
    roleFamily,
    seniority: fit?.seniority ?? closest?.seniority ?? blank.seniority,
    sellsTo,
    industry: closest?.industry ?? "",
    companyStage: app.startup ? "startup" : (closest?.companyStage ?? "any"),
    defaultProcess: stagesFor(closest),
    pitch: closest?.pitch ?? "",
    name: targetName(role, sellsTo, roleFamily),
  };
  return { target, pitchCopied: !!closest?.pitch.trim() };
}

/** True while the pitch is still the copied one (or empty): the screen asks the person to write their own before saving. */
export const pitchNeedsWork = (pitch: string, copied: string): boolean => pitch.trim() === "" || pitch.trim() === copied.trim();

export const SENIORITY_LABEL: Record<Target["seniority"], string> = { early: "Early career", mid: "Mid-level", senior: "Senior", lead: "Lead or manager", director: "Director" };
export const SELLS_TO_LABEL: Record<SellsTo, string> = { b2b: "Businesses (B2B)", b2c: "Consumers (B2C)", both: "Both" };
