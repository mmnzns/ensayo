// Practice, thinking. Draft from Design/screens/html/3-3-practice-thinking.html. Moves on to the current result after about 2.5 seconds.
import { useEffect } from "react";
import { clock } from "../../data/screens/practice";
import { useStore } from "../../data/store";
import FocusShell from "../../ui/FocusShell";
import { go } from "../../ui/router";
import { SessionHeader } from "./parts";
import { END_SESSION, getAttempt, resultAfterThinking, setFollowUp } from "./practiceFlow";
import { useKeys } from "./useKeys";

export const THINKING_MS = 2500;

const tick = (
  <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: "var(--e-primary)", color: "var(--e-primary-ink)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  </span>
);

export default function PracticeThinking() {
  const { session, attempts, thinking } = useStore().screens.practice;
  const attempt = attempts[Math.min(getAttempt(), attempts.length) - 1];

  useEffect(() => {
    const id = window.setTimeout(() => {
      const next = resultAfterThinking();
      setFollowUp(false);
      go(next);
    }, THINKING_MS);
    return () => window.clearTimeout(id);
  }, []);

  useKeys({ esc: () => go(END_SESSION) });

  return (
    <FocusShell>
      <style>{`@keyframes e-think-spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:no-preference){.e-think-spin{animation:e-think-spin 0.9s linear infinite}}`}</style>
      <div className="e-wrap" style={{ width: "100%" }}>
        <SessionHeader session={session} />
      </div>
      <div style={{ flex: "1", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 0" }}>
        <div className="e-card" style={{ width: "100%", maxWidth: "520px", padding: "40px", display: "flex", flexDirection: "column", gap: "26px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span className="e-hand" style={{ fontSize: "28px" }}>Listening back...</span>
            <span className="e-meta">
              {attempt ? `Your answer: ${clock(attempt.durationSeconds)}. ` : ""}About {thinking.extraSeconds} more seconds.
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            <div className="e-rowline">
              {tick}
              {" "}<span style={{ flex: "1", fontSize: "16px" }}>Turning your answer into text</span>{" "}<span className="e-small">{thinking.speechWhere}</span>
            </div>
            <div className="e-rowline">
              {tick}
              {" "}<span style={{ flex: "1", fontSize: "16px" }}>Timing and filler words</span>{" "}<span className="e-small">Done</span>
            </div>
            <div className="e-rowline" style={{ borderBottom: "none" }}>
              <span className="e-think-spin" style={{ width: "24px", height: "24px", borderRadius: "50%", boxShadow: "inset 0 0 0 3px var(--e-tint)", borderTop: "3px solid var(--e-primary)", boxSizing: "border-box", flex: "none" }} aria-hidden="true" />{" "}<span style={{ flex: "1", fontSize: "16px", fontWeight: "600" }}>Picking the one thing to fix</span>{" "}<span className="e-small">{thinking.engine}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="e-wrap" style={{ width: "100%" }}>
        <span className="e-small" style={{ textAlign: "center" }}>Your audio stays on this computer. Only the text is checked.</span>
      </div>
    </FocusShell>
  );
}
