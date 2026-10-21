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

/** Practice keys (Space, Enter, N, L, R, Esc). Listens only while the calling screen is mounted, so it never leaks into other screens. */
export function useKeys(handlers: KeyHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const name = MAP[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      const fn = name && ref.current[name];
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
