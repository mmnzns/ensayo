// Settings, Speech in the app: plain functions between what the backend reports (`speech_models`) and what the screen
// says. The screen talks to the backend; these decide what to show.

import { osOf, type Os } from "../first-run/setup";

/** Speech models in the order Ensayo prefers them; the first one on this computer is used. Windows starts with
 *  Parakeet Ultra: with no graphics chip to run Whisper Turbo, a two-minute answer waited about a minute for it,
 *  against a few seconds for Parakeet Ultra at the same accuracy (decided 2026-10-24). The Mac keeps Turbo. Matches
 *  the backend's `models::DEFAULT_MODEL`. */
export function speechOrder(os: Os): string[] {
  return os === "windows"
    ? ["parakeet-ultra", "whisper-turbo", "whisper-small", "whisper-base", "whisper-tiny"]
    : ["whisper-turbo", "parakeet-ultra", "whisper-small", "whisper-base", "whisper-tiny"];
}

export const SPEECH_MODELS = speechOrder(osOf(typeof navigator === "undefined" ? "" : navigator.userAgent));

export interface SpeechModelEntry {
  id: string;
  name: string;
  maker: string;
  note: string;
  languages: string;
  size_mb: number;
  /** One of Ensayo's own picks. The rest sit behind "Show all models". */
  recommended?: boolean;
  /** "ready" is Ensayo's own copy, "on_this_computer" one another app downloaded. "partial" is an interrupted download, "downloading" one running here and "downloading_elsewhere" one another app is running; none of those three can be used yet. */
  state: "ready" | "on_this_computer" | "missing" | "partial" | "downloading" | "downloading_elsewhere";
  /** How much is on disk, for "partial" and the two "downloading" states. */
  fraction?: number;
}

const here = (m: SpeechModelEntry) => m.state === "ready" || m.state === "on_this_computer";

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
  /** "Download" for a model with nothing on disk, "Resume" for an interrupted one; null when neither applies. */
  fetch: "Download" | "Resume" | null;
  /** Another Craft Concepts app is downloading it: Ensayo waits for it. */
  elsewhere: boolean;
  /** Downloading here (this app's own download, running now). */
  downloadingHere: boolean;
  /** Completely on this computer, so it can be deleted. */
  canDelete: boolean;
}

const percentOf = (fraction: number | undefined) => progressPercent(fraction ?? 0);

/** `downloadingId` is the model this window is downloading now; the backend also says "downloading" for a download that is running here. */
export function modelRows(models: SpeechModelEntry[], inUseId: string, downloadingId: string | null = null): ModelRow[] {
  return models.map((m) => {
    const inUse = m.id === inUseId;
    const downloadingHere = m.state === "downloading" || m.id === downloadingId;
    const elsewhere = m.state === "downloading_elsewhere";
    const status = inUse
      ? "In use"
      : downloadingHere
        ? "Downloading"
        : elsewhere
          ? "Another Craft Concepts app is downloading it"
          : m.state === "partial"
            ? `Partly downloaded, ${percentOf(m.fraction)}%`
            : m.state === "on_this_computer"
              ? "Found, from another app on this computer"
              : m.state === "ready"
                ? "Downloaded"
                : "Not downloaded";
    return {
      ...m,
      inUse,
      status,
      canUse: here(m) && !inUse,
      fetch: downloadingHere || elsewhere ? null : m.state === "missing" ? "Download" : m.state === "partial" ? "Resume" : null,
      elsewhere,
      downloadingHere,
      canDelete: here(m),
    };
  });
}

/** The rows to list: Ensayo's picks, and with `showAll` the rest too. A model that is on this computer, in use or being
 *  fetched is never hidden, so Delete and Cancel stay in reach. */
export function visibleRows(rows: ModelRow[], showAll: boolean): ModelRow[] {
  return showAll ? rows : rows.filter((r) => r.recommended !== false || r.inUse || r.canDelete || r.downloadingHere || r.elsewhere || r.state === "partial");
}

/** How many models "Show all models" would add. */
export const hiddenCount = (rows: ModelRow[]): number => rows.length - visibleRows(rows, false).length;

/** The question before a model is deleted. */
export const deleteQuestion = (name: string): string => `Delete ${name}? Other Craft Concepts apps that use it keep it.`;

/** What the person is told after Delete: the backend says "erased", "kept" (another app still uses it) or "not_using". */
export function deletedLine(name: string, result: string): string {
  return result === "kept"
    ? `${name} is no longer used by Ensayo. Another Craft Concepts app still uses it, so it stays on this computer.`
    : result === "erased"
      ? `${name} is deleted from this computer.`
      : `Ensayo wasn't using ${name}.`;
}

/** Megabytes of speech models on this computer, counting the ones another app downloaded. */
export const modelsSize = (models: SpeechModelEntry[]): number => models.filter(here).reduce((sum, m) => sum + m.size_mb, 0);

export const progressPercent = (fraction: number): number => Math.round(Math.min(1, Math.max(0, fraction || 0)) * 100);
