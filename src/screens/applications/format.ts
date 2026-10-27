// Date and label helpers for the applications screens. Dates come from the data as strings and are formatted here.
import { daysUntil } from "../../data/store";
import type { Application, ApplicationStatus, ClaimMatch, ClosedReason, ProcessStage, StageId } from "../../data/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "2026-10-06" or "2026-10-06T14:00" as a local date. Undefined when it does not parse. */
export function parseDate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s);
  if (!m) return undefined;
  return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
}

/** "Oct 6". */
export function shortDate(s: string | undefined): string {
  const d = parseDate(s);
  return d ? `${MONTHS[d.getMonth()]} ${d.getDate()}` : "";
}

/** "2:00 PM". */
export function timeOf(d: Date): string {
  const h = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? "AM" : "PM"}`;
}

/** "Friday 2:00 PM" within the coming week, "Oct 30, 2:00 PM" otherwise. */
export function whenText(at: string | undefined, now: Date): string {
  const d = parseDate(at);
  if (!d) return "";
  const days = daysUntil(d, now);
  const time = at && at.includes("T") ? timeOf(d) : "";
  const day = days >= 0 && days < 7 ? DAYS[d.getDay()] : `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return time ? `${day}${days >= 0 && days < 7 ? " " : ", "}${time}` : day;
}

/** "Fri, Oct 23 · 2:00 PM". */
export function rowWhen(at: string | undefined): string {
  const d = parseDate(at);
  if (!d) return "";
  return `${DAYS[d.getDay()].slice(0, 3)}, ${MONTHS[d.getMonth()]} ${d.getDate()} · ${timeOf(d)}`;
}

/** "Friday, October 23". */
export function longDate(at: string | undefined): string {
  const d = parseDate(at);
  return d ? `${DAYS[d.getDay()]}, ${MONTHS_LONG[d.getMonth()]} ${d.getDate()}` : "";
}

/** "2:00 PM" from a stored date-time, "" when there is none. */
export function timeText(at: string | undefined): string {
  const d = parseDate(at);
  return d && at && at.includes("T") ? timeOf(d) : "";
}

/** "In 2 days", "Tomorrow", "Today". */
export function inDays(at: string | undefined, now: Date): string {
  const d = parseDate(at);
  if (!d) return "";
  const n = daysUntil(d, now);
  return n <= 0 ? "Today" : n === 1 ? "Tomorrow" : `In ${n} days`;
}

/** True when the date falls in the current calendar week (Monday to Sunday), not before now. */
export function isThisWeek(at: string | undefined, now: Date): boolean {
  const d = parseDate(at);
  if (!d || d < now) return false;
  const dow = (now.getDay() + 6) % 7; // Monday = 0
  const sunday = daysUntil(d, now) <= 6 - dow;
  return sunday;
}

export const STAGE_LABEL: Record<StageId, string> = {
  recruiter: "Recruiter",
  hiring_manager: "Hiring manager",
  technical: "Technical",
  panel: "Panel",
  leadership: "Leadership",
};

export const STAGE_DECIDES: Record<StageId, string> = {
  recruiter: "Fit and logistics: can they move you forward. Short answers.",
  hiring_manager: "Can you do this job, and how do you work. Follow-ups on ownership and numbers.",
  technical: "How deep you go when someone keeps asking why.",
  panel: "Can people across teams work with you. Follow-ups on disagreement.",
  leadership: "Founder call: judgment, commitment, will you run it yourself. Short, skeptical follow-ups.",
};

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  applied: "Applied",
  screening: "Screening",
  interviewing: "Interviewing",
  offer: "Offer",
  closed: "Closed",
};

export const STATUSES: ApplicationStatus[] = ["applied", "screening", "interviewing", "offer", "closed"];

export const CLOSED_LABEL: Record<ClosedReason, string> = {
  no_response: "No response",
  rejected: "They said no",
  withdrew: "You withdrew",
  accepted: "You accepted",
};

/** Chip colours per status, as in the design's list. */
export function statusStyle(status: ApplicationStatus): { background: string; color: string } {
  switch (status) {
    case "interviewing":
      return { background: "var(--e-tint)", color: "var(--e-primary-dark)" };
    case "screening":
      return { background: "var(--e-highlight)", color: "var(--e-warn-ink)" };
    case "offer":
      return { background: "var(--e-ok-tint)", color: "var(--e-ok)" };
    default:
      return { background: "var(--e-ground)", color: "var(--e-muted)" };
  }
}

/** "Dana Ortiz, Resume, Kestrel.pdf" shows as "Kestrel.pdf" in the list. */
export function shortFileName(name: string): string {
  const parts = name.split(",");
  return parts[parts.length - 1].trim();
}

export function nextStage(app: Application): ProcessStage | undefined {
  if (app.status === "closed") return undefined;
  const ordered = [...app.process].sort((a, b) => a.order - b.order);
  const open = ordered.filter((s) => !s.done);
  const current = app.current_stage_id ? open.find((s) => s.id === app.current_stage_id) : undefined;
  return current ?? open.find((s) => s.at) ?? open[0];
}

export function answersText(n: number): string {
  return n <= 0 ? "Not yet" : n === 1 ? "1 answer" : `${n} answers`;
}

/** Each status says what it was compared with. On the resume a line is compared with your stories. */
export const MATCH_LABEL: Record<ClaimMatch, string> = {
  matches: "Matches your stories",
  differs: "Differs from your stories",
  not_in_bank: "Not in your stories",
  consistent: "Same every time it came up",
  updated: "Updated, the newest one counts",
  said_once: "Said once, nothing to compare yet",
};

/** A group's status in "What you've said", naming where else it was said: "Same as the Resume and Recruiter call". */
export function matchText(status: ClaimMatch, places: string[]): string {
  const named = [...new Set(places.filter(Boolean))];
  const list = named.length <= 1 ? (named[0] ?? "") : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  if (status === "consistent" && named.length > 1) return `Same in the ${list}`;
  if (status === "said_once" && named.length === 1) return `Said once, in the ${list}. Nothing to compare yet`;
  return MATCH_LABEL[status];
}

/** Bold segments: "so **this** word" into parts. */
export function boldParts(text: string): { text: string; bold: boolean }[] {
  return text.split("**").map((t, i) => ({ text: t, bold: i % 2 === 1 }));
}
