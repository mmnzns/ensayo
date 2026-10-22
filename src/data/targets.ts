// Pure helpers for targets (v0.1): names, colours, which stories a target uses, and how a posting fits. Nothing here
// touches the backend; the screens and the practice code call these.

import type { Application, Profile, RoleFamily, SellsTo, Story, Target, TargetColor, TargetFit, You } from "./types";

export const TARGET_COLORS: TargetColor[] = ["coral", "slate", "green", "gold", "plum"];

/** The marker colour as a CSS value (the boards use coral #B8432C and slate #3D4555). */
export const COLOR_VALUE: Record<TargetColor, string> = { coral: "#B8432C", slate: "#3D4555", green: "#3D6B56", gold: "#B4801A", plum: "#6B4A7A" };

/** Colours go out in order and repeat after five. */
export const colorFor = (index: number): TargetColor => TARGET_COLORS[((index % TARGET_COLORS.length) + TARGET_COLORS.length) % TARGET_COLORS.length];

const FAMILY_LABEL: Record<RoleFamily, string> = { lifecycle: "lifecycle", marketing_ops: "marketing ops", growth: "growth", product_marketing: "product marketing", other: "" };

/** The role words decide the family: "Senior Lifecycle Marketing Manager" is lifecycle, "Marketing Operations Manager" is marketing ops. */
export function roleFamilyOf(role: string): RoleFamily {
  const r = role.toLowerCase();
  if (/marketing ops|marketing operations|revops|revenue operations|martech/.test(r)) return "marketing_ops";
  if (/lifecycle|crm|retention|email marketing/.test(r)) return "lifecycle";
  if (/product marketing|pmm/.test(r)) return "product_marketing";
  if (/growth|acquisition|demand gen/.test(r)) return "growth";
  return "other";
}

/** "B2C lifecycle", "B2B marketing ops", "Both growth". With no known family the role itself is the name. */
export function targetName(role: string, sellsTo: SellsTo, family: RoleFamily = roleFamilyOf(role)): string {
  const who = sellsTo === "b2b" ? "B2B" : sellsTo === "b2c" ? "B2C" : "Both";
  const what = FAMILY_LABEL[family];
  return what ? `${who} ${what}` : role.trim() || "My target";
}

/** Hidden stories are never used for this target; pinned ones come first, in the order they were pinned. */
export function visibleStories(stories: Story[], target: Pick<Target, "pinnedStoryIds" | "hiddenStoryIds"> | undefined): Story[] {
  if (!target) return stories;
  const shown = stories.filter((s) => !target.hiddenStoryIds.includes(s.id));
  const pinned = target.pinnedStoryIds.flatMap((id) => shown.filter((s) => s.id === id));
  return [...pinned, ...shown.filter((s) => !target.pinnedStoryIds.includes(s.id))];
}

/** The story's angle for a target, when it has one. */
export const angleFor = (story: Story, targetId: string | undefined) => (targetId ? story.angles?.find((a) => a.target_id === targetId) : undefined);

/** The sentence a story opens with for a target: the angle's headline when there is one, else the story's own. */
export const openingFor = (story: Story, targetId: string | undefined): string => angleFor(story, targetId)?.headline.trim() || story.direct_answer;

/** The target an application is filed under; a missing id means the first target (the migrated one). */
export function applicationTarget(app: Pick<Application, "targetId">, targets: Target[]): Target | undefined {
  const live = targets.filter((t) => !t.archived);
  return targets.find((t) => t.id === app.targetId) ?? live[0] ?? targets[0];
}

/** Merged v0 view: the name and habits from `you`, the job fields from the target. */
export function mergedProfile(you: You | null, target: Target | undefined, previous?: Profile): Profile {
  return {
    name: you?.name ?? previous?.name ?? "",
    fullName: you?.fullName ?? previous?.fullName ?? "",
    targetRole: target?.role ?? previous?.targetRole ?? "",
    seniority: target?.seniority ?? previous?.seniority ?? "senior",
    industry: target?.industry ?? previous?.industry ?? "",
    sellsTo: target?.sellsTo ?? previous?.sellsTo ?? "both",
    identityStatement: target?.pitch ?? previous?.identityStatement ?? "",
    focusHabits: you?.focusHabits ?? previous?.focusHabits ?? [],
  };
}

/** Targets that can be picked: not archived, active one first. */
export function pickableTargets(targets: Target[], activeId: string | null | undefined): Target[] {
  const live = targets.filter((t) => !t.archived);
  return [...live.filter((t) => t.id === activeId), ...live.filter((t) => t.id !== activeId)];
}

/** One line for the banner: does another target fit this posting better than the one it is filed under? */
export function fitBanner(app: Pick<Application, "targetId" | "targetFit">, targets: Target[]): { suggested: Target | null; closest: Target | undefined; filed: Target | undefined; strongFit: boolean } | null {
  const fit: TargetFit | null | undefined = app.targetFit;
  if (!fit) return null;
  const filed = applicationTarget(app, targets);
  const best = fit.bestTargetId ? targets.find((t) => t.id === fit.bestTargetId && !t.archived) : undefined;
  const filedFit = fit.perTarget.find((p) => p.targetId === filed?.id)?.fit;
  const strongFit = filedFit === "strong" || (filedFit === "ok" && (!best || best.id === filed?.id));
  if (strongFit && (!best || best.id === filed?.id)) return null;
  const closest = best ?? [...targets.filter((t) => !t.archived)].sort((a, b) => rank(fit, b.id) - rank(fit, a.id))[0];
  return { suggested: best && best.id !== filed?.id ? best : null, closest, filed, strongFit };
}

const rank = (fit: TargetFit, id: string) => ({ strong: 3, ok: 2, weak: 1 })[fit.perTarget.find((p) => p.targetId === id)?.fit ?? "weak"];
