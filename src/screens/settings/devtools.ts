// "Show developer tools" (Settings, About): a tiny module-level store so the Settings sidebar and the About
// toggle agree. The choice is kept in localStorage when it is available.
import { useSyncExternalStore } from "react";

const KEY = "ensayo.developerTools";
const listeners = new Set<() => void>();
let value: boolean | undefined;

function read(): boolean {
  if (value === undefined) {
    try {
      value = window.localStorage.getItem(KEY) === "on";
    } catch {
      value = false;
    }
  }
  return value;
}

export function setDeveloperTools(on: boolean): void {
  value = on;
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Storage is blocked; the toggle still works until the app closes.
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useDeveloperTools(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
