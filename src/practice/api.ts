// The Rust rep commands as one object, so the live practice flow can be driven by a fake in tests and in the browser.

import { readPrefs } from "../screens/settings/prefs";
import { candidateModels, SPEECH_MODELS } from "../screens/settings/speechModels";
import type { MustSayItem, QuestionQuality } from "./debrief";
import type { FinishArgs, FollowUpQuestion, FullRep, RepOutcome } from "./types";

/** What `load_session` returns: the session record and every rep in it. */
export interface SessionDetail {
  session: { id: string; mode: string; stage: string; application_id: string | null; started: string };
  reps: FullRep[];
}

export interface RepApi {
  startRecording(): Promise<void>;
  stopRecording(): Promise<{ path: string; duration_ms: number }>;
  level(): Promise<{ level: number; elapsed_ms: number } | null>;
  finishRep(args: FinishArgs): Promise<RepOutcome>;
  rescoreRep(sessionId: string, n: number, keepRestart: boolean): Promise<RepOutcome>;
  deleteRep(sessionId: string, n: number): Promise<void>;
  labelRep(sessionId: string, n: number, wrong: boolean): Promise<void>;
  nextFollowUp(sessionId: string, parentN: number): Promise<FollowUpQuestion>;
  clarifyReply(sessionId: string, question: string, clarification: string, stage: string): Promise<string>;
  aiReady(): Promise<boolean>;
  discardRecording(path: string): Promise<void>;
  labelCriteria(sessionId: string, n: number, labels: Record<string, "pass" | "fail">): Promise<void>;
  repLabels(sessionId: string, n: number): Promise<Record<string, "pass" | "fail">>;
  audioAvailable(sessionId: string, n: number): Promise<boolean>;
  readAudio(sessionId: string, n: number): Promise<ArrayBuffer>;
  loadSession(sessionId: string): Promise<SessionDetail | null>;
  /** Judges the candidate's own questions (and the must-say list) for a finished Mock. Rejects with a plain line when no engine is set up. */
  mockDebrief(args: { session_id: string; company: string; role: string; jd_summary: string; priorities: string; must_say: MustSayItem[] }): Promise<QuestionQuality>;
}

export { SPEECH_MODELS };

export const isApp = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function tauriApi(): Promise<RepApi> {
  const { invoke } = await import("@tauri-apps/api/core");
  // The model chosen in Settings, Speech comes first; then the usual order. Read every time, so a change applies at once.
  const pickModel = async () => {
    for (const id of candidateModels(readPrefs().speech.model)) {
      const s = await invoke<{ state: string }>("model_status", { id }).catch(() => null);
      if (s && (s.state === "ready" || s.state === "on_this_computer")) return id;
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
    nextFollowUp: (sessionId, parentN) => invoke("next_follow_up", { sessionId, parentN }),
    clarifyReply: (sessionId, question, clarification, stage) => invoke("clarify_reply", { sessionId, question, clarification, stage }),
    aiReady: () => invoke("ai_ready"),
    discardRecording: (path) => invoke("discard_recording", { path }),
    labelCriteria: (sessionId, n, labels) => invoke("label_criteria", { sessionId, n, labels }),
    repLabels: (sessionId, n) => invoke("rep_labels", { sessionId, n }),
    audioAvailable: (sessionId, n) => invoke("rep_audio_available", { sessionId, n }),
    readAudio: (sessionId, n) => invoke("read_rep_audio", { sessionId, n }),
    loadSession: (sessionId) => invoke("load_session", { sessionId }),
    mockDebrief: (args) => invoke("mock_debrief", { args }),
  };
}
