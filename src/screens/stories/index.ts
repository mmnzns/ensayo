import type { ComponentType } from "react";
import type { ManifestEntry } from "../manifest";
import Stories from "./Stories";
import AddAStoryPaste from "./AddAStoryPaste";
import AddAStoryReview from "./AddAStoryReview";
import Story from "./Story";
import Methods from "./Methods";
import StoriesEmpty from "./StoriesEmpty";
import StoriesParseError from "./StoriesParseError";

/** Screen id to component, for this group's screens. */
export const routes: Record<string, ComponentType> = {
  "5-1-stories": Stories,
  "5-2-add-a-story-paste": AddAStoryPaste,
  "5-3-add-a-story-review": AddAStoryReview,
  "5-4-story": Story,
  "5-5-methods": Methods,
  "stories-empty": StoriesEmpty,
  "stories-parse-error": StoriesParseError,
};

/** Extra screens (states, dialogs) this group adds beyond the 46 in the design export. */
export const extras: ManifestEntry[] = [
  { id: "stories-empty", title: "Stories, none yet", shell: "app", nav: "stories", group: "stories", name: "StoriesEmpty", designed: false },
  { id: "stories-parse-error", title: "Add a story, couldn't read it", shell: "app", nav: "stories", group: "stories", name: "StoriesParseError", designed: false },
];
