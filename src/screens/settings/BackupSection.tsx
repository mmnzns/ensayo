// Settings > Privacy > Back up and restore: one zip of the data folder, saved where the person chooses. Recordings, speech
// models, saved keys and this computer's settings are never in it. The buttons only exist in the app.
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isApp } from "../../data/real";
import { pickBackupFile, pickBackupSavePath } from "../../ui/pickFile";
import { backupFileName, backupProblemLine, countsLine, dateWords, lastBackupLine, readLastBackup, restoredLine, saveLastBackup, type BackupInfo, type RestoreMode, type RestoreReport } from "./backup";
import { useLater } from "./parts";

interface Picked {
  path: string;
  info: BackupInfo;
}

export default function BackupSection() {
  const app = isApp();
  const later = useLater();
  const [last, setLast] = useState<string | null>(() => readLastBackup());
  const [picked, setPicked] = useState<Picked | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");

  const backUp = async () => {
    setNote("");
    setProblem("");
    const path = await pickBackupSavePath(backupFileName());
    if (!path) return;
    setBusy(true);
    try {
      const made = await invoke<{ created_at: string }>("backup_data", { path });
      saveLastBackup(made.created_at);
      setLast(made.created_at);
      setNote("Backup saved.");
    } catch (e) {
      setProblem(backupProblemLine(e));
    }
    setBusy(false);
  };

  const choose = async () => {
    setNote("");
    setProblem("");
    setConfirming(false);
    const path = await pickBackupFile();
    if (!path) return;
    setBusy(true);
    try {
      setPicked({ path, info: await invoke<BackupInfo>("inspect_backup", { path }) });
    } catch (e) {
      setPicked(null);
      setProblem(backupProblemLine(e));
    }
    setBusy(false);
  };

  const restore = async (mode: RestoreMode) => {
    if (!picked) return;
    setBusy(true);
    setProblem("");
    try {
      const report = await invoke<RestoreReport>("restore_backup", { path: picked.path, mode });
      setNote(restoredLine(report));
      setPicked(null);
      setConfirming(false);
      // The same reload the data folder change uses: the app reads everything from the folder again.
      later(() => window.location.reload(), 1800);
    } catch (e) {
      setProblem(backupProblemLine(e));
      setBusy(false);
    }
  };

  const info = picked?.info;
  return (
    <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "4px" }} aria-label="Backup">
      <span className="e-h3" style={{ paddingBottom: "8px" }}>Backup</span>
      <div className="e-rowline" style={{ flexWrap: "wrap", borderBottom: info ? undefined : "none" }}>
        <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
          Back up your data
          <span className="e-small">Your stories, targets, applications and sessions in one zip file you choose where to keep. Recordings, speech models and saved keys are not included.</span>
          {app && <span className="e-small" style={{ color: "var(--e-ink)" }}>{lastBackupLine(last)}</span>}
        </span>
        {app ? (
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={busy} onClick={() => void backUp()}>Back up now</button>
            <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={busy} onClick={() => void choose()}>Restore from a backup</button>
          </div>
        ) : (
          <span className="e-small">Backup works in the Ensayo app.</span>
        )}
      </div>
      {info && picked && (
        <div className="e-rowline" style={{ flexDirection: "column", alignItems: "stretch", gap: "10px", borderBottom: "none" }} role="group" aria-label="This backup">
          <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            Made {dateWords(info.created_at) || "on an unknown date"}, Ensayo {info.app_version}
            <span className="e-small" style={{ color: "var(--e-ink)" }}>{countsLine(info.counts)}</span>
            {info.warnings.map((w) => (
              <span key={w} className="e-small" style={{ color: "var(--e-warn-ink)" }}>{w}</span>
            ))}
          </span>
          {confirming ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span className="e-meta">Replace everything you have now with this backup? Ensayo saves a copy of your current data on this computer first.</span>
              <button type="button" className="e-btn e-btn-ghost e-btn-sm" disabled={busy} onClick={() => setConfirming(false)}>Keep my data</button>
              <button type="button" className="e-btn e-btn-danger e-btn-sm" disabled={busy} onClick={() => void restore("replace")}>Yes, replace</button>
            </span>
          ) : (
            <>
              <span className="e-small">Merge adds what is missing and keeps every file you already have. Replace swaps your data for the backup.</span>
              <span style={{ display: "inline-flex", gap: "8px", flexWrap: "wrap" }}>
                <button type="button" className="e-btn e-btn-primary e-btn-sm" disabled={busy} onClick={() => void restore("merge")}>Merge</button>
                <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={busy} onClick={() => setConfirming(true)}>Replace</button>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" disabled={busy} onClick={() => setPicked(null)}>Cancel</button>
              </span>
            </>
          )}
        </div>
      )}
      {note && <span className="e-small" role="status" style={{ color: "var(--e-primary-dark)" }}>{note}</span>}
      {problem && <span className="e-small" role="alert" style={{ color: "var(--e-warn-ink)" }}>{problem}</span>}
    </section>
  );
}
