/** Read text aloud with the browser voice. Does nothing where speech synthesis is missing. */
export function speak(text: string) {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  } catch {
    // No voice available: stay quiet.
  }
}

/** Stop anything being read aloud (used when a screen goes away). */
export function hush() {
  try {
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  } catch {
    // Nothing to stop.
  }
}
