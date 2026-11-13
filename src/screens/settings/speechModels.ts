// Settings, Speech in the app: plain functions between what the backend reports (`speech_models`) and what the screen
// says. The screen talks to the backend; these decide what to show.

import { osOf, type Os } from "../first-run/setup";
import { formatSize } from "./format";

/** Speech models in the order Ensayo prefers them; the first one on this computer is used. Windows starts with
 *  Parakeet Ultra: with no graphics chip to run Whisper Turbo, a two-minute answer waited about a minute for it,
 *  against a few seconds for Parakeet Ultra at the same accuracy (decided 2026-10-24). The Mac keeps Turbo. Matches
 *  the backend's `models::DEFAULT_MODEL`. */
export function speechOrder(os: Os): string[] {
  return os === "windows"
    ? ["parakeet-ultra", "whisper-turbo", "whisper-small", "whisper-base", "whisper-tiny"]
    : ["whisper-turbo", "parakeet-ultra", "whisper-small", "whisper-base", "whisper-tiny"];
}

const THIS_OS: Os = osOf(typeof navigator === "undefined" ? "" : navigator.userAgent);

export const SPEECH_MODELS = speechOrder(THIS_OS);

/** The small note on a Whisper model on Windows: the engine has no graphics card path for Whisper there yet, so it
 *  runs on the processor. Null for every other model and computer. */
export const SLOW_ON_WINDOWS = "Slow on this computer: runs on the processor.";
export function slowNote(id: string, os: Os): string | null {
  return os === "windows" && id.startsWith("whisper-") ? SLOW_ON_WINDOWS : null;
}

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
  /** A note about speed on this computer, when there is one. */
  slowNote: string | null;
}

const percentOf = (fraction: number | undefined) => progressPercent(fraction ?? 0);

/** `downloadingId` is the model this window is downloading now; the backend also says "downloading" for a download that is running here. */
export function modelRows(models: SpeechModelEntry[], inUseId: string, downloadingId: string | null = null, os: Os = THIS_OS): ModelRow[] {
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
      slowNote: slowNote(m.id, os),
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

/** The question before "Remove from this computer": it says who else loses the model and what it frees. */
export const removeQuestion = (name: string, sizeMb: number): string =>
  `Remove ${name} from this computer? Talaan and Parlato will lose it too and will download it again if they need it. Frees ${formatSize(sizeMb)}.`;

/** What `remove_model_everywhere` returns. */
export interface Removal {
  result: "erased" | "in_use" | "not_there";
  old_copies_left: number;
}

export const IN_USE_LINE = "Another app is using this model right now. Close Talaan and Parlato and try again.";
export const OLD_FILES_LINE = "Some old files couldn't be removed yet. They'll go the next time.";

/** What the person is told after "Remove from this computer". `problem` is true when nothing was removed and they need to act. */
export function removedLine(name: string, r: Removal): { text: string; problem: boolean } {
  if (r.result === "in_use") return { text: IN_USE_LINE, problem: true };
  if (r.result === "not_there") return { text: `${name} wasn't on this computer.`, problem: false };
  const gone = `${name} is removed from this computer.`;
  return { text: r.old_copies_left > 0 ? `${gone} ${OLD_FILES_LINE}` : gone, problem: false };
}

/** Megabytes of speech models on this computer, counting the ones another app downloaded. */
export const modelsSize = (models: SpeechModelEntry[]): number => models.filter(here).reduce((sum, m) => sum + m.size_mb, 0);

export const progressPercent = (fraction: number): number => Math.round(Math.min(1, Math.max(0, fraction || 0)) * 100);
