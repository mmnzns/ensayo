// A one-line note that follows the person to the next screen ("That session was deleted" on Home after a delete from
// a results screen). Module-level so it survives the screen change; it clears itself after a few seconds.

import { useSyncExternalStore } from "react";

let message: string | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;

export const FLASH_MS = 8000;

function set(next: string | null) {
  message = next;
  listeners.forEach((l) => l());
}

/** Shows `text` on the next screen that has a flash line. */
export function setFlash(text: string) {
  clearTimeout(timer);
  set(text);
  timer = setTimeout(() => set(null), FLASH_MS);
}

export const clearFlash = () => {
  clearTimeout(timer);
  set(null);
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export const useFlash = (): string | null => useSyncExternalStore(subscribe, () => message, () => message);

/** The line itself, for the top of a screen. Nothing when there is no note. */
export function FlashLine() {
  const text = useFlash();
  if (!text) return null;
  return (
    <div className="e-soft" role="status" style={{ padding: "14px 18px" }}>
      <span className="e-meta">{text}</span>
    </div>
  );
}
