// Practice, clarifying question. Draft from Design/screens/html/3-7-clarifying-question.html.
import { useEffect } from "react";
import { useStore } from "../../data/store";
import { useLive } from "../../practice/live";
import FocusShell from "../../ui/FocusShell";
import { go } from "../../ui/router";
import { Kbd, MicButton, SessionHeader } from "./parts";
import { RECORD, resetFlow } from "./practiceFlow";
import { usePractice } from "./usePractice";
import { useKeys } from "./useKeys";

export default function ClarifyingQuestion() {
  const mock = useStore().screens.practice.clarifying;
  const { live, session: liveSession, endTo, onEnd } = usePractice();
  const state = useLive();
  const session = live ? liveSession : mock.session;
  const messages = live && state.clarify ? state.clarify : mock.messages;

  // This is a different question from the one in the result chain.
  useEffect(() => {
    if (!live) resetFlow();
  }, [live]);

  const end = () => {
    onEnd?.();
    go(endTo);
  };
  useKeys({ space: () => go(RECORD), esc: end });

  return (
    <FocusShell>
      <div className="e-wrap" style={{ width: "100%" }}>
        <SessionHeader session={session} endTo={endTo} onEnd={onEnd} />
      </div>
      <div style={{ flex: "1", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 0" }}>
        <div style={{ width: "100%", maxWidth: "760px", display: "flex", flexDirection: "column", gap: "18px" }}>
          {messages.map((m, i) =>
            m.from === "interviewer" ? (
              <div key={i} style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                <div className="e-presence" style={{ width: "44px", height: "44px" }} aria-hidden="true">
                  <span style={{ width: "18px", height: "18px" }} />
                </div>
                <div className="e-card" style={{ padding: "20px 24px", borderTopLeftRadius: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span className="e-small">Interviewer</span>
                  <span style={{ fontSize: "20px", fontWeight: "600", lineHeight: "1.4" }}>{m.text}</span>
                </div>
              </div>
            ) : (
              <div key={i} style={{ display: "flex", gap: "14px", alignItems: "flex-start", justifyContent: "flex-end" }}>
                <div className="e-soft" style={{ padding: "18px 22px", borderTopRightRadius: "8px", display: "flex", flexDirection: "column", gap: "6px", maxWidth: "520px" }}>
                  <span className="e-small">You</span>
                  <span style={{ fontSize: "18px", lineHeight: "1.5" }}>{m.text}</span>
                </div>
              </div>
            ),
          )}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", paddingTop: "18px" }}>
            <MicButton size={88} to={RECORD} />
            <span className="e-meta">
              Answer when you're ready · <Kbd>Space</Kbd>
            </span>
            <span className="e-small">Asking to clarify is a good move. It isn't judged.</span>
          </div>
        </div>
      </div>
    </FocusShell>
  );
}
