// The interviewer's voice, set up with the voice and speed chosen in Settings, Voice. Two engines: the browser's speech
// synthesis, and the computer's own speech run by the backend (nativeVoice.ts). The saved choice says which is tried
// first; the other is the fallback. Everything is guarded, because a computer may have no voice at all.

import { useEffect, useState } from "react";
import { chooseVoice, readPrefs, speechRate, type NativeVoiceLike } from "../screens/settings/prefs";
import { fetchNativeVoices, inApp, speakNative, stopNative } from "./nativeVoice";
import { engineOrder, probeBrowserVoices, speakInOrder, type ProbeSource } from "./voiceEngine";

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

// ---------- system voices ----------

/** The system's voices once asked for; null until then (a speaker then assumes there are some and lets a failure fall back). */
let nativeCache: NativeVoiceLike[] | null = null;
let nativeAsk: Promise<NativeVoiceLike[]> | null = null;

/** The computer's own voices, asked once per run of the app. Empty outside the app. */
export function loadNativeVoices(): Promise<NativeVoiceLike[]> {
  if (!inApp()) return Promise.resolve([]);
  nativeAsk ??= fetchNativeVoices().then((v) => (nativeCache = v));
  return nativeAsk;
}

/** The browser engine as the probe sees it, or null where there is no speech synthesis. */
export function browserSource(): ProbeSource | null {
  if (!available()) return null;
  const synth = window.speechSynthesis;
  return {
    getVoices: () => listVoices(),
    onChange: (cb) => {
      synth.addEventListener?.("voiceschanged", cb);
      return () => synth.removeEventListener?.("voiceschanged", cb);
    },
  };
}

/** Both engines' voices, and whether the browser probe has finished (so "no voice" is not shown too early). */
export function useVoiceCatalog(): { browser: SpeechSynthesisVoice[]; system: NativeVoiceLike[]; probed: boolean } {
  const browser = useVoices();
  const [system, setSystem] = useState<NativeVoiceLike[]>(nativeCache ?? []);
  const [probed, setProbed] = useState(false);
  useEffect(() => {
    let alive = true;
    void probeBrowserVoices(browserSource()).then(() => alive && setProbed(true));
    void loadNativeVoices().then((v) => alive && setSystem(v));
    return () => {
      alive = false;
    };
  }, []);
  return { browser, system, probed: probed || browser.length > 0 };
}

// ---------- speaking ----------

/** Counts every line started or stopped, so a late answer from a line that was replaced does nothing. */
let line = 0;
let nativeActive = false;
let nativeLine = 0;
/** How long a browser voice may stay silent before the system's voice is tried instead (only when there is one to try). */
const BROWSER_START_MS = 3000;

function speakBrowser(text: string, hasFallback: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const { voice } = readPrefs();
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const picked = voice.engine === "browser" ? chooseVoice(listVoices(), voice.voiceUri) : undefined;
      if (picked) {
        u.voice = picked;
        u.lang = picked.lang;
      }
      u.rate = speechRate(voice.speed);
      let started = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const settle = (ok: boolean) => {
        if (timer) clearTimeout(timer);
        resolve(ok);
      };
      u.onstart = () => {
        started = true;
        if (timer) clearTimeout(timer);
      };
      u.onend = () => settle(true);
      // Stopping a line on purpose is an error event too; only a line that never began counts as a failure.
      u.onerror = (e) => settle(started || e.error === "canceled" || e.error === "interrupted");
      if (hasFallback) {
        timer = setTimeout(() => {
          if (started) return;
          try {
            synth.cancel();
          } catch {
            // Already gone.
          }
          resolve(false);
        }, BROWSER_START_MS);
      }
      synth.speak(u);
    } catch {
      resolve(false);
    }
  });
}

async function speakSystem(text: string): Promise<boolean> {
  const { voice } = readPrefs();
  const wanted = voice.engine === "system" ? voice.voiceUri : "";
  // A saved system voice the computer no longer has means its default voice.
  const id = nativeCache && !nativeCache.some((v) => v.id === wanted) ? "" : wanted;
  const mine = ++nativeLine;
  nativeActive = true;
  try {
    await speakNative(text, id, speechRate(voice.speed));
    return true;
  } catch {
    return false;
  } finally {
    // A newer system line may already be running; only the latest one clears the flag.
    if (mine === nativeLine) nativeActive = false;
  }
}

/** Reads `text` aloud in the chosen voice and speed. Returns false when nothing can speak.
 *  `onEnd` runs when the line ends, is stopped, or no engine could speak it (`spoke` false). */
export function say(text: string, onEnd?: (spoke: boolean) => void): boolean {
  const { voice } = readPrefs();
  const browserVoices = available() ? listVoices().length > 0 : false;
  // Until the system's voices are known, a computer in the app is assumed to have some.
  const system = inApp() && (nativeCache === null || nativeCache.length > 0);
  const has = { browser: browserVoices || (available() && !system), system };
  const order = engineOrder(voice.engine, has);
  if (order.length === 0) return false;
  const mine = ++line;
  halt();
  if (inApp() && nativeCache === null) void loadNativeVoices();
  const live = () => mine === line;
  void speakInOrder(order, (engine, isLast) => (engine === "browser" ? speakBrowser(text, !isLast) : speakSystem(text)), live).then((spoke) => onEnd?.(spoke));
  return true;
}

function halt(): void {
  try {
    if (available()) window.speechSynthesis.cancel();
  } catch {
    // Nothing to stop.
  }
  if (nativeActive) void stopNative();
}

export function stopSaying(): void {
  line++;
  halt();
}
