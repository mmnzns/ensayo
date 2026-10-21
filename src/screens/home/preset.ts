import type { Mode, StageId } from "../../data/types";

export type SessionSource = "application" | "stage" | "story" | "own";

/** What Home's buttons ask the Start a session sheet to open with (nothing persists; read once when the sheet mounts). */
export interface SessionPreset {
  mode?: Mode;
  source?: SessionSource;
  stage?: StageId;
}

let preset: SessionPreset | null = null;

export const setSessionPreset = (p: SessionPreset) => {
  preset = p;
};
export const peekSessionPreset = (): SessionPreset => preset ?? {};
export const clearSessionPreset = () => {
  preset = null;
};
