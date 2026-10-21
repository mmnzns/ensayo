import type { ComponentType } from "react";
import type { ManifestEntry } from "../manifest";

/** Screen id to component, for this group's screens. */
export const routes: Record<string, ComponentType> = {};

/** Extra screens (states, dialogs) this group adds beyond the 46 in the design export. */
export const extras: ManifestEntry[] = [];
