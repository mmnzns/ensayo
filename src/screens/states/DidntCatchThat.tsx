import { isApp } from "../../data/real";
import { useStore } from "../../data/store";
import { MIN_SPEECH_SECONDS, useLive } from "../../practice/live";
import { usePractice } from "../practice/usePractice";
import Link from "../../ui/Link";
import StatePage from "./StatePage";

/** Under 3 seconds of speech: nothing to give a note on, so record again. */
export default function DidntCatchThat() {
  const { heardSeconds, neededSeconds } = useStore().screens.states.didntCatch;
  const live = useLive().active;
  const { session, endTo, onEnd } = usePractice();
  // Sample numbers only in the browser preview. In the app, the real session or nothing.
  const sample = !live && !isApp();
  const labels = live ? { mode: session.mode, where: `${session.stage} · ${session.position} of ${session.total}` } : sample ? { mode: "Drill", where: "Hiring manager · 2 of 5" } : null;
  return (
    <StatePage
      icon="ear"
      title="Didn't catch that"
      headerLabels={
        labels && (
          <>
            <span className="e-pill" style={{ background: "var(--e-tint)", color: "var(--e-primary-dark)", fontWeight: "600" }} title={labels.mode === "Mock" ? "A whole stage straight through, notes at the end" : "A note after every answer, then try again"}>{labels.mode}</span>
            <span className="e-pill">{labels.where}</span>
          </>
        )
      }
      headerAction={
        <Link to={live ? endTo : sample ? "4-3-session-results-drill" : "2-1-home"} onClick={live ? onEnd : undefined} className="e-btn e-btn-white e-btn-sm">
          {live && session.mode === "Mock" ? "End mock" : "End session"}
        </Link>
      }
      actions={
        <>
          <Link to="3-2-practice-recording" className="e-btn e-btn-primary e-btn-big">Record again</Link>
          <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-ghost">Skip question</Link>
        </>
      }
    >
      <p className="e-body" style={{ margin: 0 }}>
        {sample ? `Ensayo heard ${heardSeconds.toFixed(1)} seconds of speech, which is too short for a note.` : "Ensayo heard too little speech to score."} That answer wasn't counted, so nothing changes in your progress.
      </p>
      <ul className="e-meta" style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "4px" }}>
        <li>Watch the level meter move when you speak.</li>
        <li>Sit a little closer to the microphone.</li>
        <li>Take your pause to think before you press Space. A few seconds of quiet mid-answer is fine.</li>
      </ul>
      <p className="e-small" style={{ margin: 0 }}>A note needs at least {sample ? neededSeconds : MIN_SPEECH_SECONDS} seconds of speech.</p>
    </StatePage>
  );
}
