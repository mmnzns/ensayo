// Choosing which target to practice for: the "Practicing for" switcher in the sidebar, and the same choice inline in
// Start a session. Switching is blocked while a practice session is running.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useActions } from "../data/real";
import { useStore } from "../data/store";
import { COLOR_VALUE, applicationTarget, pickableTargets } from "../data/targets";
import type { TargetColor } from "../data/types";
import { getLive } from "../practice/live";
import { switchBlocked } from "../practice/switching";
import Link from "./Link";

/** The small coloured square that stands for a target. */
export function TargetMarker({ color, size = 9 }: { color: TargetColor; size?: number }) {
  return <span aria-hidden="true" style={{ width: size, height: size, borderRadius: 3, background: COLOR_VALUE[color], flex: "none", display: "inline-block" }} />;
}

const FAILED = "That didn't switch. Try again.";

/** What the switcher needs: the targets that can be picked, how many open applications each has, and `choose`. */
export function useTargetChoice() {
  const { targets, activeTarget, applications } = useStore();
  const { setActiveTarget } = useActions();
  const [note, setNote] = useState("");
  const live = pickableTargets(targets, activeTarget?.id);
  const counts: Record<string, number> = {};
  for (const a of applications) {
    if (a.status === "closed") continue;
    const id = applicationTarget(a, targets)?.id;
    if (id) counts[id] = (counts[id] ?? 0) + 1;
  }
  /** True when the choice is now the active target. A running session says so instead and nothing changes. */
  const choose = async (id: string): Promise<boolean> => {
    setNote("");
    const block = switchBlocked(getLive());
    if (block) {
      setNote(block);
      return false;
    }
    if (id === activeTarget?.id) return true;
    try {
      await setActiveTarget(id);
      return true;
    } catch {
      setNote(FAILED);
      return false;
    }
  };
  const hasArchived = targets.some((t) => t.archived);
  return { targets: live, active: activeTarget, counts, note, clearNote: () => setNote(""), choose, hasArchived };
}

const rowStyle = (on: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 10,
  border: "none",
  width: "100%",
  textAlign: "left",
  font: "inherit",
  cursor: "pointer",
  color: "var(--e-ink)",
  background: on ? "var(--e-tint)" : "transparent",
});

const applicationsLine = (n: number) => `${n} ${n === 1 ? "application" : "applications"}`;

/** The list of targets with the active one ticked, then Add a target and Manage targets. `onDone` runs after a successful switch or a link is followed. */
export function TargetChoice({ onDone, withHelp = true }: { onDone: () => void; withHelp?: boolean }) {
  const { targets, active, counts, note, choose, hasArchived } = useTargetChoice();
  const many = targets.length > 1;
  return (
    <>
      {targets.map((t) => {
        const on = t.id === active?.id;
        return (
          <button key={t.id} type="button" role="menuitemradio" aria-checked={on} style={rowStyle(on)} onClick={() => void choose(t.id).then((ok) => ok && onDone())}>
            <TargetMarker color={t.color} />
            <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{t.name}</span>
              <span className="e-small">{[t.role, counts[t.id] ? applicationsLine(counts[t.id]) : ""].filter(Boolean).join(" · ")}</span>
            </span>
            {on && (
              <span style={{ color: "var(--e-primary)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
            )}
          </button>
        );
      })}
      {note && (
        <span role="status" className="e-small" style={{ padding: "6px 12px", color: "var(--e-ink)" }}>
          {note}
        </span>
      )}
      <div style={{ height: 1, background: "var(--e-line)", margin: "6px 4px" }} />
      <Link to="8-3-target-editor" className="e-nav" style={{ minHeight: 40, padding: "8px 12px" }} onClick={onDone}>+ Add a target</Link>
      {(many || hasArchived) && (
        <Link to="8-2-settings-targets" className="e-nav" style={{ minHeight: 40, padding: "8px 12px" }} onClick={onDone}>Manage targets</Link>
      )}
      {withHelp && (
        <span className="e-small" style={{ padding: "8px 12px 6px", lineHeight: 1.45 }}>
          Switches the pitch, questions and lead stories for your next session. Stories, habits and history stay with you.
        </span>
      )}
    </>
  );
}

/** Closes a popover on Escape or a click outside it. */
function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open, close, ref]);
}

/** "Practicing for" under the logo: the active target, and a menu to switch. Hidden before any target exists (setup). */
export default function TargetSwitcher(): ReactNode {
  const { activeTarget } = useStore();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), box);
  if (!activeTarget) return null;
  return (
    <div ref={box} style={{ position: "relative", margin: "0 0 14px" }}>
      <button
        type="button"
        className="t-switch"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "none", borderRadius: 12, background: "var(--e-surface)", boxShadow: open ? "inset 0 0 0 2px var(--e-primary)" : "inset 0 0 0 1.5px var(--e-line)", font: "inherit", cursor: "pointer", textAlign: "left", color: "var(--e-ink)" }}
      >
        <span style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--e-muted)" }}>Practicing for</span>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "14.5px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <TargetMarker color={activeTarget.color} />
            {activeTarget.name}
          </span>
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div role="menu" aria-label="Practicing for" className="e-card" style={{ position: "absolute", left: 0, top: "calc(100% + 8px)", width: 300, padding: 8, zIndex: 5, boxShadow: "0 16px 40px rgba(43,39,34,0.16)", display: "flex", flexDirection: "column", gap: 2 }}>
          <TargetChoice onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
