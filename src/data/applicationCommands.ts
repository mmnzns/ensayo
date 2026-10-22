// The shapes the application commands take and return (src-tauri/src/application_commands.rs). Field names are the
// backend's: snake_case inside records, camelCase only where the Rust side renames (`postingText`, `lockedByStage`).

import type { ApplicationExtras, CueSheetData, QuestionType } from "./screens/applications";
import type { Application, ApplicationStatus, ClosedReason, Contact, StageId } from "./types";

/** An application with its extras: what almost every command returns, so one call replaces both on screen. */
export interface AppBundle {
  application: Application;
  extras: ApplicationExtras;
}

export interface NewApplicationInput {
  company: string;
  role?: string;
  status?: ApplicationStatus;
  closed_reason?: ClosedReason;
  /** "2026-10-06". */
  applied_on?: string;
  source?: string;
  contacts?: Contact[];
  notes?: string;
  startup?: boolean;
  /** Left out: the stages of the target (else the default four). */
  stages?: { stage: StageId; label?: string; at?: string }[];
  /** The target it is filed under. Left out: the active target. */
  targetId?: string;
}

/** Fields sent and different are saved and listed in `edited_by_user`. Closing needs a reason. */
export interface AppPatch {
  company?: string;
  role?: string;
  status?: ApplicationStatus;
  closed_reason?: ClosedReason;
  applied_on?: string;
  source?: string;
  contacts?: Contact[];
  notes?: string;
  startup?: boolean;
  /** Moves the application to another target. */
  targetId?: string;
  /** With a new `targetId`: make the question set again for that target (questions the person edited stay). */
  rebuildQuestions?: boolean;
  /** "Keep <target>" on the fit banner: the target to stop suggesting another for; "" clears it. */
  fitDismissedFor?: string;
}

/** One row of the whole stage list. A row without an id (or with one the process does not have) is a new stage. */
export interface StageInput {
  id?: string;
  stage: StageId;
  label: string;
  /** "2026-10-23T14:00", "2026-10-23", or left out. */
  at?: string | null;
}

export interface DeleteResult {
  kept_sessions: number;
  deleted_reps: number;
}

/** `needs_confirm`: the stages being removed have sessions; ask, then call again with the yes. */
export interface ProcessOutcome {
  status: "saved" | "needs_confirm";
  sessions: number;
  stage_ids: string[];
  bundle: AppBundle | null;
}

export interface PostingOutcome {
  changed: boolean;
  /** There is already a reading: ask "Read it again?". */
  has_analysis: boolean;
  bundle: AppBundle;
}

export interface JdResult {
  /** `ai`, `keywords`, or `unchanged`. */
  source: "ai" | "keywords" | "unchanged";
  /** Plain words when the engine did not do the reading. */
  notice: string | null;
  changed: string[];
  kept: string[];
  startup_turned_on: boolean;
  question_count: number;
}

export interface ReadResult {
  status: "read" | "no_text" | "unchanged";
  source: "ai" | "patterns";
  notice: string | null;
  changed: string[];
  kept: string[];
  claims: number;
  must_say_state: string;
}

export interface JdOutcome {
  result: JdResult;
  resume: ReadResult | null;
  bundle: AppBundle;
}

export interface AttachResult {
  /** `attached`, `needs_confirm` (one is already attached), `no_text` (paste the text), or `none`. */
  status: "attached" | "needs_confirm" | "no_text" | "none";
  reason: string | null;
  needs_paste: boolean;
  message: string | null;
  /** Resume lines the user fixed that were kept when the old resume's lines went. */
  kept_edited_claims: string[];
  text_chars: number;
}

export interface ResumeOutcome {
  attach: AttachResult | null;
  read: ReadResult | null;
  bundle: AppBundle;
}

export interface Analysis {
  summary: string;
  priorities: { title: string; detail: string }[];
  beliefs: { text: string; storyId: string | null; story: string; covered: boolean; why?: string }[];
  gaps: string[];
  echo: string[];
  company_stage?: string;
  stage_evidence?: string;
  unsaid?: string[];
}

export interface QuestionInput {
  /** Left out adds a question; an id changes that one. */
  id?: string;
  stage_id: string;
  text: string;
  kind: QuestionType;
}

export interface ClaimEdit {
  value?: string;
  quote?: string;
  subject?: string;
}

export type ClaimKind = "title" | "number" | "notice" | "reason_leaving" | "pay_range" | "why_company" | "result";

export interface ClaimInput {
  /** The backend's names for what a line is about. */
  type: string;
  subject: string;
  value: string;
  quote?: string;
  /** `resume`, or a stage id. */
  stage: string;
}

export interface LockInput {
  stageId: string;
  /** Beats, one per line. */
  opener: string;
  openerPrompt?: string;
  /** A story id from the bank. */
  powerStory: string;
  /** At most two. */
  questions: string[];
}

export type CueSheet = Required<Pick<CueSheetData, "openerBeats" | "power" | "said" | "reminders">> & CueSheetData;

/** What the After the interview screen sends (`NoteInput` in src-tauri/src/applications/interviews.rs). */
export interface InterviewNoteInput {
  stage_id: string;
  /** "2026-10-23"; left out means today. */
  held_on?: string;
  /** 1 to 5, or left out. */
  rating?: number | null;
  /** One question each. */
  asked: string[];
  worked: string;
  differently: string;
  spoke_to: string;
  next_step: string;
}
