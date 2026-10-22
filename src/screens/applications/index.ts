import type { ComponentType } from "react";
import type { ManifestEntry } from "../manifest";
import Applications from "./Applications";
import NewApplication from "./NewApplication";
import ApplicationOverview from "./ApplicationOverview";
import ApplicationEditDetails from "./ApplicationEditDetails";
import ApplicationTheResumeYouSent from "./ApplicationTheResumeYouSent";
import ApplicationStagesAndNightBefore from "./ApplicationStagesAndNightBefore";
import CueSheet from "./CueSheet";
import ApplicationWhatYouVeSaid from "./ApplicationWhatYouVeSaid";
import ApplicationQuestions from "./ApplicationQuestions";
import NewTargetFromPosting from "./NewTargetFromPosting";

/** Screen id to component, for this group's screens. */
export const routes: Record<string, ComponentType> = {
  "6-1-applications": Applications,
  "6-2-new-application": NewApplication,
  "6-3-application-overview": ApplicationOverview,
  "6-4-application-edit-details": ApplicationEditDetails,
  "6-5-application-the-resume-you-sent": ApplicationTheResumeYouSent,
  "6-6-application-stages-and-night-before": ApplicationStagesAndNightBefore,
  "6-7-cue-sheet": CueSheet,
  "6-8-application-what-you-ve-said": ApplicationWhatYouVeSaid,
  "6-10-new-target-from-posting": NewTargetFromPosting,
  "applications-questions": ApplicationQuestions,
};

/** Extra screens (states, dialogs) this group adds beyond the 46 in the design export. */
export const extras: ManifestEntry[] = [
  { id: "6-10-new-target-from-posting", title: "New target from a posting", shell: "focus", group: "applications", name: "NewTargetFromPosting", designed: false },
  { id: "applications-questions", title: "Kestrel Pay, questions", shell: "app", nav: "applications", group: "applications", name: "ApplicationQuestions", designed: false },
];
