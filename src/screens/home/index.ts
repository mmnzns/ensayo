import type { ComponentType } from "react";
import type { ManifestEntry } from "../manifest";
import Home from "./Home";
import HomeEmpty from "./HomeEmpty";
import HomeOffline from "./HomeOffline";
import StartASession from "./StartASession";
import StartSessionNoQuestions from "./StartSessionNoQuestions";

/** Screen id to component, for this group's screens. */
export const routes: Record<string, ComponentType> = {
  "2-1-home": Home,
  "2-2-home-empty": HomeEmpty,
  "2-3-start-a-session": StartASession,
  "home-offline": HomeOffline,
  "home-session-no-questions": StartSessionNoQuestions,
};

/** Extra screens (states, dialogs) this group adds beyond the 46 in the design export. */
export const extras: ManifestEntry[] = [
  { id: "home-offline", title: "Home, offline", shell: "app", nav: "home", group: "home", name: "HomeOffline", designed: false },
  { id: "home-session-no-questions", title: "Start a session, no questions yet", shell: "focus", group: "home", name: "StartSessionNoQuestions", designed: false },
];
