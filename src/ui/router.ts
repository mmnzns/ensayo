import { useSyncExternalStore } from "react";
import { askBefore } from "./dirtyGuard";

/** The screen id in a location hash: "#/5-1-stories" is "5-1-stories"; anything else is "" (home). */
export function parseRoute(hash: string): string {
  const m = /^#\/([A-Za-z0-9._-]*)/.exec(hash);
  return m ? m[1] : "";
}

export const hrefFor = (id: string) => `#/${id}`;

function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

export function useRoute(): string {
  return useSyncExternalStore(subscribe, () => parseRoute(window.location.hash), () => "");
}

/** Go to a screen. Asks first when the screen being left has unsaved edits (see dirtyGuard.ts). */
export function go(id: string) {
  askBefore(() => {
    window.location.hash = hrefFor(id);
  });
}
