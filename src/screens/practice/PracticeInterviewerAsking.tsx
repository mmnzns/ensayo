// Practice, interviewer asking. Draft from Design/screens/html/3-1-practice-interviewer-asking.html, wired to useStore().screens.practice.
import { useEffect } from "react";
import { useStore } from "../../data/store";
import FocusShell from "../../ui/FocusShell";
import { go } from "../../ui/router";
import { HearItAgain, Kbd, MicButton, Presence, SessionHeader } from "./parts";
import { ASK, END_SESSION, RECORD, resetFlow } from "./practiceFlow";
import { hush, speak } from "./speak";
import { useKeys } from "./useKeys";

export default function PracticeInterviewerAsking() {
  const { session, question, targetSeconds } = useStore().screens.practice;

  // A new question always starts at attempt 1.
  useEffect(() => {
    resetFlow();
    return hush;
  }, []);

  const start = () => go(RECORD);
  const hear = () => speak(question);
  const skip = () => {
    resetFlow();
    hush();
    go(ASK);
  };

  useKeys({ space: start, r: hear, n: skip, esc: () => go(END_SESSION) });

  return (
    <FocusShell>
      <div className="e-wrap" style={{ width: "100%" }}>
        <SessionHeader session={session} showModeNote />
      </div>
      <div style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "36px", textAlign: "center", padding: "32px 0" }}>
        <Presence size={140} />
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", alignItems: "center", maxWidth: "860px" }}>
          <span className="e-label">Interviewer is asking</span>
          <h1 className="e-h1" style={{ fontSize: "34px", fontWeight: "600" }}>{question}</h1>
          <HearItAgain onClick={hear} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <MicButton onClick={start} />
          <span className="e-meta">
            Press <Kbd>Space</Kbd> to start answering
          </span>
        </div>
      </div>
      <div className="e-wrap" style={{ width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span className="e-small">Aim for {targetSeconds.from} to {targetSeconds.to} seconds</span>
          <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={skip}>Skip question</button>
        </div>
      </div>
    </FocusShell>
  );
}
