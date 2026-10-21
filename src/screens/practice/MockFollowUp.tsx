// Extra screen: the follow-up as it looks in a Mock. Same layout as 3-6 with the Mock label, no notes, no timer.
import { useEffect } from "react";
import { useStore } from "../../data/store";
import FocusShell from "../../ui/FocusShell";
import { go } from "../../ui/router";
import { HearItAgain, Kbd, MicButton, Presence, SessionHeader } from "./parts";
import { hush, speak } from "./speak";
import { useKeys } from "./useKeys";

const NEXT = "4-2-mock-your-questions";
const END = "4-4-session-results-mock-debrief";

export default function MockFollowUp() {
  const { session, followUp } = useStore().screens.practice.mockFollowUp;

  useEffect(() => hush, []);

  const answer = () => go(NEXT);
  const hear = () => speak(followUp.question);

  useKeys({ space: answer, r: hear, esc: () => go(END) });

  return (
    <FocusShell>
      <div className="e-wrap" style={{ width: "100%" }}>
        <SessionHeader session={session} endTo={END} />
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
            Press <Kbd>Space</Kbd> to answer
          </span>
        </div>
      </div>
      <div className="e-wrap" style={{ width: "100%" }}>
        <span className="e-small">Like the real thing: no notes until the end.</span>
      </div>
    </FocusShell>
  );
}
