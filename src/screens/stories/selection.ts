// Tiny module-level memory shared by the stories screens. The router passes no parameters, so a choice made on one
// screen is parked here and read by the next. Nothing persists past a reload.

/** The story the user opened from the list (5-1) and the story screen (5-4) shows. */
let chosenStoryId: string | undefined;
export const chooseStory = (id: string) => {
  chosenStoryId = id;
};
export const chosenStory = () => chosenStoryId;

/** What the user typed on the paste screen (5-2), kept so a failed read (stories-parse-error) does not lose it. */
export const pasteDraft: { raw: string | undefined; company: string } = { raw: undefined, company: "" };

/** What the engine made of the pasted text (a draft, the parts still missing, anything dropped), until it is saved or abandoned. */
export interface ParsedDraft {
  story: import("../../data/types").Story;
  missing: string[];
  dropped: string[];
}
let parsed: ParsedDraft | null = null;
export const setParsedDraft = (p: ParsedDraft | null) => {
  parsed = p;
};
export const getParsedDraft = () => parsed;

/** Why the last read failed, in plain words, for the "couldn't read that one" screen. */
let parseFailure: string | null = null;
export const setParseFailure = (m: string | null) => {
  parseFailure = m;
};
export const getParseFailure = () => parseFailure;

/** True when the review screen (5-3) should open with every field empty ("Start blank"). */
let blankReview = false;
export const setBlankReview = (blank: boolean) => {
  blankReview = blank;
};
export const isBlankReview = () => blankReview;
