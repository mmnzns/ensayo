import { useEffect, useRef, useState } from "react";
import { useStore } from "../../data/store";
import Link from "../../ui/Link";
import StatePage from "./StatePage";

/** No internet, or no key saved: practice still works with timing only. */
export default function ErrorOfflineEngine() {
  const { engine } = useStore();
  const [state, setState] = useState<"idle" | "checking" | "still">("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const retry = () => {
    setState("checking");
    timer.current = window.setTimeout(() => setState("still"), 1200);
  };

  return (
    <StatePage
      icon="offline"
      title={`${engine.label} can't be reached`}
      actions={
        <>
          <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-primary e-btn-big">Practice with timing only</Link>
          <button type="button" className="e-btn e-btn-line" onClick={retry} disabled={state === "checking"} style={state === "checking" ? { opacity: 0.6 } : undefined}>
            {state === "checking" ? "Checking" : "Try again"}
          </button>
          <Link to="8-5-settings-ai" className="e-btn e-btn-ghost">AI settings</Link>
        </>
      }
    >
      <p className="e-body" style={{ margin: 0 }}>
        There's no internet, or no key is saved, so Ensayo can't ask the AI engine for notes right now.
      </p>
      <p className="e-meta" style={{ margin: 0 }}>
        Practice still works. After each answer you'll get timing, length and filler words. The notes that need judgment come back when the engine does.
      </p>
      <span className="e-badge" style={{ alignSelf: "flex-start" }}>Timing only for now</span>
      <p role="status" className="e-small" style={{ margin: 0, minHeight: "18px" }}>
        {state === "still" ? "Still no connection. Nothing is lost; try again whenever you like." : ""}
      </p>
    </StatePage>
  );
}
