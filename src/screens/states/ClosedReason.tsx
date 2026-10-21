import { useId, useState } from "react";
import { useStore } from "../../data/store";
import type { ClosedReason as Reason } from "../../data/types";
import Dialog, { disabledButton, useQuietConfirm } from "./Dialog";
import PreviewStage, { goBack } from "./Preview";

export interface ClosedReasonDialogProps {
  company: string;
  role: string;
  onClose: () => void;
  /** Called when Save is pressed, before the quiet confirmation. */
  onConfirm?: (reason: Reason) => void;
}

/** "Why did this close?": four reasons as radio cards; Save waits for a pick. */
export function ClosedReasonDialog({ company, role, onClose, onConfirm }: ClosedReasonDialogProps) {
  const { closedReasons } = useStore().screens.states;
  const [reason, setReason] = useState<Reason | null>(null);
  const { message, confirm } = useQuietConfirm(onClose);
  const group = useId();

  const save = () => {
    if (!reason) return;
    onConfirm?.(reason);
    confirm(`Saved. ${company} is now closed.`);
  };

  return (
    <Dialog
      title="Why did this close?"
      onClose={onClose}
      confirmed={message}
      actions={
        <>
          <button type="button" className="e-btn e-btn-line" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="e-btn e-btn-primary" disabled={!reason} style={reason ? undefined : disabledButton} onClick={save}>
            Save
          </button>
        </>
      }
    >
      <p className="e-meta" style={{ margin: 0 }}>
        {company}, {role}. Pick the closest one. It's only for your own record, and you can change it later in Edit details.
      </p>
      <div role="radiogroup" aria-label="Why it closed" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {closedReasons.map((r) => {
          const on = reason === r.id;
          return (
            <label key={r.id} className={on ? "e-chip e-chip-on" : "e-chip"} style={{ width: "100%", borderRadius: "var(--e-r-md)", padding: "14px 16px", alignItems: "flex-start", gap: "12px" }}>
              <input type="radio" name={group} className="e-check" style={{ marginTop: "2px" }} checked={on} onChange={() => setReason(r.id)} />
              <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontWeight: 600 }}>{r.label}</span>
                <span className="e-small">{r.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </Dialog>
  );
}

export default function ClosedReason() {
  const { applications } = useStore();
  const app = applications.find((a) => a.id === "app_kestrel") ?? applications[0];
  return (
    <PreviewStage>
      <ClosedReasonDialog company={app?.company ?? "This application"} role={app?.role ?? "your role"} onClose={goBack} />
    </PreviewStage>
  );
}
