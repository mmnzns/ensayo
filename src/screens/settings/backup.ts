// Backup and restore, the words and small helpers. The work itself is the `backup_data`, `inspect_backup` and
// `restore_backup` commands; the zip never holds recordings, speech models, saved keys or this computer's settings.
import { LAST_BACKUP_KEY } from "./prefs";

export interface BackupCounts {
  stories: number;
  targets: number;
  applications: number;
  sessions: number;
}

/** What `inspect_backup` returns. */
export interface BackupInfo {
  app_version: string;
  created_at: string;
  counts: BackupCounts;
  schema_versions: number[];
  files: number;
  warnings: string[];
}

/** What `restore_backup` returns. */
export interface RestoreReport {
  mode: "merge" | "replace";
  written: number;
  unchanged: number;
  skipped: number;
  safety_backup: string | null;
}

export type RestoreMode = "merge" | "replace";

const pad = (n: number) => String(n).padStart(2, "0");

/** `ensayo-backup-2026-10-22.zip`, by the computer's own date. */
export const backupFileName = (now: Date = new Date()): string => `ensayo-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.zip`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 22, 2026" for an ISO time, or "" when it isn't one. */
export function dateWords(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** The "Last backup" line; before the first backup it says so. */
export function lastBackupLine(iso: string | null): string {
  const when = iso ? dateWords(iso) : "";
  return when ? `Last backup: ${when}` : "No backup made on this computer yet.";
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "3 stories, 2 targets, 1 application, 4 sessions". */
export function countsLine(c: BackupCounts): string {
  return [plural(c.stories, "story", "stories"), plural(c.targets, "target", "targets"), plural(c.applications, "application", "applications"), plural(c.sessions, "session", "sessions")].join(", ");
}

/** What a finished restore says. Ensayo reloads right after. */
export function restoredLine(r: RestoreReport): string {
  if (r.mode === "replace") return "Your data is replaced with the backup. Ensayo is reopening. A copy of what you had before is saved on this computer.";
  const skipped = r.skipped ? ` ${plural(r.skipped, "file was", "files were")} already there with different content, so your version was kept.` : "";
  return `Added ${plural(r.written, "file", "files")} from the backup.${skipped} Ensayo is reopening.`;
}

/** A failure from a command, in plain words. */
export function backupProblemLine(e: unknown): string {
  const text = String(e instanceof Error ? e.message : e).replace(/^Error:\s*/, "").trim();
  return text || "Something went wrong. Nothing was changed.";
}

// ---------- the "last backup" memory, on this computer only ----------

type Mem = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): Mem | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** When the last backup was made, or null. */
export function readLastBackup(storage: Mem | null = browserStorage()): string | null {
  try {
    const v = storage?.getItem(LAST_BACKUP_KEY);
    return v && dateWords(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveLastBackup(iso: string, storage: Mem | null = browserStorage()): void {
  try {
    storage?.setItem(LAST_BACKUP_KEY, iso);
  } catch {
    // Storage is blocked; the line just says there is no backup yet next time.
  }
}
