// Appearance: Auto follows the system (no data-theme), Light and Dark force one. The choice is kept in localStorage,
// which can be missing or blocked, so every access is guarded.

export type ThemeMode = "auto" | "light" | "dark";

export const THEME_KEY = "ensayo.theme";

const isMode = (v: unknown): v is ThemeMode => v === "auto" || v === "light" || v === "dark";

/** The saved choice, or "auto" when nothing is saved or storage is unavailable. */
export function getStoredTheme(): ThemeMode {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return isMode(v) ? v : "auto";
  } catch {
    return "auto";
  }
}

function show(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (mode === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
}

/** Show the mode now and remember it. */
export function applyTheme(mode: ThemeMode): void {
  show(mode);
  try {
    window.localStorage.setItem(THEME_KEY, mode);
  } catch {
    // Storage is blocked; the choice still applies until the app closes.
  }
}

/** Call once at start-up: apply whatever was saved last time. */
export function applyStoredTheme(): void {
  show(getStoredTheme());
}
