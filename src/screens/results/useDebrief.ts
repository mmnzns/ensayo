import { useEffect, useState } from "react";
import { useStore } from "../../data/store";
import { debriefOfSession, type LiveDebrief, type QuestionQuality } from "../../practice/debrief";
import { askMockDebrief, liveAvailable, loadSessionDetail } from "../../practice/live";
import { useViewedSession } from "../../practice/viewing";
import type { SessionDetail } from "../../practice/api";

export type DebriefState =
  | { status: "demo" }
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; debrief: LiveDebrief; judging: boolean; judgeError: string | null };

/** What the Mock debrief shows: the sample in the browser, otherwise the Mock just run (or opened from History). */
export function useDebrief(): DebriefState {
  const store = useStore();
  const sessionId = useViewedSession();
  const live = liveAvailable();
  const [detail, setDetail] = useState<{ id: string; value: SessionDetail | null } | null>(null);
  const [quality, setQuality] = useState<{ id: string; value: QuestionQuality | null; error: string | null; done: boolean } | null>(null);

  useEffect(() => {
    if (!live || !sessionId) return;
    let cancelled = false;
    void (async () => {
      let value: SessionDetail | null = null;
      try {
        value = await loadSessionDetail(sessionId);
      } catch {
        value = null;
      }
      if (cancelled) return;
      setDetail({ id: sessionId, value });
      // Question quality is one model call after the Mock; it is saved, so reopening costs nothing.
      if (!value || !value.reps.some((r) => r.question_type === "candidate_questions")) {
        setQuality({ id: sessionId, value: null, error: null, done: true });
        return;
      }
      try {
        const q = await askMockDebrief(sessionId, { role: store.profile.targetRole });
        if (!cancelled) setQuality({ id: sessionId, value: q, error: null, done: true });
      } catch (e) {
        if (!cancelled) setQuality({ id: sessionId, value: null, error: e instanceof Error ? e.message : String(e), done: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [live, sessionId]);

  if (!live) return { status: "demo" };
  if (!sessionId) return { status: "empty" };
  if (!detail || detail.id !== sessionId) return { status: "loading" };
  if (!detail.value) return { status: "empty" };
  const q = quality && quality.id === sessionId ? quality : null;
  const debrief = debriefOfSession(store.habits, detail.value, q?.value ?? null, []);
  if (!debrief) return { status: "empty" };
  return { status: "ready", debrief, judging: !q?.done, judgeError: q?.error ?? null };
}
