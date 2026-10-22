// What the practice screens show: the mock demo in the browser, the real session when one is running.

import type { PracticeSession } from "../../data/screens/practice";
import { useStore } from "../../data/store";
import { cancelLive, currentQuestion, liveSession, liveWindow, useLive } from "../../practice/live";
import { END_SESSION } from "./practiceFlow";

export interface PracticeView {
  live: boolean;
  session: PracticeSession;
  question: string;
  targetSeconds: { from: number; to: number };
  /** Where End session goes. A live session has no results page yet (M9), so it goes home. */
  endTo: string;
  onEnd?: () => void;
}

export function usePractice(): PracticeView {
  const mock = useStore().screens.practice;
  const live = useLive();
  if (!live.active) return { live: false, session: mock.session, question: mock.question, targetSeconds: mock.targetSeconds, endTo: END_SESSION };
  return {
    live: true,
    session: liveSession(),
    question: currentQuestion()?.text ?? "",
    targetSeconds: liveWindow(),
    endTo: "2-1-home",
    onEnd: () => void cancelLive(),
  };
}
