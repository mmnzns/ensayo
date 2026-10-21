import type { ComponentType } from "react";
import type { ManifestEntry } from "../manifest";
import Home from "./Home";
import HomeEmpty from "./HomeEmpty";
import StartASession from "./StartASession";

/** Screen id to component, for this group's screens. */
export const routes: Record<string, ComponentType> = {
  "2-1-home": Home,
  "2-2-home-empty": HomeEmpty,
  "2-3-start-a-session": StartASession,
};

/** Extra screens (states, dialogs) this group adds beyond the 46 in the design export. */
export const extras: ManifestEntry[] = [];
