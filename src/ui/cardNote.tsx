// "The graphics card didn't work for X": said once per run, when the engine had to use the processor instead. The backend
// emits `graphics-card-fell-back` ({ what }) once per kind of work; the note stays at the top of every page until the
// person has seen it.

import { listen } from "@tauri-apps/api/event";
import { useSyncExternalStore } from "react";

let notes: string[] = [];
const listeners = new Set<() => void>();

function set(next: string[]) {
  notes = next;
  listeners.forEach((l) => l());
}

/** The sentence for one kind of work ("speech to text", "the built-in local AI"). */
export const fellBackNote = (what: string): string =>
  `The graphics card didn't work for ${what.trim() || "this"}, so Ensayo used the processor. You can turn the card off in Settings.`;

/** Adds the note for `what`; saying the same thing twice shows it once. */
export function noteCardFellBack(what: string) {
  const text = fellBackNote(what);
  if (!notes.includes(text)) set([...notes, text]);
}

export const dismissCardNote = (text: string) => set(notes.filter((n) => n !== text));
export const clearCardNotes = () => set([]);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export const useCardNotes = (): string[] => useSyncExternalStore(subscribe, () => notes, () => notes);

/** Starts listening to the backend. Returns a function that stops. Nothing happens outside the app. */
export function listenForCardNotes(): () => void {
  let stop: (() => void) | undefined;
  let gone = false;
  try {
    listen<{ what: string }>("graphics-card-fell-back", (e) => noteCardFellBack(e.payload.what)).then(
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

/** The notes themselves, for the top of a page. Nothing when there are none. */
export function CardNotes() {
  const list = useCardNotes();
  if (list.length === 0) return null;
  return (
    <>
      {list.map((text) => (
        <div key={text} className="e-soft" role="status" style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <span className="e-meta">{text}</span>
          <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => dismissCardNote(text)}>Got it</button>
        </div>
      ))}
    </>
  );
}
