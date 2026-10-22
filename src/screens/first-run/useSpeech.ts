import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { SPEECH_MODELS } from "../../practice/api";
import { downloadErrorLine, speechPlan, type SpeechModelStatus, type SpeechPlan } from "./setup";

/** Where the speech model stands, and the download. Reads the same models, in the same order, as a practice session does. */
export function useSpeech() {
  const [plan, setPlan] = useState<SpeechPlan | null>(null);
  const [fraction, setFraction] = useState<number | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const models = await Promise.all(SPEECH_MODELS.map((id) => invoke<SpeechModelStatus>("model_status", { id })));
      const vad = await invoke<SpeechModelStatus>("model_status", { id: "vad" }).catch(() => null);
      setPlan(speechPlan(models, vad));
    } catch (e) {
      setError(downloadErrorLine(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    let stop: (() => void) | undefined;
    let gone = false;
    // The model downloads first and the small voice detection model after it; each reports 0 to 1.
    listen<{ id: string; fraction: number }>("model-progress", (e) => setFraction((f) => (f === null ? f : e.payload.id === "vad" ? 1 : e.payload.fraction))).then(
      (off) => (gone ? off() : (stop = off)),
      () => {},
    );
    return () => {
      gone = true;
      stop?.();
    };
  }, [refresh]);

  const download = async () => {
    if (!plan || plan.kind !== "download" || fraction !== null) return;
    setError("");
    setFraction(0);
    try {
      await invoke("download_model", { id: plan.modelId });
    } catch (e) {
      setError(downloadErrorLine(e));
    }
    setFraction(null);
    await refresh();
  };

  return { plan, downloading: fraction !== null, fraction: fraction ?? 0, error, download };
}
