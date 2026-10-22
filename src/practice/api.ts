// The Rust rep commands as one object, so the live practice flow can be driven by a fake in tests and in the browser.

import type { FinishArgs, RepOutcome } from "./types";

export interface RepApi {
  startRecording(): Promise<void>;
  stopRecording(): Promise<{ path: string; duration_ms: number }>;
  level(): Promise<{ level: number; elapsed_ms: number } | null>;
  finishRep(args: FinishArgs): Promise<RepOutcome>;
  rescoreRep(sessionId: string, n: number, keepRestart: boolean): Promise<RepOutcome>;
  deleteRep(sessionId: string, n: number): Promise<void>;
  labelRep(sessionId: string, n: number, wrong: boolean): Promise<void>;
  discardRecording(path: string): Promise<void>;
  audioAvailable(sessionId: string, n: number): Promise<boolean>;
  readAudio(sessionId: string, n: number): Promise<ArrayBuffer>;
}

/** Speech models in the order Ensayo prefers them; the first one on this computer is used. */
export const SPEECH_MODELS = ["whisper-turbo", "parakeet-ultra", "whisper-small", "whisper-base", "whisper-tiny"];

export const isApp = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function tauriApi(): Promise<RepApi> {
  const { invoke } = await import("@tauri-apps/api/core");
  let model: string | undefined;
  const pickModel = async () => {
    if (model) return model;
    for (const id of SPEECH_MODELS) {
      const s = await invoke<{ state: string }>("model_status", { id });
      if (s.state === "ready" || s.state === "on_this_computer") return (model = id);
    }
    throw new Error("No speech model is on this computer yet. Download one from Settings.");
  };
  return {
    startRecording: async () => {
      await invoke("start_recording", {});
    },
    stopRecording: () => invoke("stop_recording"),
    level: () => invoke("recording_level"),
    finishRep: async (args) => invoke("finish_rep", { args, modelId: await pickModel() }),
    rescoreRep: (sessionId, n, keepRestart) => invoke("rescore_rep", { sessionId, n, keepRestart }),
    deleteRep: (sessionId, n) => invoke("delete_rep", { sessionId, n }),
    labelRep: (sessionId, n, wrong) => invoke("label_rep", { sessionId, n, wrong }),
    discardRecording: (path) => invoke("discard_recording", { path }),
    audioAvailable: (sessionId, n) => invoke("rep_audio_available", { sessionId, n }),
    readAudio: (sessionId, n) => invoke("read_rep_audio", { sessionId, n }),
  };
}
