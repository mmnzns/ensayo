import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import Wordmark from "../../ui/Wordmark";
import { useStore } from "../../data/store";
import LoopSteps from "./LoopSteps";

/** Step 8 of the first run: a short, warm card after the first rep. Not in the design export. */
export default function ThatsTheLoop() {
  const { profile } = useStore();
  return (
    <FocusShell>
      <div style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "36px", textAlign: "center", padding: "40px 0" }}>
        <Wordmark size={48} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
          <h1 className="e-h1" style={{ fontSize: "44px", maxWidth: "760px" }}>That's the loop</h1>
          <p className="e-meta" style={{ margin: "0", fontSize: "18px", maxWidth: "640px" }}>
            {profile.name}, you just answered a question out loud, got one fix, and answered it again. That is the whole practice. Every session is this, with a new question.
          </p>
        </div>
        <LoopSteps />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
          <Link to="2-1-home" className="e-btn e-btn-primary e-btn-big">Go to Home</Link>
          <Link to="3-1-practice-interviewer-asking" className="e-small">Practice another</Link>
        </div>
      </div>
    </FocusShell>
  );
}
