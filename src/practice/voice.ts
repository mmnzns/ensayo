// The interviewer's voice: the browser's speech synthesis, set up with the voice and speed chosen in Settings, Voice.
// Everything is guarded, because a computer may have no voice at all.

import { useEffect, useState } from "react";
import { chooseVoice, readPrefs, speechRate } from "../screens/settings/prefs";

const available = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

/** The voices on this computer. Some systems fill the list a moment after start-up, so it can be empty at first. */
export function listVoices(): SpeechSynthesisVoice[] {
  try {
    return available() ? window.speechSynthesis.getVoices() : [];
  } catch {
    return [];
  }
}

/** The voices, kept current when the system finishes loading them. */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(listVoices);
  useEffect(() => {
    if (!available()) return;
    const synth = window.speechSynthesis;
    const refresh = () => setVoices(listVoices());
    refresh();
    synth.addEventListener?.("voiceschanged", refresh);
    return () => synth.removeEventListener?.("voiceschanged", refresh);
  }, []);
  return voices;
}

/** Whether questions are read aloud on their own (the Read questions aloud switch). */
export const readsQuestions = (): boolean => readPrefs().voice.readAloud;
/** Whether the "Try saying" line is read on its own: needs both switches. */
export const readsTrySaying = (): boolean => {
  const v = readPrefs().voice;
  return v.readAloud && v.readTrySaying;
};

/** Reads `text` aloud in the chosen voice and speed. Returns false when nothing can speak. */
export function say(text: string, onEnd?: () => void): boolean {
  if (!available()) return false;
  try {
    const { voice } = readPrefs();
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const picked = chooseVoice(listVoices(), voice.voiceUri);
    if (picked) {
      u.voice = picked;
      u.lang = picked.lang;
    }
    u.rate = speechRate(voice.speed);
    u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    synth.speak(u);
    return true;
  } catch {
    return false;
  }
}

export function stopSaying(): void {
  try {
    if (available()) window.speechSynthesis.cancel();
  } catch {
    // Nothing to stop.
  }
}
