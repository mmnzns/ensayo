// The claims log on "What you've said": the lines grouped by what they are about, and how each group stands.

import type { Claim, ClaimMatch } from "../../data/types";

export interface ClaimGroup {
  subject: string;
  claims: Claim[];
  /** How the group stands: a conflict that still stands first, then a line marked current, else how many agree. */
  status: ClaimMatch;
  /** Lines a newer answer replaced: shown struck through. */
  struck: Set<string>;
  /** The line that disagrees with the rest, when one does. */
  differs?: Claim;
}

/** True for a line a newer answer replaced. The app says so (`superseded`); the sample data only orders them. */
function isStruck(c: Claim, i: number, group: Claim[]): boolean {
  if (c.superseded !== undefined) return c.superseded;
  const updated = group.findIndex((x) => x.status === "updated");
  return updated > -1 && i < updated;
}

/** The lines grouped by subject, in the order each subject first appears. */
export function groupClaims(claims: Claim[]): ClaimGroup[] {
  const subjects: string[] = [];
  for (const c of claims) if (!subjects.includes(c.subject)) subjects.push(c.subject);
  return subjects.map((subject) => {
    const all = claims.filter((c) => c.subject === subject);
    const struck = new Set(all.filter((c, i) => isStruck(c, i, all)).map((c) => c.id));
    const live = all.filter((c) => !struck.has(c.id));
    const differs = live.find((c) => c.status === "differs");
    const status: ClaimMatch = differs ? "differs" : live.some((c) => c.status === "updated") ? "updated" : live.length === 1 ? live[0].status : live.length === 0 ? all[all.length - 1].status : "consistent";
    return { subject, claims: all, status, struck, differs };
  });
}

/** The first number in a line, for "It's 5 now". */
export function numberIn(text: string): string | undefined {
  return /\d+(?:\.\d+)?/.exec(text)?.[0];
}

/** What a line added by hand can be about: the backend's name, the words on screen, and a subject when there is only one. */
export const ADD_KINDS: { id: string; label: string; subject: string }[] = [
  { id: "availability", label: "Notice period", subject: "Notice period" },
  { id: "compensation", label: "Pay range", subject: "Pay range" },
  { id: "reason_for_leaving", label: "Why you're leaving", subject: "Why you're leaving" },
  { id: "why_this_company", label: "Why this company", subject: "" },
  { id: "proof_number", label: "A number", subject: "" },
  { id: "role_title", label: "A job title", subject: "Title" },
];
