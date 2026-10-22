import { readsQuestions, readsTrySaying, say, stopSaying } from "../../practice/voice";

/** Read text aloud in the voice chosen in Settings. Does nothing where speech synthesis is missing. */
export function speak(text: string) {
  say(text);
}

/** A new question: read it on its own only when Read questions aloud is on. */
export function speakQuestion(text: string) {
  if (text.trim() && readsQuestions()) say(text);
}

/** The better line after an answer: read on its own only when both voice switches are on. */
export function speakTrySaying(text: string | undefined) {
  if (text?.trim() && readsTrySaying()) say(text);
}

/** Stop anything being read aloud (used when a screen goes away). */
export function hush() {
  stopSaying();
}
