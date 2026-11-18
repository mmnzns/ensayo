// When a story is added from an application's "Stories to add for this job", the application is remembered here so that
// saving the story can send the person back to it with a Recheck offer. Only that path sets it; every other way into
// Add a story leaves it empty.

let forJob: string | undefined;
export const setStoryForJob = (appId: string | undefined) => {
  forJob = appId;
};
/** The application the story being added is for, if it came from one. */
export const storyForJob = () => forJob;

/** What Add a story opens with: the company and the title hint from the link, when it came from an application. Typed text wins. */
export function prefillFor(link: { app?: string; company?: string; hint?: string }, typedCompany: string): { company: string; titleHint: string | undefined } {
  if (!link.app) return { company: typedCompany, titleHint: undefined };
  return { company: typedCompany || link.company || "", titleHint: link.hint || undefined };
}

/** Where saving a story goes: back to the application with the Recheck offer when it was added for one (plain Save only), else where it was going. */
export function afterSave(job: string | undefined, next: string): string {
  return job && next === "5-1-stories" ? `6-3-application-overview?app=${encodeURIComponent(job)}&saved=1` : next;
}

/** The "Story saved. Recheck" line on the overview: after a save from here, until a recheck has run, when there is a posting to read again. */
export const showSavedOffer = (saved: string | undefined, recheckedSince: boolean, hasPosting: boolean): boolean => saved === "1" && !recheckedSince && hasPosting;
