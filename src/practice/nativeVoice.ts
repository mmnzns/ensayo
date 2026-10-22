// The system's own speech, through the backend (`native_voices`, `speak_native`, `stop_speaking_native`). Only inside
// the desktop app; in the browser preview every call quietly does nothing.

import { invoke } from "@tauri-apps/api/core";
import type { NativeVoiceLike } from "../screens/settings/prefs";

export const inApp = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function fetchNativeVoices(): Promise<NativeVoiceLike[]> {
  if (!inApp()) return [];
  try {
    const list = await invoke<NativeVoiceLike[]>("native_voices");
    return Array.isArray(list) ? list.filter((v) => v && typeof v.id === "string" && typeof v.name === "string") : [];
  } catch {
    return [];
  }
}

/** Reads the line; resolves when it ends or is stopped, and rejects when the system could not speak it. */
export async function speakNative(text: string, voiceId: string, rate: number): Promise<void> {
  await invoke<string>("speak_native", { text, voiceId, rate });
}

export async function stopNative(): Promise<void> {
  if (!inApp()) return;
  try {
    await invoke("stop_speaking_native");
  } catch {
    // Nothing to stop.
  }
}
