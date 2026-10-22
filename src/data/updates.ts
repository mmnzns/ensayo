/**
 * The pending update, shared by everything in the window (the banner in the app shell and Settings › About). Rust
 * keeps the version the last check found (`updates_pending`) and says when a check finds one (`update-available`),
 * so every screen agrees; this module adds what is per window: Later (hides the banner for that version until
 * Ensayo restarts), the install progress and the result of a manual check.
 *
 * In the browser preview (no Tauri) there is nothing to ask: the bridge is empty and the banner never shows.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useSyncExternalStore } from "react";

export interface PendingUpdate {
  version: string;
  notes?: string | null;
  first?: boolean;
}

export type InstallPhase =
  | { state: "idle" }
  | { state: "installing"; percent: number | null }
  | { state: "restarting" }
  | { state: "error"; message: string };

/** The result line under Check for updates. */
export type CheckState = { state: "idle" } | { state: "checking" } | { state: "up-to-date" } | { state: "found"; version: string } | { state: "offline"; message: string };

export interface UpdateSnapshot {
  pending: PendingUpdate | null;
  phase: InstallPhase;
  /** The version the banner was hidden for (Later). */
  laterFor: string | null;
  check: CheckState;
}

/** What Rust says while installing: the percent, then `restarting`, or `error` on any failure. */
export interface UpdateProgress {
  percent?: number | null;
  restarting?: boolean;
  error?: string;
}

/** The native side. Tests pass a fake; the preview has none. */
export interface UpdateBridge {
  pending(): Promise<PendingUpdate | null>;
  check(): Promise<PendingUpdate | null>;
  install(): Promise<void>;
  onAvailable(cb: (p: PendingUpdate) => void): void;
  onProgress(cb: (p: UpdateProgress) => void): void;
}

const initial: UpdateSnapshot = { pending: null, phase: { state: "idle" }, laterFor: null, check: { state: "idle" } };
let snap: UpdateSnapshot = initial;
const subscribers = new Set<() => void>();
let started: UpdateBridge | null = null;

function set(next: Partial<UpdateSnapshot>) {
  snap = { ...snap, ...next };
  subscribers.forEach((f) => f());
}

const subscribe = (f: () => void) => {
  subscribers.add(f);
  return () => subscribers.delete(f);
};

/** True inside the desktop app. */
const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** The real bridge, or null in a browser. */
let real: UpdateBridge | null = null;
export function tauriBridge(): UpdateBridge | null {
  if (!inTauri()) return null;
  if (real) return real;
  const call = <T>(cmd: string): Promise<T> => invoke<T>(cmd);
  const hear = <T>(name: string, cb: (p: T) => void) => {
    void listen<T>(name, (e) => cb(e.payload)).catch(() => {});
  };
  real = {
    pending: () => call<PendingUpdate | null>("updates_pending"),
    check: () => call<PendingUpdate | null>("updates_check"),
    install: () => call<void>("updates_install"),
    onAvailable: (cb) => hear("update-available", cb),
    onProgress: (cb) => hear("update-progress", cb),
  };
  return real;
}

/** Asks Rust once per window, then listens. */
export function start(bridge: UpdateBridge | null) {
  if (!bridge || started === bridge) return;
  started = bridge;
  void bridge
    .pending()
    .then((p) => p && found(p))
    .catch(() => {});
  bridge.onAvailable((p) => found(p));
  bridge.onProgress(progressed);
}

/** Install progress from Rust (a failure ends it here too). */
export function progressed(p: UpdateProgress) {
  if (p.error) set({ phase: { state: "error", message: p.error } });
  else if (p.restarting) set({ phase: { state: "restarting" } });
  else set({ phase: { state: "installing", percent: p.percent ?? null } });
}

/** A check found `p` (or, with null, found nothing newer). */
export function found(p: PendingUpdate | null) {
  set({ pending: p });
}

/** Later: hide the banner for this version until Ensayo restarts. See what's new brings it back. */
export function later() {
  set({ laterFor: snap.pending?.version ?? null, phase: snap.phase.state === "error" ? { state: "idle" } : snap.phase });
}

export function showBanner() {
  set({ laterFor: null });
}

/** Update now: download, install, restart. While recording, Rust refuses with its own words. */
export async function install(bridge: UpdateBridge | null) {
  if (!bridge || snap.phase.state === "installing" || snap.phase.state === "restarting") return;
  set({ phase: { state: "installing", percent: null } });
  try {
    await bridge.install(); // the app restarts before this returns
    set({ phase: { state: "restarting" } });
  } catch (e) {
    set({ phase: { state: "error", message: errorText(e) } });
  }
}

/** Check for updates (Settings › About): the answer goes to `check` and to the shared pending version. */
export async function checkNow(bridge: UpdateBridge | null) {
  if (!bridge || snap.check.state === "checking") return;
  set({ check: { state: "checking" } });
  try {
    const p = await bridge.check();
    found(p);
    set({ check: p ? { state: "found", version: p.version } : { state: "up-to-date" } });
  } catch (e) {
    set({ check: { state: "offline", message: errorText(e) } });
  }
}

/** Tauri commands reject with the message string. */
function errorText(e: unknown): string {
  if (typeof e === "string" && e) return e;
  if (e instanceof Error && e.message) return e.message;
  return "Something went wrong. Try again in a moment.";
}

/** Whether the banner shows: an update is pending and Later wasn't clicked for it (or it is installing). */
export function bannerVisible(s: UpdateSnapshot): boolean {
  if (!s.pending) return false;
  return s.phase.state === "installing" || s.phase.state === "restarting" || s.laterFor !== s.pending.version;
}

/** The words for an install in progress. Null when idle. */
export function phaseText(phase: InstallPhase): string | null {
  switch (phase.state) {
    case "installing":
      return phase.percent === null ? "Downloading the update" : `Downloading the update, ${phase.percent}%`;
    case "restarting":
      return "Restarting Ensayo";
    case "error":
      return phase.message;
    default:
      return null;
  }
}

/** The result line under Check for updates, in plain words. Null before any check. */
export function checkText(c: CheckState): string | null {
  switch (c.state) {
    case "checking":
      return "Checking";
    case "up-to-date":
      return "You're up to date";
    case "found":
      return `Ensayo ${c.version} is ready to install`;
    case "offline":
      return c.message;
    default:
      return null;
  }
}

/**
 * What a screen reader hears (the live region): that the download started, every 25%, Restarting and a failure.
 * The visible line moves with each percent; this text changes only at those steps, so it isn't read out 100 times.
 */
export function liveText(phase: InstallPhase): string | null {
  switch (phase.state) {
    case "installing": {
      const step = phase.percent === null ? 0 : Math.min(75, Math.floor(phase.percent / 25) * 25);
      return step === 0 ? "Downloading the update" : `Downloading the update, ${step}%`;
    }
    case "restarting":
      return "Restarting Ensayo";
    case "error":
      return phase.message;
    default:
      return null;
  }
}

export function useUpdate() {
  const bridge = tauriBridge();
  const present = bridge !== null;
  useEffect(() => {
    if (present) start(bridge);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present]);
  const s = useSyncExternalStore(subscribe, () => snap, () => initial);
  return { ...s, available: present, bannerVisible: bannerVisible(s), install: () => install(bridge), checkNow: () => checkNow(bridge), later, showBanner };
}

export const updateSnapshot = () => snap;

/** Tests only. */
export function resetUpdateForTests() {
  snap = initial;
  started = null;
}
