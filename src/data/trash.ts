// Deleting history with a way back: a deleted session waits in the trash for seven days. These are the shapes the
// Rust commands return (`trashed_sessions`, `delete_application_practice`) and the plain helpers the screens and the
// browser preview share. No React here.

import type { SessionSummary } from "./types";
import { STAGE_LABELS } from "../practice/habits";

export const KEEP_DAYS = 7;
const DAY = 86_400_000;

/** What `trashed_sessions` returns for each session in the trash. */
export interface TrashedSession {
  id: string;
  /** RFC 3339, UTC. */
  deleted_at: string;
  started: string;
  stage: string;
  application_id: string | null;
  /** How many answers it has. */
  reps: number;
}

/** What `delete_application_practice` returns. */
export interface PracticeDeleted {
  sessions: number;
  reps: number;
}

export const GONE_LINE = "That session was deleted";
export const NO_LONGER_HERE = "That session is no longer here";
export const LIVE_BLOCK = "That session is still going. Finish it first, then you can delete it.";

/** The line at the end of the Sessions list while the trash has anything. */
export const recentlyDeletedLine = (count: number): string => `Recently deleted (${count})`;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The dialog before one session goes: what goes with it and what stays. */
export function deleteSessionText(answers: number): string {
  const what = answers > 0 ? `Its ${plural(answers, "answer")} and recordings go too.` : "Its answers and recordings go too.";
  return `Delete this session? ${what} Answers you labelled for the eval set stay in the eval folder.`;
}

/** The dialog before all of an application's practice goes. */
export function deletePracticeText(company: string, sessions: number, answers: number): string {
  const counts = answers > 0 ? `${plural(sessions, "session")}, ${plural(answers, "answer")} and recordings` : `${plural(sessions, "session")} and recordings`;
  return `Delete ${company}'s practice? Its ${counts} go too. Answers you labelled for the eval set stay in the eval folder.`;
}

/** After the delete: where the person can undo it. */
export const restoreHint = (count: number): string => `You have ${KEEP_DAYS} days to restore ${count === 1 ? "it" : "them"} from Progress, Sessions.`;

/** At the end of the Recently deleted list. */
export const TRASH_NOTE = `Deleted sessions are kept for ${KEEP_DAYS} days, then they go for good.`;

/** "kept until Oct 29": the last day a trashed session can come back. */
export function keptUntil(deletedAt: string): string {
  const d = new Date(new Date(deletedAt).getTime() + KEEP_DAYS * DAY);
  return `kept until ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

/** "Recruiter · Kestrel Pay", or "Recruiter · general questions" for practice outside an application. */
export function trashedTitle(t: TrashedSession, companyOf: (applicationId: string) => string | undefined): string {
  const stage = STAGE_LABELS[t.stage] ?? t.stage;
  const company = t.application_id ? companyOf(t.application_id) : undefined;
  return `${stage} · ${company ?? "general questions"}`;
}

/** What the live practice is, as far as deleting goes. */
export interface LiveFacts {
  active: boolean;
  sessionId: string | null;
  applicationId: string | null;
}

/** A plain line when the thing to delete is being practised right now, else null. */
export function liveBlock(live: LiveFacts, target: { sessionId: string } | { applicationId: string }): string | null {
  if (!live.active) return null;
  if ("sessionId" in target) return live.sessionId === target.sessionId ? LIVE_BLOCK : null;
  return live.applicationId === target.applicationId ? "You're practising for this application right now. Finish that session first." : null;
}

/** How many of a session's answers there are in the history (follow-ups are not answers). */
export function answersIn(reps: { session_id: string; follow_up: boolean }[], sessionId: string): number {
  return reps.filter((r) => r.session_id === sessionId && !r.follow_up).length;
}

// ---------- the browser preview: the sample sessions, trashed and restored in memory ----------

/** Puts sample sessions in the trash (the ones in `ids`). */
export function previewTrash(trashed: TrashedSession[], sessions: SessionSummary[], ids: string[], now: Date): TrashedSession[] {
  const rows = sessions
    .filter((s) => ids.includes(s.id) && !trashed.some((t) => t.id === s.id))
    .map((s): TrashedSession => ({ id: s.id, deleted_at: now.toISOString(), started: now.toISOString(), stage: (s.title.split(" · ")[0] ?? "").toLowerCase().replace(/ /g, "_"), application_id: s.applicationId ?? null, reps: 0 }));
  return [...rows, ...trashed];
}

/** Takes one session out of the trash; says so when it is not there. */
export function previewRestore(trashed: TrashedSession[], id: string): TrashedSession[] {
  if (!trashed.some((t) => t.id === id)) throw new Error(NO_LONGER_HERE);
  return trashed.filter((t) => t.id !== id);
}
