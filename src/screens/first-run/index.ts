import type { ComponentType } from "react";
import type { ManifestEntry } from "../manifest";
import Welcome from "./Welcome";
import AboutYou from "./AboutYou";
import WhatToWorkOn from "./WhatToWorkOn";
import Microphone from "./Microphone";
import Speech from "./Speech";
import FeedbackEngine from "./FeedbackEngine";
import YourFirstStory from "./YourFirstStory";

/** Screen id to component, for this group's screens. */
export const routes: Record<string, ComponentType> = {
  "1-1-welcome": Welcome,
  "1-2-about-you": AboutYou,
  "1-3-what-to-work-on": WhatToWorkOn,
  "1-4-microphone": Microphone,
  "1-5-speech": Speech,
  "1-6-feedback-engine": FeedbackEngine,
  "1-7-your-first-story": YourFirstStory,
};

/** Extra screens (states, dialogs) this group adds beyond the 46 in the design export. */
export const extras: ManifestEntry[] = [];
