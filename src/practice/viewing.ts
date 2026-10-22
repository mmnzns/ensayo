// Which finished session the results screens show: the one the user opened from the history list, else the one just practised.

import { useSyncExternalStore } from "react";
import { getLive, subscribe as subscribeLive } from "./live";

let viewed: string | null = null;
const listeners = new Set<() => void>();

/** Opens a past session's results. Called by the history list before it navigates. */
export function viewSession(id: string | null) {
  viewed = id;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  const off = subscribeLive(l);
  return () => {
    listeners.delete(l);
    off();
  };
};
const snapshot = () => viewed ?? getLive().lastSessionId;

/** The session id the results screens should show, or null when nothing has been practised yet. */
export const useViewedSession = (): string | null => useSyncExternalStore(subscribe, snapshot, snapshot);
