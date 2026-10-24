// Practice, interviewer asking. Draft from Design/screens/html/3-1-practice-interviewer-asking.html, wired to useStore().screens.practice.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isApp } from "../../data/real";
import { askRoute, nextLiveQuestion, retryQuestion, useLive } from "../../practice/live";
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import { go } from "../../ui/router";
import { HearItAgain, Kbd, MicButton, Presence, SessionHeader } from "./parts";
import { ASK, RECORD, resetFlow } from "./practiceFlow";
import { hush, speak, speakQuestion } from "./speak";
import { usePractice } from "./usePractice";
import { useKeys } from "./useKeys";

export default function PracticeInterviewerAsking() {
  const { live, session, question, targetSeconds, endTo, onEnd } = usePractice();
  const state = useLive();

  // A new question always starts at attempt 1.
  useEffect(() => {
    resetFlow();
    return hush;
  }, []);

  // Read the question on its own when Settings, Voice says so; "Hear it again" always works.
  useEffect(() => speakQuestion(question), [question]);

  const start = () => go(RECORD);
  const hear = () => speak(question);
  const skip = () => {
    hush();
    if (live) {
      if (nextLiveQuestion() === "done") go(endTo);
      else go(askRoute());
      return;
    }
    resetFlow();
    go(ASK);
  };
  const end = () => {
    onEnd?.();
    go(endTo);
  };
  const failed = live && state.phase === "error";
  // When it failed because the computer blocks the microphone, say so and link to the fix.
  const [micBlocked, setMicBlocked] = useState(false);
  useEffect(() => {
    if (!failed || !isApp()) return setMicBlocked(false);
    void invoke<string>("mic_permission").then((p) => setMicBlocked(p === "denied" || p === "restricted"), () => {});
  }, [failed]);

  useKeys({ space: failed ? undefined : start, r: hear, n: skip, esc: end });

  return (
    <FocusShell>
      <div className="e-wrap" style={{ width: "100%" }}>
        <SessionHeader session={session} endTo={endTo} onEnd={onEnd} showModeNote />
      </div>
      <div style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "36px", textAlign: "center", padding: "32px 0" }}>
        <Presence size={140} />
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", alignItems: "center", maxWidth: "860px" }}>
          <span className="e-label">Interviewer is asking</span>
          <h1 className="e-h1" style={{ fontSize: "34px", fontWeight: "600" }}>{question}</h1>
          <HearItAgain onClick={hear} />
        </div>
        {live && state.phase === "notice" && state.notice && (
          <div className="e-soft" role="status" style={{ maxWidth: "560px", textAlign: "center" }}>
            <span className="e-meta" style={{ color: "var(--e-ink)" }}>{state.notice}</span>
          </div>
        )}
        {failed && (
          <div className="e-soft" role="alert" style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center", maxWidth: "560px" }}>
            <span className="e-meta" style={{ color: "var(--e-warn-ink)" }}>{micBlocked ? "Your computer is blocking the microphone for Ensayo." : state.error}</span>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
              {micBlocked && <Link to="states-error-mic-denied" className="e-btn e-btn-soft e-btn-sm">How to turn it on</Link>}
              <button type="button" className={micBlocked ? "e-btn e-btn-ghost e-btn-sm" : "e-btn e-btn-soft e-btn-sm"} onClick={() => void retryQuestion()}>Try again</button>
            </div>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <MicButton onClick={start} />
          <span className="e-meta">
            Press <Kbd>Space</Kbd> to start answering
          </span>
        </div>
      </div>
      <div className="e-wrap" style={{ width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          {!(live && state.mode === "mock") && <span className="e-small">Aim for {targetSeconds.from} to {targetSeconds.to} seconds</span>}
          <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={skip}>Skip question</button>
        </div>
      </div>
    </FocusShell>
  );
}
