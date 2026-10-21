import type { ComponentType } from "react";
import type { ManifestEntry } from "../manifest";
import MockInProgress from "./MockInProgress";
import MockYourQuestions from "./MockYourQuestions";
import SessionResultsDrill from "./SessionResultsDrill";
import SessionResultsMockDebrief from "./SessionResultsMockDebrief";
import HabitGraduation from "./HabitGraduation";

/** Screen id to component, for this group's screens. */
export const routes: Record<string, ComponentType> = {
  "4-1-mock-in-progress": MockInProgress,
  "4-2-mock-your-questions": MockYourQuestions,
  "4-3-session-results-drill": SessionResultsDrill,
  "4-4-session-results-mock-debrief": SessionResultsMockDebrief,
  "4-5-habit-graduation": HabitGraduation,
};

/** Extra screens (states, dialogs) this group adds beyond the 46 in the design export. */
export const extras: ManifestEntry[] = [];
