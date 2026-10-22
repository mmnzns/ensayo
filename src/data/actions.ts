// Pure changes to the user's own data (profile, stories, methods). The app applies each one after the backend has
// saved it; the browser preview applies them in memory. Nothing here mutates its input.

import type { AppBundle, AppPatch, NewApplicationInput, ProcessOutcome, QuestionInput, StageInput } from "./applicationCommands";
import { STAGE_DECIDES, STAGE_LABEL } from "../screens/applications/format";
import type { ApplicationExtras, PrepQuestion } from "./screens/applications";
import type { Application, ApplicationStatus, ClosedReason, Method, Profile, ProofPoint, StageId, Story } from "./types";

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

// ---------- applications ----------
// The applications and their extras, kept in one place. In the app every change comes back from the backend as a
// bundle (`applyBundle`); in the browser preview a few simple changes are made here in memory.

export interface AppsState {
  applications: Application[];
  /** By application id. */
  extras: Record<string, ApplicationExtras>;
}

export const EMPTY_EXTRAS: ApplicationExtras = { postingText: "", postingPastedOn: "", wasValues: {}, practicedByStage: {}, questions: [] };

/** Replaces an application and its extras with what a command returned; an application not seen before goes first. */
export function applyBundle(state: AppsState, bundle: AppBundle): AppsState {
  const id = bundle.application.id;
  const known = state.applications.some((a) => a.id === id);
  return {
    applications: known ? state.applications.map((a) => (a.id === id ? bundle.application : a)) : [bundle.application, ...state.applications],
    extras: { ...state.extras, [id]: bundle.extras },
  };
}

export function removeApplication(state: AppsState, id: string): AppsState {
  const { [id]: _gone, ...extras } = state.extras;
  return { applications: state.applications.filter((a) => a.id !== id), extras };
}

/** A rejected command as one plain line: Tauri rejects with the backend's own sentence. */
export function plainError(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  const text = raw.replace(/^Error:\s*/, "").trim();
  return text || "That didn't work. Nothing was changed. Try again.";
}

/** The sentence for an action the browser preview can't do. */
export const NEEDS_THE_APP = "This works in the Ensayo app. The browser preview only shows sample data.";

let appCounter = 0;
const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const DEFAULT_STAGES: StageId[] = ["recruiter", "hiring_manager", "panel", "leadership"];

/** A new application as the browser preview makes it: the four default stages unless some were given. */
export function mockApplication(input: NewApplicationInput, today: Date): AppBundle {
  appCounter += 1;
  const id = `app_${Date.now().toString(36)}${appCounter.toString(36)}`;
  const rows: { stage: StageId; label?: string; at?: string }[] = input.stages ?? DEFAULT_STAGES.map((stage) => ({ stage }));
  const status: ApplicationStatus = input.status ?? "applied";
  const application: Application = {
    id,
    company: input.company.trim(),
    role: (input.role ?? "").trim(),
    status,
    closed_reason: input.closed_reason ?? null,
    applied_on: input.applied_on || localDate(today),
    source: input.source ?? "",
    contacts: input.contacts ?? [],
    notes: input.notes ?? "",
    startup: !!input.startup,
    process: rows.map((r, i) => ({
      id: `${id}_stg_${i + 1}`,
      stage: r.stage,
      label: r.label || STAGE_LABEL[r.stage],
      order: i + 1,
      ...(r.at ? { at: r.at } : {}),
      done: false,
      decides: STAGE_DECIDES[r.stage],
      sessions: 0,
    })),
    current_stage_id: null,
    edited_by_user: [],
    resume: null,
    analysis: null,
    claims: [],
    answersPracticed: 0,
    no_resume: false,
  };
  return { application, extras: { ...EMPTY_EXTRAS } };
}

/** Changes core fields the way the backend does: a field that is sent and differs is saved, listed as edited, and
 *  remembers what it was. Closing needs a reason. Throws a plain sentence. */
