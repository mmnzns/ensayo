import type { Mode, StageId } from "../../data/types";

export type SessionSource = "application" | "stage" | "story" | "own";

/** What Home's buttons ask the Start a session sheet to open with (nothing persists; read once when the sheet mounts). */
export interface SessionPreset {
  mode?: Mode;
  source?: SessionSource;
  stage?: StageId;
  /** With source "story": which story to practise (the target editor's "Practice it"). */
  storyId?: string;
  /** With source "application": which application to practise, and which of its stages (a stage may repeat). Without them, the nearest interview. */
  applicationId?: string;
  stageId?: string;
}

let preset: SessionPreset | null = null;

export const setSessionPreset = (p: SessionPreset) => {
  preset = p;
};
export const peekSessionPreset = (): SessionPreset => preset ?? {};
export const clearSessionPreset = () => {
  preset = null;
};

let blocked: { applicationId: string; stageId: string } | null = null;

/** The application the sheet could not start from (no posting, no questions yet), so the next sheet can name it. Not cleared when the sheet closes. */
export const rememberBlocked = (applicationId: string, stageId: string) => {
  blocked = { applicationId, stageId };
};
export const peekBlocked = () => blocked;
