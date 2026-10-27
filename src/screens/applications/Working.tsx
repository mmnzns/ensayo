// What a long save or read is doing right now: a bar with a percentage, a running clock and the steps, so a slow AI read
// never looks like a hang. The percentage is an estimate from the time so far against how long the steps usually take.
import { useEffect, useState } from "react";
import type { EngineStatus } from "../../data/types";

export type WorkStep = "save" | "posting" | "resume";

const STEP_LABEL: Record<WorkStep, string> = { save: "Saving the application", posting: "Reading the posting", resume: "Reading the resume" };

/** Seconds a step usually takes with this engine. From real runs: with GPT-6 Sol a posting took about 30 seconds and a
 *  resume about 40; the local model is several times slower; keywords and patterns are close to instant. */
export function expectedSeconds(step: WorkStep, kind: EngineStatus["kind"]): number {
  if (step === "save") return 2;
  if (kind === "key") return 45;
  if (kind === "local") return 180;
  return 5;
}

const WITH: Record<EngineStatus["kind"], string> = { key: " with your AI key", local: " with the local AI", timing: "" };

/** "Usually under a minute with your AI key.": how long these steps usually take, said before they start. */
export function usualTime(steps: WorkStep[], kind: EngineStatus["kind"]): string {
  if (!steps.some((s) => s !== "save")) return "";
  const total = steps.reduce((sum, s) => sum + expectedSeconds(s, kind), 0);
  const span = total <= 15 ? "a few seconds" : total <= 60 ? "under a minute" : total < 120 ? "under 2 minutes" : `about ${Math.round(total / 60)} minutes`;
  return `Usually ${span}${WITH[kind]}.`;
}

/** How long one step usually takes, in plain words; nothing for the save itself. */
export function stepTime(step: WorkStep, kind: EngineStatus["kind"]): string {
  return usualTime([step], kind);
}

/** The cap the estimate never passes while the work is still running. */
export const MAX_WHILE_RUNNING = 95;

/** The estimated percentage: fast at the start, slowing as it nears the expected time, never past 95 until the work is
 *  done, then 100. About 82 at the expected time. */
export function workPercent(elapsedSeconds: number, expected: number, done = false): number {
  if (done) return 100;
  if (elapsedSeconds <= 0 || expected <= 0) return 0;
  return Math.min(MAX_WHILE_RUNNING, Math.floor(MAX_WHILE_RUNNING * (1 - Math.exp((-2 * elapsedSeconds) / expected))));
}

/** The percentage for a run of steps: the time estimate over all of them, and never less than the share of steps already done. */
export function stepsPercent(steps: WorkStep[], current: WorkStep, kind: EngineStatus["kind"], elapsedSeconds: number, done = false): number {
  const total = steps.reduce((sum, s) => sum + expectedSeconds(s, kind), 0);
  const at = Math.max(0, steps.indexOf(current));
  const doneShare = steps.slice(0, at).reduce((sum, s) => sum + expectedSeconds(s, kind), 0) / (total || 1);
  return Math.max(workPercent(elapsedSeconds, total, done), Math.floor(MAX_WHILE_RUNNING * doneShare));
}

/** 0:07, 1:24: the time since the work started. */
export function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The steps, the one running now, the bar and the clock. Steps are listed in the order they run. `done` jumps the bar to 100. */
export default function Working({ steps, current, kind, done = false }: { steps: WorkStep[]; current: WorkStep; kind: EngineStatus["kind"]; done?: boolean }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const at = steps.indexOf(current);
  const percent = stepsPercent(steps, current, kind, seconds, done);
  const expected = steps.reduce((sum, s) => sum + expectedSeconds(s, kind), 0);
  const late = !done && seconds > expected;
  const usual = usualTime(steps, kind);
  return (
    <div className="e-soft" role="status" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px" }}>
        <span style={{ fontSize: "15px", fontWeight: "600" }}>{done ? "Done" : `${STEP_LABEL[current]}…`}</span>
        <span className="e-meta" style={{ fontVariantNumeric: "tabular-nums" }}>
          {`${percent}% · `}
          <span aria-label="Time so far">{clock(seconds)}</span>
        </span>
      </div>
      <div className="e-bar" role="progressbar" aria-label="Estimated progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <span style={{ width: `${percent}%`, transition: "width 0.9s ease-out" }} />
      </div>
      <ol style={{ margin: "0", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "2px" }}>
        {steps.map((s, i) => (
          <li key={s} className="e-meta" style={i === at && !done ? { color: "var(--e-ink)", fontWeight: "600" } : undefined}>
            {i < at || done ? `${STEP_LABEL[s]} · done` : STEP_LABEL[s]}
          </li>
        ))}
      </ol>
      <span className="e-small">
        {late
          ? "This is taking longer than usual, but it's still working while the clock moves. Keep this screen open."
          : `${usual ? `${usual} ` : ""}The percentage is an estimate from the time so far. Keep this screen open.`}
      </span>
    </div>
  );
}
