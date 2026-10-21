import { useId, useState } from "react";
import { useStore } from "../../data/store";
import Dialog, { dangerButton, disabledButton, useQuietConfirm } from "./Dialog";
import PreviewStage, { goBack } from "./Preview";

export interface DeleteAllDataDialogProps {
  onClose: () => void;
  onConfirm?: () => void;
}

/** "Delete all Ensayo data?": the red button wakes up when the word DELETE is typed. */
export function DeleteAllDataDialog({ onClose, onConfirm }: DeleteAllDataDialogProps) {
  const { confirmWord, removes } = useStore().screens.states.deleteAll;
  const [typed, setTyped] = useState("");
  const { message, confirm } = useQuietConfirm(onClose, 1400);
  const inputId = useId();
  const ready = typed.trim() === confirmWord;

  const submit = () => {
    if (!ready) return;
    onConfirm?.();
    confirm("Everything is deleted. Ensayo will start over like a first run.");
  };

  return (
    <Dialog
      title="Delete all Ensayo data?"
      onClose={onClose}
      confirmed={message}
      width={560}
      actions={
        <>
          <button type="button" className="e-btn e-btn-line" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="e-btn" disabled={!ready} style={ready ? dangerButton : { ...dangerButton, ...disabledButton }} onClick={submit}>
            Delete all Ensayo data
          </button>
        </>
      }
    >
      <p className="e-body" style={{ margin: 0 }}>
        This removes everything Ensayo keeps on this computer. It can't be undone.
      </p>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" }}>
        {removes.map((r, i) => (
          <li key={r.label} className="e-rowline" style={{ padding: "10px 0", alignItems: "flex-start", borderBottom: i === removes.length - 1 ? "none" : undefined }}>
            <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontWeight: 600 }}>{r.label}</span>
              <span className="e-small">{r.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="e-field">
        <label htmlFor={inputId}>Type {confirmWord} to confirm</label>
        <input
          id={inputId}
          className="e-input"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={confirmWord}
        />
      </div>
    </Dialog>
  );
}

export default function DeleteAllData() {
  return (
    <PreviewStage>
      <DeleteAllDataDialog onClose={goBack} />
    </PreviewStage>
  );
}
