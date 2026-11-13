// The search box on Stories, Applications and Progress › Sessions: pure matching, ignoring case.

import type { RepSummary } from "../practice/habits";
import type { Application, SessionSummary, Story } from "../data/types";
import { STAGE_LABEL } from "./applications/format";

/** What the box holds, trimmed and lower-cased. Empty means no search. */
export const searchTerm = (query: string): string => query.trim().toLowerCase();

/** True when any of the texts contains the search (case-insensitive). No search matches everything. */
export function matchesAny(texts: (string | number | null | undefined)[], query: string): boolean {
  const q = searchTerm(query);
  if (!q) return true;
  return texts.some((t) => t !== null && t !== undefined && String(t).toLowerCase().includes(q));
}

/** Stories whose title, employer, year or competencies contain the search. */
export function searchStories(stories: Story[], query: string): Story[] {
  return stories.filter((s) => matchesAny([s.title, s.employer, s.year, ...s.competencies], query));
}

/** Applications whose company or role contains the search. */
export function searchApplications<A extends Pick<Application, "company" | "role">>(apps: A[], query: string): A[] {
  return apps.filter((a) => matchesAny([a.company, a.role], query));
}

/** The stage as a person says it: "hiring_manager" is "Hiring manager". */
const stageWords = (stage: string): string[] => [STAGE_LABEL[stage as keyof typeof STAGE_LABEL] ?? stage.replace(/_/g, " "), stage.replace(/_/g, " ")];

/** Sessions with a question's text, a stage, or the application's company that contains the search. */
export function searchSessions(sessions: SessionSummary[], reps: Pick<RepSummary, "session_id" | "stage" | "question_text">[], apps: Pick<Application, "id" | "company">[], query: string): SessionSummary[] {
  if (!searchTerm(query)) return sessions;
  return sessions.filter((s) => {
    const own = reps.filter((r) => r.session_id === s.id);
    const company = apps.find((a) => a.id === s.applicationId)?.company;
    return matchesAny([company, ...own.map((r) => r.question_text), ...own.flatMap((r) => stageWords(r.stage))], query);
  });
}

/** "Nothing matches “text”." */
export const nothingMatches = (query: string): string => `Nothing matches “${query.trim()}”.`;
