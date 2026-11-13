// A save is refused by the backend while another computer holds the data folder. The window learns of it here, so the
// provider can look at the lock again and show the "open on another computer" page instead of a stray error line.
import { invoke as tauriInvoke } from "@tauri-apps/api/core";

/** The start of the backend's line (`io::OTHER_COMPUTER_LINE`). */
export const OTHER_COMPUTER_PREFIX = "Another computer has Ensayo open";

/** Sent on `window` when a command was refused because another computer holds the folder. */
export const LOCK_LOST_EVENT = "ensayo:lock-lost";

export const isLockLost = (e: unknown): boolean => (typeof e === "string" ? e : e instanceof Error ? e.message : "").trim().startsWith(OTHER_COMPUTER_PREFIX);

/** `invoke`, plus the `LOCK_LOST_EVENT` when the answer is that another computer has the folder. The error still reaches the caller. */
export async function invokeGuarded<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await tauriInvoke<T>(cmd, args);
  } catch (e) {
    if (isLockLost(e) && typeof window !== "undefined") window.dispatchEvent(new Event(LOCK_LOST_EVENT));
    throw e;
  }
}
