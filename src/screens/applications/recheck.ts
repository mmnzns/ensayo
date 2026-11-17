// One recheck per application, shared by every button that starts it (the overview's and the header's), so they all show
// the same busy state, the same error and the same result, on any tab. Lives outside React so it survives a tab change.
import { useCallback, useSyncExternalStore } from "react";
import { isStopped } from "../../ui/aiStop";
import { plainError } from "../../data/actions";
import type { JdOutcome } from "../../data/applicationCommands";
import { useActions } from "../../data/real";

export interface RecheckState {
  busy: boolean;
  error: string;
  /** What the last recheck on this application did, until the next one. */
  last: JdOutcome | null;
}

const IDLE: RecheckState = { busy: false, error: "", last: null };
const states = new Map<string, RecheckState>();
const listeners = new Set<() => void>();

function set(id: string, patch: Partial<RecheckState>) {
  states.set(id, { ...(states.get(id) ?? IDLE), ...patch });
  listeners.forEach((l) => l());
}

export function recheckState(id: string): RecheckState {
  return states.get(id) ?? IDLE;
}

/** Forgets what was kept for an application (tests, and a deleted application). */
export function resetRecheck(id?: string) {
  if (id) states.delete(id);
  else states.clear();
  listeners.forEach((l) => l());
}

type Analyse = (applicationId: string, text?: string) => Promise<JdOutcome>;

/** Runs the recheck unless one is already running for this application. */
export async function startRecheck(id: string, analyse: Analyse, text?: string): Promise<JdOutcome | undefined> {
  if (recheckState(id).busy) return undefined;
  set(id, { busy: true, error: "" });
  try {
    const out = await analyse(id, text);
    set(id, { busy: false, last: out });
    return out;
  } catch (e) {
    // Stop is not a failure: the screen stays as it was, with no banner.
    set(id, { busy: false, error: isStopped(e) ? "" : plainError(e) });
    return undefined;
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export function useRecheck(id: string) {
  const actions = useActions();
  const state = useSyncExternalStore(subscribe, () => recheckState(id), () => IDLE);
  const run = useCallback((text?: string) => startRecheck(id, (a, t) => actions.analyseJd(a, t), text), [id, actions]);
  return { ...state, run };
}

/** How many of the person's stories changed after the posting was last read. Counts every story, not only the ones this
 *  reading points at, because the reading is made from the whole bank: a story added or edited since can cover a gap or a
 *  belief that was open. A story with no change time, or a reading with no time, counts for nothing rather than guess. */
export function storiesChangedSince(stories: { updated_at?: string }[], readingOn: string | undefined): number {
  const read = readingOn ? Date.parse(readingOn) : NaN;
  if (Number.isNaN(read)) return 0;
  return stories.filter((s) => {
    const at = s.updated_at ? Date.parse(s.updated_at) : NaN;
    return !Number.isNaN(at) && at > read;
  }).length;
}

/** "1 story changed since this was read" / "3 stories changed since this was read". Empty for none. */
export function changedLine(n: number): string {
  return n > 0 ? `${n} ${n === 1 ? "story" : "stories"} changed since this was read` : "";
}
