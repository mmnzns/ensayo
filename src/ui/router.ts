import { useSyncExternalStore } from "react";

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

export function go(id: string) {
  window.location.hash = hrefFor(id);
}
