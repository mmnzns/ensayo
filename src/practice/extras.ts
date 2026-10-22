// What practice reads from the data layer's application hooks. They are looked up by name, so practice still works (with the
// question bank, with no locked questions, with no "X is right now" button) wherever a hook is not there: the browser preview
// and the mock store. Once the data layer exports them, nothing here needs to change.

import * as data from "../data/real";
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
}

type ExtrasHook = (applicationId: string | null | undefined) => PracticeExtras | null | undefined;

const lookup = data as unknown as { useApplicationExtras?: ExtrasHook; useActions?: () => { markClaimUpdated?: (applicationId: string, claimId: string, newValue: string) => Promise<unknown> } };

/** The application's question set and locked stages, or undefined while it has not loaded or where there is none. */
export const useApplicationExtras: (applicationId: string | null | undefined) => PracticeExtras | undefined = (applicationId) => lookup.useApplicationExtras?.(applicationId) ?? undefined;

/** "X is right now" on a flag in the debrief: the data layer's `markClaimUpdated`, or undefined where it does not exist (the button is then left out). */
export function useClaimUpdater(): ((applicationId: string, claimId: string, newValue: string) => Promise<unknown>) | undefined {
  const actions = lookup.useActions?.();
  return actions?.markClaimUpdated ? (a, c, v) => actions.markClaimUpdated!(a, c, v) : undefined;
}
