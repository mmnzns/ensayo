// What a long save is doing right now, with a running clock, so a slow AI read never looks like a hang.
import { useEffect, useState } from "react";
import type { EngineStatus } from "../../data/types";

export type WorkStep = "save" | "posting" | "resume";

const STEP_LABEL: Record<WorkStep, string> = { save: "Saving the application", posting: "Reading the posting", resume: "Reading the resume" };

/** How long a step usually takes with this engine, in plain words. From real runs: with GPT-6 Sol a posting took about
 * 30 seconds and a resume about 40; the local model is several times slower; keywords and patterns are instant. */
export function stepTime(step: WorkStep, kind: EngineStatus["kind"]): string {
  if (step === "save") return "";
  if (kind === "key") return "Usually under a minute.";
  if (kind === "local") return "With the local AI this can take a few minutes.";
  return "";
}

/** 0:07, 1:24: the time since the save started. */
export function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The steps in this save, the one running now, and the clock. Steps are listed in the order they run. */
export default function Working({ steps, current, kind }: { steps: WorkStep[]; current: WorkStep; kind: EngineStatus["kind"] }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const at = steps.indexOf(current);
  const hint = stepTime(current, kind);
  return (
    <div className="e-soft" role="status" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px" }}>
        <span style={{ fontSize: "15px", fontWeight: "600" }}>{`${STEP_LABEL[current]}…`}</span>
        <span className="e-meta" aria-label="Time so far" style={{ fontVariantNumeric: "tabular-nums" }}>{clock(seconds)}</span>
      </div>
      <ol style={{ margin: "0", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "2px" }}>
        {steps.map((s, i) => (
          <li key={s} className="e-meta" style={i === at ? { color: "var(--e-ink)", fontWeight: "600" } : undefined}>
            {i < at ? `${STEP_LABEL[s]} · done` : STEP_LABEL[s]}
          </li>
        ))}
      </ol>
      <span className="e-small">{`${hint ? `${hint} ` : ""}It's still working while the clock moves. Keep this screen open.`}</span>
    </div>
  );
}
