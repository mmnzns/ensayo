import { useStore } from "../../data/store";
import Dialog, { useQuietConfirm } from "./Dialog";
import { formatStamp } from "./format";
import PreviewStage, { goBack } from "./Preview";

export interface ConflictVersion {
  fileName: string;
  /** Local date-time of the last change. */
  at: string;
  machine: string;
  /** A short diff, one line each. */
  summary: string[];
}

export interface SyncConflictDialogProps {
  fileName: string;
  versions: ConflictVersion[];
  onClose: () => void;
  onKeep?: (version: ConflictVersion) => void;
}

/** Two copies of one file after a sync clash, side by side. Ensayo never merges silently. */
export function SyncConflictDialog({ fileName, versions, onClose, onKeep }: SyncConflictDialogProps) {
  const { message, confirm } = useQuietConfirm(onClose, 1400);
  const newest = versions.reduce<string | null>((best, v) => (best === null || v.at > best ? v.at : best), null);
  return (
    <Dialog
      title={`Two versions of ${fileName}`}
      onClose={onClose}
      confirmed={message}
      width={760}
      actions={
        <button type="button" className="e-btn e-btn-ghost" onClick={onClose}>
          Decide later
        </button>
      }
    >
      <p className="e-body" style={{ margin: 0 }}>
        Your sync service saved two copies of this file, probably from two computers. Look at what is different and pick the one to keep.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
        {versions.map((v) => (
          <section key={v.fileName} aria-label={v.fileName} style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "20px", borderRadius: "var(--e-r-md)", boxShadow: "inset 0 0 0 1.5px var(--e-line)", background: "var(--e-surface)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
              <span className="e-kbd" style={{ fontSize: "13px" }}>{v.fileName}</span>
              {v.at === newest && versions.length > 1 ? <span className="e-badge">Newer</span> : null}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span className="e-h3">{formatStamp(v.at)}</span>
              <span className="e-meta">Saved on {v.machine}</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "4px", fontSize: "14px", lineHeight: 1.5 }}>
              {v.summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <button
              type="button"
              className="e-btn e-btn-primary"
              style={{ marginTop: "auto" }}
              onClick={() => {
                onKeep?.(v);
                confirm(`Kept ${v.fileName}. The other copy waits in a Conflicts folder until you delete it.`);
              }}
            >
              Keep this one
            </button>
          </section>
        ))}
      </div>
      <p className="e-small" style={{ margin: 0 }}>
        Ensayo never merges silently. Nothing changes until you choose.
      </p>
    </Dialog>
  );
}

export default function SyncConflict() {
  const { fileName, versions } = useStore().screens.states.syncConflict;
  return (
    <PreviewStage>
      <SyncConflictDialog fileName={fileName} versions={versions} onClose={goBack} />
    </PreviewStage>
  );
}
