// Settings, Speech in the app: plain functions between what the backend reports (`speech_models`) and what the screen
// says. The screen talks to the backend; these decide what to show.

/** Speech models in the order Ensayo prefers them; the first one on this computer is used. */
export const SPEECH_MODELS = ["whisper-turbo", "parakeet-ultra", "whisper-small", "whisper-base", "whisper-tiny"];

export interface SpeechModelEntry {
  id: string;
  name: string;
  maker: string;
  note: string;
  languages: string;
  size_mb: number;
  /** "ready" is Ensayo's own copy, "on_this_computer" one another app downloaded. */
  state: "ready" | "on_this_computer" | "missing";
}

const here = (m: SpeechModelEntry) => m.state !== "missing";

/** The models a session tries, in order: the one chosen in Settings, then Ensayo's usual order. */
export function candidateModels(preferred: string): string[] {
  return preferred ? [preferred, ...SPEECH_MODELS.filter((id) => id !== preferred)] : [...SPEECH_MODELS];
}

/** The model a session will use, or "" when none is on this computer. Matches how a session picks it. */
export function inUseModel(models: SpeechModelEntry[], preferred: string): string {
  for (const id of candidateModels(preferred)) {
    const m = models.find((x) => x.id === id);
    if (m && here(m)) return id;
  }
  return "";
}

export interface ModelRow extends SpeechModelEntry {
  inUse: boolean;
  status: string;
  canUse: boolean;
  canDownload: boolean;
}

export function modelRows(models: SpeechModelEntry[], inUseId: string): ModelRow[] {
  return models.map((m) => {
    const inUse = m.id === inUseId;
    const status = inUse ? "In use" : m.state === "on_this_computer" ? "Found, from another app on this computer" : m.state === "ready" ? "Downloaded" : "Not downloaded";
    return { ...m, inUse, status, canUse: here(m) && !inUse, canDownload: m.state === "missing" };
  });
}

/** Megabytes of speech models on this computer, counting the ones another app downloaded. */
export const modelsSize = (models: SpeechModelEntry[]): number => models.filter(here).reduce((sum, m) => sum + m.size_mb, 0);

export const progressPercent = (fraction: number): number => Math.round(Math.min(1, Math.max(0, fraction || 0)) * 100);
