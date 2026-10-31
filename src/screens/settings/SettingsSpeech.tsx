// Draft generated from Design/screens/html/8-4-settings-speech.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import { useState } from "react";
import { isApp } from "../../data/real";
import { useStore } from "../../data/store";
import type { SpeechModel } from "../../data/screens/settings";
import { formatSize } from "./format";
import { KeyResult, SettingsLayout, useKeyTests, useLater } from "./parts";
import SpeechModelList from "./SpeechModelList";
import { modelRows, modelsSize } from "./speechModels";
import { useSpeechModels } from "./useSpeechModels";

const ring = (color: string) => ({ width: "10px", height: "10px", borderRadius: "50%", boxShadow: `inset 0 0 0 1.5px ${color}`, flex: "none" as const });

/** In the app the screen reads the real models and downloads them; in the browser preview it stays the sample below. */
export default function SettingsSpeech() {
  return isApp() ? <SpeechLive /> : <SpeechMock />;
}

function SpeechLive() {
  const { models, inUseId, downloadingId, fraction, error, notice, download, cancel, remove, use } = useSpeechModels();
  const [showAll, setShowAll] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const rows = modelRows(models ?? [], inUseId, downloadingId);
  const current = rows.find((r) => r.inUse);

  return (
    <SettingsLayout active="8-4-settings-speech">
      <div style={{ flex: "999 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingBottom: "10px" }}>
            <span className="e-h2">Speech to text</span>
            <span className="e-meta">How your answers become words. The model runs on this computer, works offline and keeps everything here.</span>
          </div>
          <div className="e-rowline" style={{ borderBottom: "none" }}>
            <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
              {models === null ? "Looking at what is on this computer…" : current ? "Model in use" : "No speech model yet"}
              <span className="e-small">
                {current ? `${current.name} · ${current.maker}${current.languages ? ` · ${current.languages}` : ""}` : models === null ? "" : "Until one is here, Ensayo can't hear your answers. Download one below."}
              </span>
            </span>
            {current ? <span className="e-badge e-badge-ok">In use</span> : null}
          </div>
          {error ? <span className="e-meta" role="alert" style={{ color: "var(--e-warn-ink)" }}>{error}</span> : null}
          {notice ? <span className="e-meta" role="status">{notice}</span> : null}
        </section>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingBottom: "10px" }}>
            <span className="e-h3">Models</span>
            {models ? <span className="e-small">{formatSize(modelsSize(models))} on this computer</span> : null}
          </div>
          <SpeechModelList
            rows={rows}
            fraction={fraction}
            busy={downloadingId !== null}
            showAll={showAll}
            confirmId={confirmId}
            onShowAll={setShowAll}
            onUse={use}
            onFetch={(id) => void download(id)}
            onCancel={cancel}
            onAskDelete={setConfirmId}
            onDelete={(id) => {
              setConfirmId(null);
              void remove(id);
            }}
          />
          <span className="e-small" style={{ paddingTop: "8px" }}>A download picks up where it stopped. Delete takes a model off this computer; Delete all Ensayo data under Privacy removes every model Ensayo uses.</span>
        </section>
      </div>
    </SettingsLayout>
  );
}

