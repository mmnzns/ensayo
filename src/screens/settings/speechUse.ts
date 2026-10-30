import { invoke } from "@tauri-apps/api/core";

/** Tells the app which speech model Ensayo uses, so another Craft Concepts app deleting it leaves it on this computer.
 *  Said once at start and again whenever a model is picked. Best effort: outside the app there is nobody to tell. */
export function noteSpeechModelUse(id: string): void {
  if (!id) return;
  try {
    invoke("use_speech_model", { id }).catch(() => {});
  } catch {
    // no backend (a browser preview)
  }
}
