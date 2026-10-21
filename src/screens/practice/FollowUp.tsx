// Practice, follow-up. Draft from Design/screens/html/3-6-follow-up.html. Answering goes through thinking and back to the result chain.
import { useEffect } from "react";
import { useStore } from "../../data/store";
import FocusShell from "../../ui/FocusShell";
import { go } from "../../ui/router";
import { HearItAgain, Kbd, MicButton, Presence, SessionHeader } from "./parts";
import { ASK, END_SESSION, resetFlow, setFollowUp, THINK } from "./practiceFlow";
import { hush, speak } from "./speak";
import { useKeys } from "./useKeys";

export default function FollowUp() {
  const { session, followUp } = useStore().screens.practice;

  useEffect(() => hush, []);

  const answer = () => {
    setFollowUp(true);
    go(THINK);
  };
  const hear = () => speak(followUp.question);
  const skip = () => {
    resetFlow();
    go(ASK);
  };

  useKeys({ space: answer, r: hear, n: skip, esc: () => go(END_SESSION) });

  return (
    <FocusShell>
      <div className="e-wrap" style={{ width: "100%" }}>
        <SessionHeader session={session} />
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
