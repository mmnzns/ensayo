import type { ComponentType } from "react";
import type { ManifestEntry } from "../manifest";
import Stories from "./Stories";
import AddAStoryPaste from "./AddAStoryPaste";
import AddAStoryReview from "./AddAStoryReview";
import Story from "./Story";
import Methods from "./Methods";

/** Screen id to component, for this group's screens. */
export const routes: Record<string, ComponentType> = {
  "5-1-stories": Stories,
  "5-2-add-a-story-paste": AddAStoryPaste,
  "5-3-add-a-story-review": AddAStoryReview,
  "5-4-story": Story,
  "5-5-methods": Methods,
};

/** Extra screens (states, dialogs) this group adds beyond the 46 in the design export. */
export const extras: ManifestEntry[] = [];
