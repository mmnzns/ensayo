// Pure changes to you and the targets (v0.1). The app applies what the backend returns; the browser preview applies
// these in memory. Nothing here mutates its input.

import { colorFor, targetName, roleFamilyOf } from "./targets";
import type { Profile, StageId, Target, You } from "./types";

export interface TargetsState {
  you: You | null;
  targets: Target[];
  /** The one-time "you can now practice for more than one kind of job" note has not been dismissed. */
  notePending: boolean;
}

export const NO_TARGETS: TargetsState = { you: null, targets: [], notePending: false };

const DEFAULT_STAGES: StageId[] = ["recruiter", "hiring_manager", "technical", "panel"];

let counter = 0;
export const newTargetId = () => `tg_${Date.now().toString(36)}${(counter++).toString(36)}`;

/** A blank target with the next colour and the usual stages. */
export function blankTarget(existing: Target[], now = new Date()): Target {
  return {
    id: "",
    name: "",
    color: colorFor(existing.length),
    role: "",
    roleFamily: "other",
    seniority: "senior",
    industry: "",
    sellsTo: "both",
    companyStage: "any",
    pitch: "",
    leadWith: [],
    pinnedStoryIds: [],
    hiddenStoryIds: [],
    defaultProcess: [...DEFAULT_STAGES],
    baseResume: null,
    payRange: null,
    archived: false,
    createdAt: now.toISOString(),
  };
}

export const activeOf = (s: TargetsState): Target | undefined => s.targets.find((t) => t.id === s.you?.activeTargetId && !t.archived) ?? s.targets.find((t) => !t.archived);

/** A target saved: new ones (empty id) get an id, a name from the role when none was typed, and the next colour. */
export function saveTarget(s: TargetsState, target: Target): { state: TargetsState; saved: Target } {
  const isNew = target.id === "";
  const name = target.name.trim() || targetName(target.role, target.sellsTo, target.roleFamily === "other" ? roleFamilyOf(target.role) : target.roleFamily);
  const saved: Target = { ...target, id: isNew ? newTargetId() : target.id, name, leadWith: target.leadWith.map((p) => p.trim()).filter(Boolean).slice(0, 3), color: isNew ? colorFor(s.targets.length) : target.color };
  const targets = isNew ? [...s.targets, saved] : s.targets.map((t) => (t.id === saved.id ? saved : t));
  const you = s.you && !s.you.activeTargetId ? { ...s.you, activeTargetId: saved.id } : s.you;
  return { state: { ...s, targets, you }, saved };
}

export function duplicateTarget(s: TargetsState, id: string, name?: string): { state: TargetsState; saved: Target } {
  const from = s.targets.find((t) => t.id === id);
  if (!from) throw new Error("That target isn't here any more.");
  return saveTarget(s, { ...from, id: "", name: name ?? `${from.name} copy`, archived: false });
}

export function setActive(s: TargetsState, id: string): TargetsState {
  if (!s.targets.some((t) => t.id === id && !t.archived)) throw new Error("That target isn't available.");
  return { ...s, you: s.you ? { ...s.you, activeTargetId: id } : s.you };
}

export function setArchived(s: TargetsState, id: string, archived: boolean): TargetsState {
  const targets = s.targets.map((t) => (t.id === id ? { ...t, archived } : t));
  if (archived && targets.every((t) => t.archived)) throw new Error("Keep at least one target.");
  const active = s.you?.activeTargetId === id && archived ? targets.find((t) => !t.archived)?.id ?? null : s.you?.activeTargetId ?? null;
  return { ...s, targets, you: s.you ? { ...s.you, activeTargetId: active } : s.you };
}

export function setStoryPriority(s: TargetsState, targetId: string, storyId: string, priority: "pin" | "hide" | "none"): TargetsState {
  return {
    ...s,
    targets: s.targets.map((t) => {
      if (t.id !== targetId) return t;
      const pinned = t.pinnedStoryIds.filter((x) => x !== storyId);
      const hidden = t.hiddenStoryIds.filter((x) => x !== storyId);
      return { ...t, pinnedStoryIds: priority === "pin" ? [...pinned, storyId] : pinned, hiddenStoryIds: priority === "hide" ? [...hidden, storyId] : hidden };
    }),
  };
}

/** The v0 "save the profile": writes you, and the job fields of the active target (creating target 1 on the first save). */
export function applyProfile(s: TargetsState, p: Profile, now = new Date()): TargetsState {
  const you: You = { name: p.name, fullName: p.fullName, focusHabits: p.focusHabits, activeTargetId: s.you?.activeTargetId ?? null };
  const base: TargetsState = { ...s, you };
  const active = activeOf(base);
  const fields = { role: p.targetRole, seniority: p.seniority, industry: p.industry, sellsTo: p.sellsTo, pitch: p.identityStatement };
  if (!active) {
    const t = blankTarget([], now);
    return saveTarget(base, { ...t, ...fields, roleFamily: roleFamilyOf(p.targetRole), name: targetName(p.targetRole, p.sellsTo) }).state;
  }
  return { ...base, targets: base.targets.map((t) => (t.id === active.id ? { ...t, ...fields } : t)) };
}
