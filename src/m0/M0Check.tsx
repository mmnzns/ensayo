import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type Word = { text: string; start_ms: number; end_ms: number };
type Transcript = { words: Word[]; language: string | null; engine: string; duration_ms: number };
type ModelStatus = { id: string; name: string; size_mb: number; state: "ready" | "on_this_computer" | "missing" };

const MODEL = "whisper-turbo";
const fmt = (ms: number) => `${(ms / 1000).toFixed(2)}s`;
const stateText = { ready: "ready", on_this_computer: "found on this computer", missing: "not downloaded" } as const;

export default function M0Check() {
  const [model, setModel] = useState<ModelStatus | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [permission, setPermission] = useState("checking");
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [mic, setMic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const refreshModel = () => invoke<ModelStatus>("model_status", { id: MODEL }).then(setModel).catch((e) => setError(String(e)));
  const refreshPermission = () => invoke<string>("mic_permission").then(setPermission).catch(() => setPermission("unknown"));

  useEffect(() => {
    refreshModel();
    refreshPermission();
    const un = listen<{ fraction: number }>("model-progress", (e) => setProgress(e.payload.fraction));
    return () => {
      un.then((f) => f());
      window.clearInterval(timer.current);
    };
  }, []);

  const download = async () => {
    setError("");
    setProgress(0);
    try {
      await invoke("download_model", { id: MODEL });
    } catch (e) {
      setError(String(e));
    }
    setProgress(null);
    refreshModel();
  };

  const start = async () => {
    setError("");
    setTranscript(null);
    try {
      if (permission !== "granted") {
        await invoke("request_mic_permission");
        await refreshPermission();
      }
      setMic(await invoke<string>("start_recording", { device: null }));
      setRecording(true);
      timer.current = window.setInterval(async () => {
        const l = await invoke<{ level: number; elapsed_ms: number } | null>("recording_level");
        if (l) {
          setLevel(l.level);
          setElapsed(l.elapsed_ms);
        }
      }, 100);
    } catch (e) {
      setError(String(e));
    }
  };

  const stop = async () => {
    window.clearInterval(timer.current);
    setRecording(false);
    setLevel(0);
    setBusy(true);
    try {
      const rec = await invoke<{ path: string; duration_ms: number }>("stop_recording");
      setTranscript(await invoke<Transcript>("transcribe_recording", { path: rec.path, modelId: MODEL }));
    } catch (e) {
      setError(String(e));
    }
    setBusy(false);
  };

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: 32, display: "grid", gap: 20 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Ensayo: M0 check</h1>
      <p>Record a 60-second answer with Wi-Fi off. You should see every word with its start time.</p>

      <section>
        <b>Speech model:</b> {model ? `${model.name} (${model.size_mb} MB) is ${stateText[model.state]}` : "checking…"}
        {model?.state === "missing" && (
          <button onClick={download} disabled={progress !== null} style={{ marginLeft: 12 }}>
            {progress === null ? "Download" : `Downloading ${Math.round(progress * 100)}%`}
          </button>
        )}
      </section>

      <section>
        <b>Microphone permission:</b> {permission}
        {(permission === "denied" || permission === "restricted") && (
          <button onClick={() => invoke("open_mic_settings")} style={{ marginLeft: 12 }}>Open settings</button>
        )}
      </section>

      <section style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {!recording ? (
          <button onClick={start} disabled={busy || model?.state === "missing"}>Record</button>
        ) : (
          <button onClick={stop}>Stop</button>
        )}
        {recording && (
          <>
            <span>{mic}</span>
            <span>{(elapsed / 1000).toFixed(1)}s</span>
            <div style={{ width: 160, height: 10, background: "var(--color-line)", borderRadius: 5 }}>
              <div style={{ width: `${Math.min(100, level * 100)}%`, height: "100%", background: "var(--color-brand)", borderRadius: 5 }} />
            </div>
          </>
        )}
        {busy && <span>Listening back…</span>}
      </section>

      {error && <p style={{ color: "var(--color-delete)" }}>{error}</p>}

      {transcript && (
        <section>
          <p>
            {transcript.words.length} words, {fmt(transcript.duration_ms)} recorded, engine: {transcript.engine}
          </p>
          <p style={{ lineHeight: 2 }}>
            {transcript.words.map((w, i) => (
              <span key={i} title={`${fmt(w.start_ms)} to ${fmt(w.end_ms)}`} style={{ marginRight: 6 }}>
                <small style={{ color: "var(--color-text-muted)" }}>{fmt(w.start_ms)}</small> {w.text}
              </span>
            ))}
          </p>
        </section>
      )}
    </main>
  );
}
