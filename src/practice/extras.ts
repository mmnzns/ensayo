// What practice reads from the data layer's application hooks.

import { isApp, useActions, useApplicationExtras as useExtras } from "../data/real";
import type { ExtraQuestion } from "./questions";

/** The night-before set for one stage, as `ExtrasView.lockedByStage[stageId]`. */
export interface LockedSet {
  stageId: string;
  questions: string[];
}

/** The parts of an application's extras (`ExtrasView`) that practice reads. */
export interface PracticeExtras {
  questions: ExtraQuestion[];
  lockedByStage?: Record<string, LockedSet | undefined>;
  /** The Questions tab switch for asked questions leading a later stage's Drill: on unless false. */
  askedFirst?: boolean;
}

/** The application's question set and locked stages, or undefined when no application is chosen. */
export function useApplicationExtras(applicationId: string | null | undefined): PracticeExtras | undefined {
  const extras = useExtras(applicationId ?? undefined);
  return applicationId ? (extras as unknown as PracticeExtras) : undefined;
}

/** "X is right now" on a flag in the debrief: marks the later claim as the current one. Undefined in the browser preview,
 *  where nothing is saved, so the button is left out. */
export function useClaimUpdater(): ((applicationId: string, claimId: string, newValue: string) => Promise<unknown>) | undefined {
  const { markClaimUpdated } = useActions();
  return isApp() && markClaimUpdated ? (a, c, v) => markClaimUpdated(a, c, v) : undefined;
}
