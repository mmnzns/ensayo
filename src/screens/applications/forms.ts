// Small pure helpers for the application forms: dates the backend accepts, contacts, stage rows, files.

import type { StageInput } from "../../data/applicationCommands";
import type { Contact, StageId } from "../../data/types";

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-23T14:00" as the pieces two inputs hold: "2026-10-23" and "14:00" ("" when the time is not known). */
export function splitAt(at: string | undefined | null): { date: string; time: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(at ?? "");
  if (!m) return { date: "", time: "" };
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] ? `${pad(+m[4])}:${m[5]}` : "" };
}

/** The date and time inputs as one stored value: null with no date (a time alone means nothing), a date alone when
 *  the time is not known. */
export function joinAt(date: string, time: string): string | null {
  const d = date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const t = time.trim();
  return /^\d{2}:\d{2}$/.test(t) ? `${d}T${t}` : d;
}

/** The day part of a stored date ("2026-10-06T14:00" is "2026-10-06"), "" when it is not a date. */
export function isoDay(s: string | undefined | null): string {
  return splitAt(s).date;
}

/** "Priya, recruiter" is a name and a role; nothing is no contact. */
export function contactFromText(text: string): Contact[] {
  const t = text.trim();
  if (!t) return [];
  const comma = t.indexOf(",");
  const [name, role] = comma < 0 ? [t, ""] : [t.slice(0, comma).trim(), t.slice(comma + 1).trim()];
  return [{ name, role, email_or_phone: "", notes: "" }];
}

/** Contacts the person filled in at least one field of. */
export function filledContacts(contacts: Contact[]): Contact[] {
  return contacts.filter((c) => [c.name, c.role, c.email_or_phone, c.notes].some((v) => v.trim() !== ""));
}

/** Moves item `i` one place up (-1) or down (1); the same list when it cannot move. */
export function moveItem<T>(list: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export interface StageDraft {
  /** The stage's id, or a throwaway key for a row added on screen. */
  key: string;
  /** Present only for a stage the application already has. */
  id?: string;
  stage: StageId;
  label: string;
  date: string;
  time: string;
}

/** The stage rows as the backend saves them: in order; a row added on screen has no id. */
export function stageInputs(rows: StageDraft[]): StageInput[] {
  return rows.map((r) => ({ ...(r.id ? { id: r.id } : {}), stage: r.stage, label: r.label.trim(), at: joinAt(r.date, r.time) }));
}

/** PDF or Word, by the name. */
export function isResumeFile(name: string): boolean {
  return /\.(pdf|docx?)$/i.test(name.trim());
}

/** "kestrel-pay-cue-sheet.md". */
export function fileSlug(text: string, suffix: string): string {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || "ensayo"}-${suffix}`;
}

/** Up to two questions to ask, trimmed, none empty. */
export function lockQuestions(questions: string[]): string[] {
  return questions.map((q) => q.trim()).filter(Boolean).slice(0, 2);
}

/** A pasted file's bytes, for the commands that take them. */
export async function bytesOf(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/** What reading the posting again left alone, in plain words. The backend names paths ("analysis.priorities.1",
 *  "question q_3"); the screen says what they are. */
export function keptWords(kept: string[]): string[] {
  const words = kept.map((k) => {
    const m = /^analysis\.(summary|priorities|beliefs|gaps|echo)(?:\.(\d+))?$/.exec(k);
    if (m) {
      const n = m[2] === undefined ? 0 : Number(m[2]) + 1;
      switch (m[1]) {
        case "summary":
          return "the summary";
        case "priorities":
          return `priority ${n}`;
        case "beliefs":
          return `belief ${n}`;
        case "gaps":
          return `gap ${n}`;
        default:
          return `phrase ${n}`;
      }
    }
    if (k.startsWith("question")) return "one of your questions";
    if (k === "posting") return "the posting text";
    return "something you edited";
  });
  return [...new Set(words)];
}
