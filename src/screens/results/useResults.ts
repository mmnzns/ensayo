import { useEffect, useState } from "react";
import { useRepHistory } from "../../data/real";
import { useStore } from "../../data/store";
import type { SessionDetail } from "../../practice/api";
import { liveAvailable, loadSessionDetail } from "../../practice/live";
import { resultsOfSession, type SessionResults } from "../../practice/results";
import { useViewedSession } from "../../practice/viewing";

export type ResultsState =
  | { status: "mock"; results: SessionResults }
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; results: SessionResults };

/** What the results screens show: the sample data in the browser, otherwise the session just practised (or opened from History). */
export function useResults(): ResultsState {
  const store = useStore();
  const sessionId = useViewedSession();
  const history = useRepHistory();
  const [detail, setDetail] = useState<{ id: string; value: SessionDetail | null } | null>(null);
  const live = liveAvailable();

  useEffect(() => {
    if (!live || !sessionId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const value = await loadSessionDetail(sessionId);
        if (!cancelled) setDetail({ id: sessionId, value });
      } catch {
        if (!cancelled) setDetail({ id: sessionId, value: null });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [live, sessionId]);

  if (!live) return { status: "mock", results: { drill: store.screens.results.drill, graduation: store.screens.results.graduation } };
  if (!sessionId) return { status: "empty" };
  if (!detail || detail.id !== sessionId) return { status: "loading" };
  if (!detail.value) return { status: "empty" };
  const results = resultsOfSession(store.habits, detail.value, history, store.profile.focusHabits, store.now());
  return results ? { status: "ready", results } : { status: "empty" };
}
