import { useEffect } from "react";
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import { go } from "../../ui/router";
import Wordmark from "../../ui/Wordmark";
import { isApp } from "../../data/real";
import { useStore } from "../../data/store";
import { startQuickDrill, FIRST_DRILL } from "../../practice/quick";
import { setFromSetup, setParsedDraft } from "../stories/selection";
import LoopSteps from "./LoopSteps";

/** Step 8 of the first run: a short, warm card. Not in the design export. In the browser it follows the sample first rep; in the app it comes before the first real question. */
export default function ThatsTheLoop() {
  const store = useStore();
  const { profile } = store;
  const app = isApp();
  // Setup is over: nothing of the story step is left waiting.
  useEffect(() => {
    setFromSetup(false);
    setParsedDraft(null);
  }, []);
  if (app) {
    // The first question fits the newest story when there is one; a real session starts, then the asking screen.
    const newest = store.stories.length > 0 ? store.stories[store.stories.length - 1] : undefined;
    const begin = () => {
      startQuickDrill({ targetRole: profile.targetRole, stories: store.stories, methods: store.methods }, { count: FIRST_DRILL, storyId: newest?.id });
      go("3-1-practice-interviewer-asking");
    };
    return (
      <FocusShell>
        <div style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "36px", textAlign: "center", padding: "40px 0" }}>
          <Wordmark size={48} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
            <h1 className="e-h1" style={{ fontSize: "44px", maxWidth: "760px" }}>That's the loop</h1>
            <p className="e-meta" style={{ margin: "0", fontSize: "18px", maxWidth: "640px" }}>
              {profile.name}, you're set up. Every session is the same three steps: answer a question out loud, get one fix, and answer it again. Let's try the first one now, or start from Home whenever you like.
            </p>
          </div>
          <LoopSteps />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
            <button type="button" className="e-btn e-btn-primary e-btn-big" onClick={begin}>Try your first question</button>
            <Link to="2-1-home" className="e-small">Go to Home</Link>
          </div>
        </div>
      </FocusShell>
    );
  }
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
