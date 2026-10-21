import { useStore } from "../../data/store";
import Link from "../../ui/Link";
import StatePage from "./StatePage";

/** Under 3 seconds of speech: nothing to give a note on, so record again. */
export default function DidntCatchThat() {
  const { heardSeconds, neededSeconds } = useStore().screens.states.didntCatch;
  return (
    <StatePage
      icon="ear"
      title="Didn't catch that"
      headerLabels={
        <>
          <span className="e-pill" style={{ background: "var(--e-tint)", color: "var(--e-primary-dark)", fontWeight: "600" }} title="A note after every answer, then try again">Drill</span>
          <span className="e-pill">Hiring manager · 2 of 5</span>
        </>
      }
      headerAction={<Link to="4-3-session-results-drill" className="e-btn e-btn-white e-btn-sm">End session</Link>}
      actions={
        <>
          <Link to="3-2-practice-recording" className="e-btn e-btn-primary e-btn-big">Record again</Link>
          <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-ghost">Skip question</Link>
        </>
      }
    >
      <p className="e-body" style={{ margin: 0 }}>
        Ensayo heard {heardSeconds.toFixed(1)} seconds of speech, which is too short for a note. That answer wasn't counted, so nothing changes in your progress.
      </p>
      <ul className="e-meta" style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "4px" }}>
        <li>Watch the level meter move when you speak.</li>
        <li>Sit a little closer to the microphone.</li>
        <li>Take your pause to think before you press Space. A few seconds of quiet mid-answer is fine.</li>
      </ul>
      <p className="e-small" style={{ margin: 0 }}>A note needs at least {neededSeconds} seconds of speech.</p>
    </StatePage>
  );
}
