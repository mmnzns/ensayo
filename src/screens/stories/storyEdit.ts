import type { Story } from "../../data/types";

/** The top of the story page: the name, the company and the year. */
export interface StoryIdentity {
  title: string;
  company: string;
  year: string;
}

export const identityOf = (s: Pick<Story, "title" | "employer" | "year">): StoryIdentity => ({ title: s.title, company: s.employer, year: s.year ?? "" });

/** The story with its name, company and year changed. Everything else, the id first of all (angles, pins, practice
 *  history and application links all point at the id, not the title), is left exactly as it was. An empty year is no year. */
export function withIdentity(story: Story, f: StoryIdentity): Story {
  const { year: _old, ...rest } = story;
  const year = f.year.trim();
  return { ...rest, title: f.title.trim(), employer: f.company.trim(), ...(year ? { year } : {}) };
}

/** A story needs a title; the saved file refuses one without. */
export const NEEDS_TITLE = "A story needs a title.";
