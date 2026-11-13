// What a session cost, in words. The AI calls of a session add up in the session's budget, and each saved answer
// records that running total (`ai.cost_usd`) with the model that judged it. So a session's cost is the last total, not
// the sum of the answers. When the app was closed and the session continued, the running total starts again from zero;
// a drop in the numbers is read as that restart and the earlier total is kept.
// Nothing is shown for a session that cost nothing: local AI, Ollama, LM Studio and timing-only answers all record 0
// or no AI at all.

import { modelLabel } from "../data/engine";

/** The least that is worth a number: below this the line says "less than a cent". */
const TINY_CENTS = 0.1;

/** "less than a cent", "about 0.4 cents", "about 6 cents", "about $1.20". Not meant for a cost of zero (see `costLine`). */
export function formatCost(usd: number): string {
  const cents = usd * 100;
  if (cents < TINY_CENTS) return "less than a cent";
  if (cents < 0.95) return `about ${cents.toFixed(1)} cents`;
  const whole = Math.round(cents);
  if (whole >= 100) return `about $${usd.toFixed(2)}`;
  return `about ${whole} ${whole === 1 ? "cent" : "cents"}`;
}

interface CostedRep {
  n: number;
  ai_cost_usd?: number | null;
}

/** The session's total in US dollars, from its answers' running totals. 0 when no answer was judged by an AI. */
export function sessionCostUsd(reps: CostedRep[]): number {
  const totals = [...reps].sort((a, b) => a.n - b.n).flatMap((r) => (typeof r.ai_cost_usd === "number" && Number.isFinite(r.ai_cost_usd) ? [r.ai_cost_usd] : []));
  let done = 0;
  let running = 0;
  for (const t of totals) {
    if (t < running - 1e-9) done += running;
    running = t;
  }
  return done + running;
}

/** The model that judged the session's last judged answer, as a name ("Claude Sonnet 5.5"), or null when unknown. */
export function sessionModelName(reps: { n: number; ai_model?: string | null }[]): string | null {
  const last = [...reps].sort((a, b) => b.n - a.n).find((r) => r.ai_model);
  return last?.ai_model ? modelLabel(last.ai_model) : null;
}

/** The engine named on a cost line: the model that judged the session, else the engine set up now when it is a paid one. */
export function engineNameFor(judgedBy: string | null | undefined, current: { kind: "local" | "key" | "timing"; label: string }): string | null {
  return judgedBy ?? (current.kind === "key" ? current.label : null);
}

/** "about 6 cents with Claude Sonnet 5.5", or null when nothing was spent. */
export function costLine(usd: number, engineName?: string | null): string | null {
  if (!(usd > 0)) return null;
  return `${formatCost(usd)}${engineName ? ` with ${engineName}` : ""}`;
}
