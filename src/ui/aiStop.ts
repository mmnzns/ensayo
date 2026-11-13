// Stop on an AI wait. Only the built-in local AI can be stopped (`cancel_local_ai`); a cloud call just finishes.
import { invoke } from "@tauri-apps/api/core";
import type { EngineStatus } from "../data/types";

/** What a story, posting or resume read rejects with when the person pressed Stop (the backend's exact word). */
export const STOPPED = "stopped";

/** True for the error a stopped read ends with. That is not a failure: the screen goes back with nothing changed and no banner. */
export function isStopped(e: unknown): boolean {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  return raw.replace(/^Error:\s*/, "").trim() === STOPPED;
}

/** The Stop button shows only for the built-in local AI. */
export const canStop = (kind: EngineStatus["kind"] | undefined): boolean => kind === "local";

/** Ends the local AI's answer in progress. Quiet when there is nothing to stop. */
export async function stopLocalAi(call: (cmd: string) => Promise<unknown> = (cmd) => invoke(cmd)): Promise<void> {
  try {
    await call("cancel_local_ai");
  } catch {
    // Nothing was running, or the helper is gone: the screen carries on.
  }
}
