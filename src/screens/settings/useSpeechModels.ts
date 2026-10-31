import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { downloadErrorLine } from "../first-run/setup";
import { readPrefs, updateSpeech } from "./prefs";
import { noteSpeechModelUse } from "./speechUse";
import { deletedLine, inUseModel, type SpeechModelEntry } from "./speechModels";

/** The speech models on this computer, which one a session uses, and downloading another. Same commands and
 *  `model-progress` event as the Speech step in setup. */
export function useSpeechModels() {
  const [models, setModels] = useState<SpeechModelEntry[] | null>(null);
  const [preferred, setPreferred] = useState(() => readPrefs().speech.model);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [fraction, setFraction] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const stopped = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setModels(await invoke<SpeechModelEntry[]>("speech_models"));
    } catch (e) {
      setError(downloadErrorLine(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    let stop: (() => void) | undefined;
    let gone = false;
    // A model downloads first, then the small voice detection model; each reports 0 to 1.
    listen<{ id: string; fraction: number }>("model-progress", (e) => setFraction(e.payload.id === "vad" ? 1 : e.payload.fraction)).then(
      (off) => (gone ? off() : (stop = off)),
      () => {},
    );
    return () => {
      gone = true;
      stop?.();
    };
  }, [refresh]);

  const download = async (id: string) => {
    if (downloadingId) return;
    stopped.current = false;
    setError("");
    setNotice("");
    setFraction(0);
    setDownloadingId(id);
    try {
      await invoke("download_model", { id });
    } catch (e) {
      setError(stopped.current ? "Download stopped. Press Resume to pick up where it left off." : downloadErrorLine(e));
    }
    setDownloadingId(null);
    await refresh();
  };

  /** Stops the download running here; what was fetched stays, so Resume picks it up. */
  const cancel = () => {
    stopped.current = true;
    invoke("cancel_model_download").catch((e) => setError(downloadErrorLine(e)));
  };

  /** Deletes a model from this computer. Another Craft Concepts app that uses it keeps it. */
  const remove = async (id: string) => {
    const name = models?.find((m) => m.id === id)?.name ?? "The model";
    setError("");
    setNotice("");
    try {
      const r = await invoke<{ result: string }>("delete_model", { id });
      setNotice(deletedLine(name, r.result));
    } catch (e) {
      setError(downloadErrorLine(e));
    }
    await refresh();
  };

  const use = (id: string) => {
    updateSpeech({ model: id });
    setPreferred(id);
    noteSpeechModelUse(id);
  };

  return { models, inUseId: models ? inUseModel(models, preferred) : "", downloadingId, fraction, error, notice, download, cancel, remove, use };
}
