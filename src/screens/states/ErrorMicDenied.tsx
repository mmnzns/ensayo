import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isApp } from "../../data/real";
import Link from "../../ui/Link";
import { micFix, osOf } from "../first-run/setup";
import StatePage from "./StatePage";

/** The computer is blocking the microphone for Ensayo. "Try again" asks the computer again; in the browser preview
 *  there is no computer to ask, so it stays blocked. */
export default function ErrorMicDenied() {
  const [state, setState] = useState<"idle" | "checking" | "blocked" | "allowed">("idle");
  const os = osOf(typeof navigator === "undefined" ? "" : navigator.userAgent);
  // The last step says "press Check again"; here the button is Try again.
  const steps = micFix(os).map((s) => s.replace("press Check again", "press Try again"));

  const retry = async () => {
    setState("checking");
    const permission = isApp() ? await invoke<string>("mic_permission").catch(() => "unknown") : "denied";
    setState(permission === "denied" || permission === "restricted" ? "blocked" : "allowed");
  };
  // Coming back from the system's settings, ask again.
  useEffect(() => {
    if (!isApp()) return;
    const again = () => void retry();
    window.addEventListener("focus", again);
    return () => window.removeEventListener("focus", again);
  }, []);

  const openSettings = () => {
    if (isApp()) void invoke("open_mic_settings").catch(() => {});
  };

  return (
    <StatePage
      icon="mic"
      title="Ensayo can't hear your microphone"
      actions={
        state === "allowed" ? (
          <button type="button" className="e-btn e-btn-primary e-btn-big" onClick={() => window.history.back()}>Back to practice</button>
        ) : (
          <>
            {isApp() ? (
              <button type="button" className="e-btn e-btn-primary e-btn-big" onClick={openSettings}>Open microphone settings</button>
            ) : (
              <Link to="8-7-settings-check-setup" className="e-btn e-btn-primary e-btn-big">Open settings</Link>
            )}
            <button type="button" className="e-btn e-btn-line" onClick={() => void retry()} disabled={state === "checking"} style={state === "checking" ? { opacity: 0.6 } : undefined}>
              {state === "checking" ? "Checking" : "Try again"}
            </button>
          </>
        )
      }
    >
      <p className="e-body" style={{ margin: 0 }}>
        Your computer is blocking microphone access for Ensayo. Practice is spoken out loud, so this one needs fixing before you can record.
      </p>
      <ol className="e-meta" style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "4px" }}>
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="e-small" style={{ margin: 0 }}>
        Ensayo only listens while you're recording an answer. <Link to="8-7-settings-check-setup">Check setup</Link> tests everything at once.
      </p>
      <p role="status" className="e-small" style={{ margin: 0, minHeight: "18px" }}>
        {state === "blocked" ? "Still blocked. Check that the switches are on, then try again." : state === "allowed" ? "Ensayo can use the microphone now." : ""}
      </p>
    </StatePage>
  );
}
