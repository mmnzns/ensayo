import { useEffect, useRef } from "react";

export interface KeyHandlers {
  space?: () => void;
  enter?: () => void;
  n?: () => void;
  l?: () => void;
  r?: () => void;
  esc?: () => void;
}

const MAP: Record<string, keyof KeyHandlers> = {
  " ": "space",
  Enter: "enter",
  n: "n",
  l: "l",
  r: "r",
  Escape: "esc",
};

/** The bits of an element the key check reads, so it can be tested without a browser. */
export interface KeyTarget {
  tagName: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
}

/** True when a key pressed with `t` focused belongs to that element. Fields keep every key. A button, a link or a
 *  role=button element keeps Space and Enter (they press it), so a practice key never fires on top of them. */
export function keyBelongsToTarget(t: KeyTarget | null | undefined, name: keyof KeyHandlers | undefined): boolean {
  if (!t) return false;
  if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/i.test(t.tagName)) return true;
  if (name !== "space" && name !== "enter") return false;
  const tag = t.tagName.toUpperCase();
  const attr = (n: string) => t.getAttribute?.(n) ?? null;
  return tag === "BUTTON" || (tag === "A" && attr("href") !== null) || attr("role") === "button";
}

/** Runs the handler a key press maps to, unless the focused element keeps the key. Returns whether it ran one. */
export function runKey(e: Pick<KeyboardEvent, "key" | "repeat" | "metaKey" | "ctrlKey" | "altKey" | "preventDefault"> & { target: unknown }, handlers: KeyHandlers): boolean {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return false;
  const name = MAP[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (keyBelongsToTarget(e.target as KeyTarget | null, name)) return false;
  const fn = name && handlers[name];
  if (!fn) return false;
  e.preventDefault();
  fn();
  return true;
}

/** Practice keys (Space, Enter, N, L, R, Esc). Listens only while the calling screen is mounted, so it never leaks into other screens. */
export function useKeys(handlers: KeyHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => void runKey(e, ref.current);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
