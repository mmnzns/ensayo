// What the practice screens show: the mock demo in the browser, the real session when one is running.

import type { PracticeSession } from "../../data/screens/practice";
import { useStore } from "../../data/store";
import { cancelLive, currentQuestion, currentQuestionText, liveSession, liveWindow, useLive } from "../../practice/live";
import { END_SESSION } from "./practiceFlow";

export interface PracticeView {
  live: boolean;
  session: PracticeSession;
  question: string;
  /** The question being followed up: the first question, while a follow-up is on screen. */
  original: string;
  targetSeconds: { from: number; to: number };
  /** Where End session goes: the results of what was practised, or home when nothing was scored. */
  endTo: string;
  onEnd?: () => void;
}

export function usePractice(): PracticeView {
  const mock = useStore().screens.practice;
  const live = useLive();
  if (!live.active) return { live: false, session: mock.session, question: mock.question, original: mock.question, targetSeconds: mock.targetSeconds, endTo: END_SESSION };
  return {
    live: true,
    session: liveSession(),
    question: currentQuestionText(),
    original: currentQuestion()?.text ?? "",
    targetSeconds: liveWindow(),
    // Once something was scored, ending a session shows what it said; otherwise there is nothing to show.
    endTo: live.lastSessionId ? END_SESSION : "2-1-home",
    onEnd: () => void cancelLive(),
  };
}
