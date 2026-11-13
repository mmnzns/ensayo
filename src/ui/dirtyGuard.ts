// Unsaved-edit warnings. A screen with something typed that is not saved calls `useDirtyGuard(dirty)`. While that is
// true, every way out of the screen asks first: an in-app Link (see Link.tsx), the sidebar (also Links), a programmatic
// `go()` (see router.ts), and a hash change that slipped through anyway (the back button), which is put back and asked
// about. The question itself is `LeaveDialog`, mounted once in each shell. A screen that has just saved calls `release()`
// before it navigates, so a finished save never asks.

import { useEffect, useRef, useSyncExternalStore } from "react";

export const LEAVE_TITLE = "Leave without saving?";
export const LEAVE_BODY = "Your changes here haven't been saved.";
export const LEAVE_STAY = "Keep editing";
export const LEAVE_GO = "Leave";

interface Guard {
  dirty: boolean;
  /** The screen said it is leaving on purpose (it just saved), so this guard stops asking. */
  released: boolean;
}

const guards = new Set<Guard>();
let pending: (() => void) | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** True while any mounted screen has unsaved edits that have not been released. */
export function isBlocked(): boolean {
  for (const g of guards) if (g.dirty && !g.released) return true;
  return false;
}

/** Runs `proceed` now when nothing is unsaved (returns true), otherwise holds it behind the question (returns false). */
export function askBefore(proceed: () => void): boolean {
  if (!isBlocked()) {
    proceed();
    return true;
  }
  pending = proceed;
  emit();
  return false;
}

/** "Leave": the edits are given up, so every guard stops asking, then the held move runs. */
export function confirmLeave(): void {
  const run = pending;
  pending = null;
  for (const g of guards) g.released = true;
  emit();
  run?.();
}

/** "Keep editing": the held move is dropped. */
export function stayHere(): void {
  pending = null;
  emit();
}

export const isAsking = (): boolean => pending !== null;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
/** Whether the question is showing. */
export const useLeaveQuestion = (): boolean => useSyncExternalStore(subscribe, isAsking, isAsking);

/** A click on a link that the browser would follow in this window: left button, no modifier key, not already handled. */
export function isPlainClick(e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean }): boolean {
  return !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

/** What to do with a location hash change: let it through, or put the old hash back and ask. */
export function hashChangeDecision(blocked: boolean): "accept" | "revert" {
  return blocked ? "revert" : "accept";
}

let lastHash = typeof window === "undefined" ? "" : window.location.hash;
if (typeof window !== "undefined") {
  // Registered when this module loads, before any component's listener, so a change that is put back never reaches the
  // router (stopImmediatePropagation) and the screen never unmounts.
  window.addEventListener("hashchange", (e) => {
    const now = window.location.hash;
    if (hashChangeDecision(isBlocked()) === "accept") {
      lastHash = now;
      return;
    }
    e.stopImmediatePropagation();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${lastHash}`);
    askBefore(() => {
      window.location.hash = now;
    });
  });
}

/**
 * Asks "Leave without saving?" before leaving while `dirty` is true. Returns `release`, which a screen calls right
 * after a successful save and before it navigates, so that move is not asked about.
 */
export function useDirtyGuard(dirty: boolean): { release: () => void } {
  const ref = useRef<Guard>({ dirty, released: false });
  if (ref.current.dirty !== dirty) {
    ref.current.dirty = dirty;
    ref.current.released = false;
  }
  useEffect(() => {
    const g = ref.current;
    guards.add(g);
    return () => void guards.delete(g);
  }, []);
  const release = useRef(() => {
    ref.current.released = true;
  }).current;
  return { release };
}

/** Test helper: forget every guard and any held question. */
export function resetDirtyGuards(): void {
  guards.clear();
  pending = null;
  emit();
}
/** Test helper: add a guard without a component. Returns a function that removes it. */
export function addGuardForTest(g: { dirty: boolean }): () => void {
  const guard: Guard = { dirty: g.dirty, released: false };
  guards.add(guard);
  return () => void guards.delete(guard);
}

const trimmed = (v: unknown): unknown => (typeof v === "string" ? v.trim() : Array.isArray(v) ? v.map(trimmed) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trimmed(x)])) : v);

/** True when the fields hold something other than `baseline`. Spaces at the ends of text don't count. */
export function differs(current: unknown, baseline: unknown): boolean {
  return JSON.stringify(trimmed(current)) !== JSON.stringify(trimmed(baseline));
}
