import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { isApp } from "../../data/real";
import { useStore } from "../../data/store";
import Link from "../../ui/Link";
import { missingSteps, type MissingStep } from "../first-run/setup";
import { useSpeech } from "../first-run/useSpeech";
import { readPrefs, setupDismissed, updateSetup } from "../settings/prefs";

/** What the computer says about the microphone, read again when the window is focused (coming back from system settings). */
function useMicPermission(): string | null {
  const [permission, setPermission] = useState<string | null>(null);
  useEffect(() => {
    const check = () => void invoke<string>("mic_permission").then(setPermission, () => setPermission("unknown"));
    check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, []);
  return permission;
}

export function FinishSetupView({ steps, onDismiss }: { steps: MissingStep[]; onDismiss?: () => void }) {
  if (steps.length === 0) return null;
  return (
    <section className="e-soft" aria-label="Finish setting up" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
        <span className="e-h3">Finish setting up</span>
        {onDismiss && (
          <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={onDismiss}>Not now</button>
        )}
      </span>
      {steps.map((s) => (
        <div key={s.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 16px" }}>
          <span style={{ flex: "1 1 360px", display: "flex", flexDirection: "column", gap: "2px" }}>
            <strong>{s.title}</strong>
            <span className="e-meta">{s.line}</span>
          </span>
          <Link to={s.to} className="e-btn e-btn-white e-btn-sm">{`Set up ${s.title.toLowerCase()}`}</Link>
        </div>
      ))}
    </section>
  );
}

function FinishSetupLive({ skip }: { skip?: MissingStep["id"] }) {
  const store = useStore();
  const permission = useMicPermission();
  const { plan } = useSpeech();
  const [dismissed, setDismissed] = useState<string[]>(() => readPrefs().setup.dismissed);
  const steps = missingSteps(permission, plan, store.engine.kind).filter((s) => s.id !== skip);
  // "Not now" hides the card until the set of missing steps changes (one is finished, or another goes missing).
  if (setupDismissed(steps.map((s) => s.id), dismissed)) return null;
  return <FinishSetupView steps={steps} onDismiss={() => setDismissed(updateSetup({ dismissed: steps.map((s) => s.id) }).setup.dismissed)} />;
}

/** In the app, the setup steps that were never finished. Nothing in the browser preview. `skip` leaves one out where the page already says it. */
export default function FinishSetup({ skip }: { skip?: MissingStep["id"] }) {
  return isApp() ? <FinishSetupLive skip={skip} /> : null;
}
