// Draft generated from Design/screens/html/8-6-settings-privacy.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isApp, type DataStatus } from "../../data/real";
import { revealPath } from "../../ui/openExternal";
import { useStore } from "../../data/store";
import { formatSize } from "./format";
import { SettingsLayout, useLater } from "./parts";
import { privacySetup, type AiView } from "./aiSettings";
import { deleteFailedLine, folderChangedLine, folderPathProblem, folderProblemLine, leavesRows, retentionChoice, retentionLabel } from "./privacy";
import { clearPrefs, readPrefs } from "./prefs";
import { inUseModel, type SpeechModelEntry } from "./speechModels";

/** Which delete is asking "are you sure" right now. */
type Asking = "recordings" | "all" | null;

export default function SettingsPrivacy() {
  const { privacy } = useStore().screens.settings;
  const [retention, setRetention] = useState(privacy.retention);
  const [folderNote, setFolderNote] = useState<"show" | "move" | null>(null);
  const [asking, setAsking] = useState<Asking>(null);
  const [typed, setTyped] = useState("");
  const [recordingsMb, setRecordingsMb] = useState(privacy.recordingsMb);
  const [allDeleted, setAllDeleted] = useState(false);
  // In the app the list follows the engine really chosen in Settings > AI; in the browser preview it follows the sample setup.
  const [setup, setSetup] = useState(privacy.setup);
  const rows = leavesRows(setup);
  const app = isApp();
  const later = useLater();
  // The app's own folder, the new folder being typed, and what the last try said.
  const [folder, setFolder] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [folderError, setFolderError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [folderDone, setFolderDone] = useState("");

  // In the app the choice is the real one, kept on this computer; in the browser preview it is just local state.
  useEffect(() => {
    if (!isApp()) return;
    void invoke<string>("audio_retention").then((c) => setRetention(retentionLabel(c)), () => {});
  }, []);
  useEffect(() => {
    if (!isApp()) return;
    void invoke<AiView>("ai_settings").then((v) => setSetup((s) => ({ ...s, ...privacySetup(v) })), () => {});
  }, []);
  useEffect(() => {
    if (!app) return;
    void invoke<DataStatus>("data_status").then((st) => setFolder(st.folder), () => {});
    void invoke<number>("audio_usage_mb").then(setRecordingsMb, () => {});
    // Which speech model runs here, so the list names the real one.
    void invoke<SpeechModelEntry[]>("speech_models").then((models) => {
      const id = inUseModel(models, readPrefs().speech.model);
      const name = models.find((m) => m.id === id)?.name;
      if (name) setSetup((s) => ({ ...s, speech: name, speechLocal: true }));
    }, () => {});
  }, [app]);
  const chooseRetention = (label: string) => {
    setRetention(label);
    if (isApp()) void invoke("set_audio_retention", { choice: retentionChoice(label) }).catch(() => {});
  };

  const showFolder = () => void revealPath(folder).catch(() => setFolderError("Ensayo couldn't open the folder. It is at " + folder + "."));
  const reopen = () => later(() => window.location.reload(), 1800);
  const moveFolder = async () => {
    const problem = folderPathProblem(newFolder);
    if (problem) return setFolderError(problem);
    setBusy(true);
    try {
      const result = await invoke<"copied" | "existing">("move_data_folder", { folder: newFolder.trim() });
      setFolderDone(folderChangedLine(result));
      reopen();
    } catch (e) {
      setFolderError(folderProblemLine(e));
      setBusy(false);
    }
  };
  const deleteRecordings = async () => {
    setAsking(null);
    if (!app) return setRecordingsMb(0);
    try {
      await invoke("delete_all_audio");
      setRecordingsMb(0);
      setDeleteError("");
    } catch (e) {
      setDeleteError(deleteFailedLine(e));
    }
  };
  const deleteEverything = async () => {
    setAsking(null);
    if (app) {
      try {
        await invoke("delete_all_data");
      } catch (e) {
        return setDeleteError(deleteFailedLine(e));
      }
      clearPrefs();
      reopen();
    }
    setAllDeleted(true);
    setRecordingsMb(0);
  };

  return (
    <SettingsLayout active="8-6-settings-privacy">
      <div style={{ flex: "999 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingBottom: "10px" }}>
            <span className="e-h2">What leaves this computer</span>
            <span className="e-meta">Based on your current setup. Change engines to change this list.</span>
          </div>
          {rows.map((r, i) => (
            <div key={r.title} className="e-rowline" style={i === rows.length - 1 ? { borderBottom: "none" } : undefined}>
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                {r.title}<span className="e-small">{r.detail}</span>
              </span>
              <span className={r.stays ? "e-badge e-badge-ok" : "e-badge"}>{r.badge}</span>
            </div>
          ))}
        </section>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span className="e-h3" style={{ paddingBottom: "8px" }}>Keep</span>
          <div className="e-rowline">
            <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
              Recordings<span className="e-small">Transcripts and scores stay after audio is removed.</span>
            </span>
            <select className="e-input" style={{ width: "220px" }} aria-label="Keep recordings" value={retention} onChange={(e) => chooseRetention(e.target.value)}>
              {privacy.retentionOptions.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div className="e-rowline" style={{ borderBottom: "none", flexWrap: "wrap" }}>
            <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
              Data folder<span className="e-small">{app && folder ? "Stories, applications and sessions, as plain files" : "Ensayo's app folder on this computer · stories, applications, sessions as plain files"}</span>
              {app && folder && <span className="e-small" style={{ color: "var(--e-ink)", overflowWrap: "anywhere" }}>{folder}</span>}
              {folderNote && !app && (
                <span className="e-small" role="status" style={{ color: "var(--e-ink)" }}>
                  {folderNote === "show" ? "This opens the folder in Finder or File Explorer." : "This lets you pick a new place for the folder, then moves everything there."}
                </span>
              )}
              {folderDone && <span className="e-small" role="status" style={{ color: "var(--e-primary-dark)" }}>{folderDone}</span>}
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={app ? showFolder : () => setFolderNote("show")}>Show</button>
              <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={busy} onClick={() => (app ? setFolderNote(folderNote === "move" ? null : "move") : setFolderNote("move"))}>Move…</button>
            </div>
            {app && folderNote === "move" && !folderDone && (
              <div style={{ flexBasis: "100%", display: "flex", flexDirection: "column", gap: "8px" }}>
                <span className="e-small">Make an empty folder first, or choose one that already holds your Ensayo data, then paste its full path. An empty folder gets a copy of your data. Ensayo reopens afterwards.</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
                  <input className="e-input" style={{ flex: "1 1 280px" }} aria-label="New data folder" placeholder="/Users/you/Drive/Ensayo" value={newFolder} onChange={(e) => { setNewFolder(e.target.value); setFolderError(""); }} />
                  <button type="button" className="e-btn e-btn-primary e-btn-sm" disabled={busy} onClick={() => void moveFolder()}>{busy ? "Moving…" : "Use this folder"}</button>
                  <button type="button" className="e-btn e-btn-ghost e-btn-sm" disabled={busy} onClick={() => { setFolderNote(null); setFolderError(""); }}>Cancel</button>
                </div>
                {folderError && <span className="e-small" role="alert" style={{ color: "var(--e-warn-ink)" }}>{folderError}</span>}
              </div>
            )}
          </div>
        </section>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <span className="e-h3">Delete</span>
          <div className="e-rowline" style={asking === "recordings" ? { flexWrap: "wrap" } : undefined}>
            <span style={{ flex: "1" }}>
              Delete all recordings now <span className="e-small">· {formatSize(recordingsMb)}</span>
            </span>
            {asking === "recordings" ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span className="e-meta">Delete every recording? The text stays.</span>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setAsking(null)}>Keep them</button>
                <button type="button" className="e-btn e-btn-danger e-btn-sm" onClick={() => void deleteRecordings()}>Yes, delete</button>
              </span>
            ) : (
              <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={recordingsMb === 0} onClick={() => { setAsking("recordings"); setTyped(""); }}>Delete recordings</button>
            )}
          </div>
          <div className="e-rowline" style={{ borderBottom: "none", flexWrap: "wrap" }}>
            <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
              Delete everything<span className="e-small">Stories, applications, sessions, recordings, speech models, settings and saved keys. You'll type DELETE to confirm.</span>
            </span>
            {asking !== "all" && !allDeleted && (
              <button type="button" className="e-btn e-btn-danger e-btn-sm" onClick={() => { setAsking("all"); setTyped(""); }}>Delete all Ensayo data</button>
            )}
            {allDeleted && <span className="e-meta" role="status">{app ? "Everything is deleted. Ensayo is starting over." : "Everything is deleted. Prototype: nothing was actually removed."}</span>}
            {asking === "all" && (
              <div style={{ flexBasis: "100%", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
                <input className="e-input" style={{ width: "200px" }} placeholder="Type DELETE" aria-label="Type DELETE to confirm" value={typed} onChange={(e) => setTyped(e.target.value)} />
                <button type="button" className="e-btn e-btn-danger e-btn-sm" disabled={typed !== "DELETE"} onClick={() => void deleteEverything()}>Delete everything</button>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setAsking(null)}>Cancel</button>
              </div>
            )}
            {deleteError && <span className="e-meta" role="alert" style={{ flexBasis: "100%", color: "var(--e-warn-ink)" }}>{deleteError}</span>}
          </div>
        </section>
      </div>
    </SettingsLayout>
  );
}
