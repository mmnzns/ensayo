// The spending-limit question: "You've reached this session's spending limit". The backend emits
// `spending-cap-reached` ({ key, spent, cap, limit }) right after the AI step that took a session to its limit, and again
// when an AI step is refused at it. The question waits while an answer is being recorded or the interviewer is speaking,
// and shows when that ends. "Keep going" allows another full cap; "Timing only" ends AI feedback for the session.

import { listen } from "@tauri-apps/api/event";
import { useSyncExternalStore } from "react";
import Dialog from "../screens/states/Dialog";
import { rescoreAfterCap, useLive, type Phase } from "../practice/live";
import { useSpeaking } from "../practice/voice";

export interface CapReached {
  key: string;
  spent: number;
  cap: number;
  limit: number;
}

export const CAP_TITLE = "You've reached this session's spending limit";
const dollars = (n: number): string => `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
export const capBody = (p: CapReached): string => `This session has used about ${dollars(p.spent)} of AI feedback. Your limit is ${dollars(p.cap)} a session. Keep using AI feedback?`;
export const capSmall = (p: CapReached): string => `Keep going allows another ${dollars(p.cap)}. Amounts are estimates. Change the limit in Settings › AI.`;

/** The question is held back while the person is answering, while the AI is being waited on, and while the interviewer speaks. */
export const capHeld = (phase: Phase, speaking: boolean): boolean => phase === "recording" || phase === "thinking" || speaking;

// ---------- what is waiting to be asked ----------

let pending: CapReached | null = null;
const listeners = new Set<() => void>();
const set = (next: CapReached | null) => {
  pending = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const usePending = (): CapReached | null => useSyncExternalStore(subscribe, () => pending, () => pending);

/** A session reached its limit: the question is waiting to be shown. */
export const noteCapReached = (p: CapReached) => set(p);
export const clearCapQuestion = () => set(null);
export const capQuestion = (): CapReached | null => pending;

/** Starts listening to the backend. Returns a function that stops. Nothing happens outside the app. */
export function listenForCapReached(): () => void {
  let stop: (() => void) | undefined;
  let gone = false;
  try {
    listen<CapReached>("spending-cap-reached", (e) => noteCapReached(e.payload)).then(
      (off) => (gone ? off() : (stop = off)),
      () => {},
    );
  } catch {
    // no backend (a browser preview)
  }
  return () => {
    gone = true;
    stop?.();
  };
}

// ---------- the two answers ----------

export interface CapDeps {
  invoke: (command: string, args: { key: string }) => Promise<unknown>;
  /** Judge the rep on screen again when it was refused at the limit. */
  rescore: (key: string) => Promise<unknown>;
}

const realInvoke = async (command: string, args: { key: string }) => (await import("@tauri-apps/api/core")).invoke(command, args);
const real: CapDeps = { invoke: realInvoke, rescore: rescoreAfterCap };

/** "Keep going": the limit becomes what was spent plus the cap again; a rep refused at the limit is judged now. */
export async function keepGoing(p: CapReached, deps: CapDeps = real): Promise<void> {
  set(null);
  try {
    await deps.invoke("continue_past_cap", { key: p.key });
  } catch {
    return;
  }
  await deps.rescore(p.key);
}

/** "Timing only": the rest of the session is timing only, and the question does not come back. */
export async function timingOnly(p: CapReached, deps: CapDeps = real): Promise<void> {
  set(null);
  try {
    await deps.invoke("decline_past_cap", { key: p.key });
  } catch {
    // The session stays as it was; the question comes back at the next refused step.
  }
}

// ---------- the dialog ----------

export function CapDialogView({ cap, held, onKeep, onTiming, onClose }: { cap: CapReached | null; held: boolean; onKeep: () => void; onTiming: () => void; onClose: () => void }) {
  if (!cap || held) return null;
  return (
    <Dialog
      title={CAP_TITLE}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="e-btn e-btn-ghost" onClick={onTiming}>Timing only</button>
          <button type="button" className="e-btn e-btn-primary" data-autofocus onClick={onKeep}>Keep going</button>
        </>
      }
    >
      <p className="e-body">{capBody(cap)}</p>
      <p className="e-small">{capSmall(cap)}</p>
    </Dialog>
  );
}

/** Mounted in both shells. Esc or a click outside only puts the question away; the next refused AI step brings it back. */
export default function CapDialog() {
  const cap = usePending();
  const live = useLive();
  const speaking = useSpeaking();
  return <CapDialogView cap={cap} held={capHeld(live.phase, speaking)} onKeep={() => void keepGoing(cap as CapReached)} onTiming={() => void timingOnly(cap as CapReached)} onClose={clearCapQuestion} />;
}
