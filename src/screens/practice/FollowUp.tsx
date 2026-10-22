// Practice, follow-up. Draft from Design/screens/html/3-6-follow-up.html. Answering goes through thinking and back to the result chain.
import { useEffect } from "react";
import { useStore } from "../../data/store";
import { endFollowUp, resultRoute, retryQuestion, useLive } from "../../practice/live";
import FocusShell from "../../ui/FocusShell";
import { go } from "../../ui/router";
import { HearItAgain, Kbd, MicButton, Presence, SessionHeader } from "./parts";
import { ASK, RECORD, resetFlow, setFollowUp, THINK } from "./practiceFlow";
import { hush, speak } from "./speak";
import { usePractice } from "./usePractice";
import { useKeys } from "./useKeys";

export default function FollowUp() {
  const mock = useStore().screens.practice;
  const { live, session, original, endTo, onEnd } = usePractice();
  const state = useLive();
  // In a real session the question comes from the interviewer model; in the preview it is the sample one.
  const followUp = live && state.followUp ? { question: state.followUp.question, number: state.followUp.number, of: state.followUp.of, answered: original } : mock.followUp;
  const failed = live && state.phase === "error";

  useEffect(() => hush, []);

  const answer = () => {
    if (live) return go(RECORD);
    setFollowUp(true);
    go(THINK);
  };
  const hear = () => speak(followUp.question);
  const skip = () => {
    if (live) {
      endFollowUp();
      return go(resultRoute());
    }
    resetFlow();
    go(ASK);
  };
  const end = () => {
    onEnd?.();
    go(endTo);
  };

  useKeys({ space: failed ? undefined : answer, r: hear, n: skip, esc: end });

  return (
    <FocusShell>
      <div className="e-wrap" style={{ width: "100%" }}>
        <SessionHeader session={session} endTo={endTo} onEnd={onEnd} />
      </div>
      <div style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "32px", textAlign: "center", padding: "32px 0" }}>
        <div className="e-soft" style={{ maxWidth: "640px", padding: "14px 20px", display: "flex", flexDirection: "column", gap: "4px", textAlign: "left", background: "var(--e-surface)" }}>
          <span className="e-small">You answered</span>
          <span className="e-meta">{followUp.answered}</span>
        </div>
        <Presence size={120} />
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", alignItems: "center", maxWidth: "860px" }}>
          <span className="e-pill" style={{ background: "var(--e-tint)", color: "var(--e-primary-dark)", fontWeight: "600" }}>Follow-up {followUp.number} of {followUp.of}</span>
          <h1 className="e-h1" style={{ fontSize: "34px", fontWeight: "600" }}>{followUp.question}</h1>
          <HearItAgain onClick={hear} />
        </div>
        {live && state.phase === "notice" && state.notice && (
          <div className="e-soft" role="status" style={{ maxWidth: "560px", textAlign: "center" }}>
            <span className="e-meta" style={{ color: "var(--e-ink)" }}>{state.notice}</span>
          </div>
        )}
        {failed && (
          <div className="e-soft" role="alert" style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center", maxWidth: "560px" }}>
            <span className="e-meta" style={{ color: "var(--e-warn-ink)" }}>{state.error}</span>
            <button type="button" className="e-btn e-btn-soft e-btn-sm" onClick={() => void retryQuestion()}>Try again</button>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <MicButton onClick={answer} />
          <span className="e-meta">
            Press <Kbd>Space</Kbd> to answer · keep it shorter than the first
          </span>
        </div>
      </div>
      <div className="e-wrap" style={{ width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={skip}>Skip follow-up</button>
        </div>
      </div>
    </FocusShell>
  );
}
