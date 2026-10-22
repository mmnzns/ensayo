// Which application (and which stage) a screen is about. The screens have no route parameters of their own, so the
// choice rides in the location hash after the screen id: "#/6-3-application-overview?app=app_x&stage=stg_2". The route
// parser stops at the "?", so every screen id keeps working with or without it.

import { useSyncExternalStore } from "react";

/** One value from the query part of a location hash, or undefined. */
export function hashParam(hash: string, name: string): string | undefined {
  const q = hash.indexOf("?");
  if (q < 0) return undefined;
  for (const pair of hash.slice(q + 1).split("&")) {
    const eq = pair.indexOf("=");
    const key = eq < 0 ? pair : pair.slice(0, eq);
    if (key !== name) continue;
    try {
      const value = decodeURIComponent(eq < 0 ? "" : pair.slice(eq + 1));
      return value === "" ? undefined : value;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** A screen id with its parameters, ready for `Link to=` or `go()`. Empty values are left out. */
export function withParams(screen: string, params: Record<string, string | null | undefined>): string {
  const parts = Object.entries(params)
    .filter((e): e is [string, string] => !!e[1])
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  return parts.length ? `${screen}?${parts.join("&")}` : screen;
}

function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

/** A parameter of the current location hash; undefined where there is no window (tests that render to a string). */
export function useHashParam(name: string): string | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (typeof window === "undefined" ? undefined : hashParam(window.location.hash, name)),
    () => undefined,
  );
}