export function patchApplication(bundle: AppBundle, patch: AppPatch): AppBundle {
  if (patch.company !== undefined && !patch.company.trim()) throw new Error("The company name can't be empty.");
  const a = bundle.application;
  const status = patch.status ?? a.status;
  const reason: ClosedReason | null = status === "closed" ? (patch.closed_reason ?? a.closed_reason) : null;
  if (status === "closed" && !reason) throw new Error("Say why it closed before closing it.");
  const next: Application = { ...a, edited_by_user: [...a.edited_by_user] };
  const was = { ...bundle.extras.wasValues };
  const mark = (field: string, old?: string) => {
    if (!next.edited_by_user.includes(field)) next.edited_by_user.push(field);
    if (old !== undefined && !(field in was)) was[field] = old;
  };
  const text = (field: "company" | "role" | "applied_on" | "source" | "notes", value: string | undefined) => {
    if (value === undefined) return;
    const v = field === "notes" ? value : value.trim();
    if (v !== next[field]) {
      const old = next[field];
      next[field] = v;
      mark(field, old);
    }
  };
  text("company", patch.company);
  text("role", patch.role);
  text("applied_on", patch.applied_on);
  text("source", patch.source);
  text("notes", patch.notes);
  if (status !== next.status) {
    const old = next.status;
    next.status = status;
    mark("status", old);
  }
  if (reason !== next.closed_reason) {
    const old = next.closed_reason ?? undefined;
    next.closed_reason = reason;
    if (reason) mark("closed_reason", old);
  }
  if (patch.contacts && JSON.stringify(patch.contacts) !== JSON.stringify(next.contacts)) {
    next.contacts = patch.contacts;
    mark("contacts");
  }
  if (patch.startup !== undefined && patch.startup !== next.startup) {
    const old = String(next.startup);
    next.startup = patch.startup;
    mark("startup", old);
  }
  return { application: next, extras: { ...bundle.extras, wasValues: was } };
}

/** The whole stage list, as the backend saves it: rows in order, new rows get new ids, rows left out are removed.
 *  Removing a stage that has sessions asks first. A date that changed remembers the one before it. */
export function mockSaveProcess(bundle: AppBundle, rows: StageInput[], confirm: boolean): ProcessOutcome {
  const a = bundle.application;
  const keep = rows.map((r) => r.id).filter((id): id is string => !!id && a.process.some((p) => p.id === id));
  const withSessions = a.process.filter((p) => !keep.includes(p.id) && p.sessions > 0);
  if (withSessions.length > 0 && !confirm) {
    return { status: "needs_confirm", sessions: withSessions.reduce((n, p) => n + p.sessions, 0), stage_ids: withSessions.map((p) => p.id), bundle: null };
  }
  let n = a.process.reduce((m, p) => Math.max(m, Number(/(\d+)$/.exec(p.id)?.[1] ?? 0)), 0);
  const process = rows.map((r, i) => {
    const old = a.process.find((p) => p.id === r.id);
    const at = r.at || undefined;
    const moved = old?.at && old.at !== at ? [...(old.previous_at ?? []), old.at] : old?.previous_at;
    n += old ? 0 : 1;
    return {
      id: old?.id ?? `${a.id}_stg_${n}`,
      stage: r.stage,
      label: r.label.trim() || STAGE_LABEL[r.stage],
      order: i + 1,
      ...(at ? { at } : {}),
      done: old?.done ?? false,
      ...(moved && moved.length ? { previous_at: moved } : {}),
      decides: STAGE_DECIDES[r.stage],
      sessions: old?.sessions ?? 0,
      ...(old?.note ? { note: old.note } : {}),
    };
  });
  const gone = new Set(a.process.filter((p) => !keep.includes(p.id)).map((p) => p.id));
  const extras = { ...bundle.extras, questions: bundle.extras.questions.filter((q) => !gone.has(q.stageId)) };
  return { status: "saved", sessions: 0, stage_ids: [], bundle: { application: { ...a, process }, extras } };
}

/** The stage list as save rows, for the commands that change one thing about it. */
export function stageRows(a: Application): StageInput[] {
  return [...a.process].sort((x, y) => x.order - y.order).map((p) => ({ id: p.id, stage: p.stage, label: p.label, at: p.at ?? null }));
}

export function mockSetStageDone(bundle: AppBundle, stageId: string, done: boolean): AppBundle {
  const a = bundle.application;
  return { ...bundle, application: { ...a, process: a.process.map((p) => (p.id === stageId ? { ...p, done } : p)) } };
}

/** Adds a question (no id) or changes one. Either way it is the user's. */
export function mockSaveQuestion(bundle: AppBundle, input: QuestionInput): AppBundle {
  const text = input.text.trim();
  if (!text) throw new Error("Write the question first.");
  const questions: PrepQuestion[] = bundle.extras.questions;
  const mine = { stageId: input.stage_id, type: input.kind, text, editedByUser: true, source: "user" };
  if (input.id && questions.some((q) => q.id === input.id)) {
    return { ...bundle, extras: { ...bundle.extras, questions: questions.map((q) => (q.id === input.id ? { ...q, ...mine } : q)) } };
  }
  const n = questions.reduce((m, q) => Math.max(m, Number(/(\d+)$/.exec(q.id)?.[1] ?? 0)), 0) + 1;
  return { ...bundle, extras: { ...bundle.extras, questions: [...questions, { id: `q_${n}`, ...mine }] } };
}

export function mockDeleteQuestion(bundle: AppBundle, questionId: string): AppBundle {
  return { ...bundle, extras: { ...bundle.extras, questions: bundle.extras.questions.filter((q) => q.id !== questionId) } };
}