function SpeechMock() {
  const { speech } = useStore().screens.settings;
  const [engine, setEngine] = useState(speech.models.find((m) => m.status === "in-use")?.engine ?? speech.engines[0].name);
  const [models, setModels] = useState<SpeechModel[]>(speech.models);
  const [downloading, setDownloading] = useState<string[]>([]);
  const [modelFor, setModelFor] = useState(speech.modelFor);
  const [processor, setProcessor] = useState<"Automatic" | "Lower">("Automatic");
  const [keys, setKeys] = useState<Record<string, string>>({});
  const tests = useKeyTests();
  const later = useLater();

  const engineInfo = speech.engines.find((e) => e.name === engine);
  const engineModels = models.filter((m) => m.engine === engine);
  const selectedId = engineModels.some((m) => m.id === modelFor[engine]) ? modelFor[engine] : engineModels[0]?.id;
  const selected = models.find((m) => m.id === selectedId);
  const onDisk = models.filter((m) => m.status === "in-use" || m.status === "ready" || m.status === "found");
  const totalMb = onDisk.reduce((sum, m) => sum + m.mb, 0);

  const setStatus = (id: string, status: SpeechModel["status"]) => setModels((ms) => ms.map((m) => (m.id === id ? { ...m, status } : m)));
  const use = (id: string) => {
    const m = models.find((x) => x.id === id);
    if (m) setEngine(m.engine);
    setModels((ms) => ms.map((x) => (x.id === id ? { ...x, status: "in-use" } : x.status === "in-use" ? { ...x, status: "ready" } : x)));
  };
  const remove = (id: string) =>
    setModels((ms) => {
      const wasInUse = ms.find((m) => m.id === id)?.status === "in-use";
      const next = ms.map((m) => (m.id === id ? { ...m, status: "missing" as const } : m));
      if (!wasInUse) return next;
      const heir = next.find((m) => m.status === "ready");
      return heir ? next.map((m) => (m.id === heir.id ? { ...m, status: "in-use" as const } : m)) : next;
    });
  const download = (id: string) => {
    setDownloading((d) => [...d, id]);
    later(() => {
      setDownloading((d) => d.filter((x) => x !== id));
      setStatus(id, "ready");
    }, 1500);
  };

  const changeEngine = (name: string) => {
    setEngine(name);
    const first = models.find((m) => m.engine === name);
    const id = models.some((m) => m.id === modelFor[name] && m.engine === name) ? modelFor[name] : first?.id;
    const m = models.find((x) => x.id === id);
    if (m && (m.status === "ready" || m.status === "found")) use(m.id);
  };

  const pickModel = (id: string) => {
    setModelFor((f) => ({ ...f, [engine]: id }));
    const m = models.find((x) => x.id === id);
    if (m && (m.status === "ready" || m.status === "found")) use(id);
  };

  return (
    <SettingsLayout active="8-4-settings-speech">
      <div style={{ flex: "999 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingBottom: "10px" }}>
            <span className="e-h2">Speech to text</span>
            <span className="e-meta">How your answers become words. Local models work offline and keep everything here.</span>
          </div>
          <div className="e-rowline">
            <span style={{ flex: "1" }}>Engine</span>
            <select className="e-input" style={{ width: "260px" }} aria-label="Speech engine" value={engine} onChange={(e) => changeEngine(e.target.value)}>
              <optgroup label="On this computer">
                {speech.engines.map((e) => (
                  <option key={e.name}>{e.name}</option>
                ))}
              </optgroup>
              {speech.onlineSpeechInV0 && (
                <optgroup label="Online, with your key">
                  {speech.onlineEngines.map((e) => (
                    <option key={e}>{e}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <div className="e-rowline">
            <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
              Model<span className="e-small">{engineInfo?.hint}</span>
              {selected && selected.status === "missing" && <span className="e-small" style={{ color: "var(--e-ink)" }}>Not on this computer yet. Download it below.</span>}
            </span>
            <select className="e-input" style={{ width: "260px" }} aria-label="Model" value={selectedId} onChange={(e) => pickModel(e.target.value)}>
              {engineModels.map((m) => (
                <option key={m.id} value={m.id}>{`${m.name} · ${formatSize(m.mb)}`}</option>
              ))}
            </select>
          </div>
          <div className="e-rowline" style={{ borderBottom: "none" }}>
            <span style={{ flex: "1" }}>Processor use</span>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              {(["Automatic", "Lower"] as const).map((p) => (
                <button key={p} type="button" className={processor === p ? "e-chip e-chip-on" : "e-chip"} aria-pressed={processor === p} onClick={() => setProcessor(p)}>{p}</button>
              ))}
              <span className="e-small">{processor === "Automatic" ? "uses the graphics chip when it helps" : "keeps the computer quieter, a little slower"}</span>
            </div>
          </div>
        </section>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingBottom: "10px" }}>
            <span className="e-h3">Models on this computer</span>
            <span className="e-small">{formatSize(totalMb)}</span>
          </div>
          {models.map((m, i) => {
            const busy = downloading.includes(m.id);
            const inUse = m.status === "in-use";
            const have = inUse || m.status === "ready" || m.status === "found";
            return (
              <div key={m.id} className="e-rowline" style={{ padding: "12px 0", ...(i === models.length - 1 ? { borderBottom: "none" } : {}) }}>
                {inUse ? <span className="e-dot" aria-hidden="true" /> : <span style={ring(have ? "var(--e-muted)" : "var(--e-line)")} />}
                <span style={{ flex: "1", ...(have ? {} : { color: "var(--e-muted)" }) }}>
                  {m.name}
                  {m.status === "found" && <span className="e-small"> · found, from another app on this computer</span>}
                </span>
                <span className="e-small">{busy ? "Downloading…" : `${formatSize(m.mb)}${inUse ? " · in use" : ""}`}</span>
                {have && !inUse && <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => use(m.id)}>Use</button>}
                {(inUse || m.status === "ready") && <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => remove(m.id)}>Remove</button>}
                {m.status === "missing" && <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={busy} onClick={() => download(m.id)}>{busy ? "Please wait" : "Download"}</button>}
              </div>
            );
          })}
        </section>
        {speech.onlineSpeechInV0 && (
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <span className="e-h3">Online speech keys</span>
            <span className="e-meta">Only used when an online engine is selected. Your audio is sent to that service for transcription.</span>
            {speech.onlineKeys.map((k, i) => (
              <div key={k.id} style={{ display: "flex", flexDirection: "column" }}>
                <div className="e-rowline" style={{ padding: "12px 0", ...(i === speech.onlineKeys.length - 1 ? { borderBottom: "none" } : {}) }}>
                  <span style={{ flex: "1" }}>{k.label}</span>
                  <input className="e-input" type="password" style={{ width: "260px" }} placeholder="Paste key" aria-label={`${k.label} key`} value={keys[k.id] ?? ""} onChange={(e) => { setKeys((s) => ({ ...s, [k.id]: e.target.value })); tests.clear(k.id); }} />
                  <button type="button" className="e-btn e-btn-soft e-btn-sm" onClick={() => tests.test(k.id, keys[k.id] ?? "")}>Test</button>
                </div>
                <KeyResult status={tests.status[k.id]} empty={!(keys[k.id] ?? "").trim()} />
              </div>
            ))}
          </section>
        )}
      </div>
    </SettingsLayout>
  );
}
