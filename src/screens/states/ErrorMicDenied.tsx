import { useEffect, useRef, useState } from "react";
import Link from "../../ui/Link";
import StatePage from "./StatePage";

/** The computer is blocking the microphone for Ensayo. */
export default function ErrorMicDenied() {
  const [state, setState] = useState<"idle" | "checking" | "blocked">("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const retry = () => {
    setState("checking");
    timer.current = window.setTimeout(() => setState("blocked"), 1000);
  };

  return (
    <StatePage
      icon="mic"
      title="Ensayo can't hear your microphone"
      actions={
        <>
          <Link to="8-7-settings-check-setup" className="e-btn e-btn-primary e-btn-big">Open settings</Link>
          <button type="button" className="e-btn e-btn-line" onClick={retry} disabled={state === "checking"} style={state === "checking" ? { opacity: 0.6 } : undefined}>
            {state === "checking" ? "Checking" : "Try again"}
          </button>
        </>
      }
    >
      <p className="e-body" style={{ margin: 0 }}>
        Your computer is blocking microphone access for Ensayo. Practice is spoken out loud, so this one needs fixing before you can record.
      </p>
      <ol className="e-meta" style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "4px" }}>
        <li>Open your computer's privacy settings.</li>
        <li>Choose Microphone.</li>
        <li>Switch Ensayo on.</li>
        <li>Come back here and press Try again.</li>
      </ol>
      <p className="e-small" style={{ margin: 0 }}>Ensayo only listens while you're recording an answer.</p>
      <p role="status" className="e-small" style={{ margin: 0, minHeight: "18px" }}>
        {state === "blocked" ? "Still blocked. Check that Ensayo is switched on in the list, then try again." : ""}
      </p>
    </StatePage>
  );
}
