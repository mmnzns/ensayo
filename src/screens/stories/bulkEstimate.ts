// What reading many stories will roughly cost and how long it takes, said before it starts. There is no exact figure
// for a story read, so this is built from the story prompt's typical size, the price list the app already has (the
// same one the spending cap uses) and the time a story read usually takes (see Working.tsx). Always called approximate.
import type { EngineStatus } from "../../data/types";
import { formatCost } from "../../practice/cost";
import { expectedSeconds } from "../applications/Working";

/** The story prompt and its answer format, in tokens (about 3.7 KB of prompt plus the schema). */
export const PROMPT_TOKENS = 1400;
/** A typical answer: the filled-in story with its numbers and follow-ups. */
export const ANSWER_TOKENS = 800;

/** Roughly one token for every four characters of English. */
export const tokensFor = (chars: number): number => Math.ceil(chars / 4);

/** US dollars for reading `count` stories of `totalChars` characters in all, at `[input, output]` dollars per million tokens. */
export function estimateUsd(count: number, totalChars: number, price: [number, number]): number {
  const input = count * PROMPT_TOKENS + tokensFor(totalChars);
  const output = count * ANSWER_TOKENS;
  return (input * price[0] + output * price[1]) / 1_000_000;
}

/** Seconds for `count` reads, one after another. */
export const estimateSeconds = (count: number, kind: EngineStatus["kind"]): number => count * expectedSeconds("story", kind);

export function timeWords(seconds: number): string {
  if (seconds <= 15) return "a few seconds";
  if (seconds <= 60) return "under a minute";
  if (seconds < 120) return "under 2 minutes";
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `about ${minutes} minutes`;
  const hours = Math.round(minutes / 6) / 10;
  return `about ${hours} hours`;
}

export const NO_ENGINE_LINE = "Reading needs a feedback engine. Choose one in Settings, then come back, or add stories one at a time and fill them in yourself.";

export interface EstimateInput {
  count: number;
  totalChars: number;
  kind: EngineStatus["kind"];
  /** Dollars per million tokens, `[input, output]`, for a cloud model; null when the model is not on the price list. */
  price: [number, number] | null;
}

/** One plain sentence for the screen. */
export function estimateLine({ count, totalChars, kind, price }: EstimateInput): string {
  if (kind === "timing") return NO_ENGINE_LINE;
  const time = timeWords(estimateSeconds(count, kind));
  if (kind === "local") return `Reading ${count === 1 ? "it" : "them all"} should take ${time} on this computer. This is a rough guess, and it costs nothing.`;
  if (!price) return `Reading ${count === 1 ? "it" : "them all"} should take ${time} with your AI key. Ensayo doesn't know this model's price, so it can't guess the cost. This is a rough guess.`;
  const cost = formatCost(estimateUsd(count, totalChars, price));
  return `Reading ${count === 1 ? "it" : "them all"} should cost ${cost} and take ${time} with your AI key. This is a rough guess.`;
}
