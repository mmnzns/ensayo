import { useState } from "react";
import { useStore } from "../../data/store";
import Dialog, { dangerButton, useQuietConfirm } from "./Dialog";
import { plural } from "./format";
import PreviewStage, { goBack } from "./Preview";

export interface DeleteApplicationDialogProps {
  company: string;
  role: string;
  /** How many practice sessions belong to it. */
  sessionCount: number;
  onClose: () => void;
  /** Called with true when "Delete its practice too" was ticked. */
  onConfirm?: (alsoDeletePractice: boolean) => void;
}

/** "Delete this application?": the sessions stay as "Practice without an application" unless the user also ticks the box. */
export function DeleteApplicationDialog({ company, role, sessionCount, onClose, onConfirm }: DeleteApplicationDialogProps) {
  const [alsoPractice, setAlsoPractice] = useState(false);
  const { message, confirm } = useQuietConfirm(onClose);
  const sessions = plural(sessionCount, "practice session");

  return (
    <Dialog
      title={`Delete ${company}?`}
      onClose={onClose}
      confirmed={message}
      actions={
        <>
          <button type="button" className="e-btn e-btn-line" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="e-btn"
            style={dangerButton}
            onClick={() => {
              onConfirm?.(alsoPractice);
              confirm(alsoPractice ? "Application and its practice deleted." : "Application deleted. Its practice is still in your history.");
            }}
          >
            {alsoPractice ? "Delete application and practice" : "Delete application"}
          </button>
        </>
      }
    >
      <p className="e-body" style={{ margin: 0 }}>
        This removes {company}, {role}: its job posting, the resume file you attached, the claims log and the stages. It can't be undone.
      </p>
      <p className="e-meta" style={{ margin: 0 }}>
        {sessionCount === 0
          ? "It has no practice sessions yet."
          : alsoPractice
            ? `Its ${sessions} will be deleted too, with their transcripts, notes and any recordings.`
            : `Its ${sessions} stay in your history as "Practice without an application".`}
      </p>
      {sessionCount > 0 ? (
        <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", cursor: "pointer" }}>
          <input type="checkbox" className="e-check" style={{ marginTop: "2px", flex: "none" }} checked={alsoPractice} onChange={(e) => setAlsoPractice(e.target.checked)} />
          <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ fontWeight: 600 }}>Delete its practice too</span>
            <span className="e-small">Leave this off to keep your reps and the progress they built.</span>
          </span>
        </label>
      ) : null}
    </Dialog>
  );
}

export default function DeleteApplication() {
  const { applications, sessions } = useStore();
  const app = applications.find((a) => a.id === "app_kestrel") ?? applications[0];
  const count = app ? sessions.filter((s) => s.applicationId === app.id).length : 0;
  return (
    <PreviewStage>
      <DeleteApplicationDialog company={app?.company ?? "this application"} role={app?.role ?? "your role"} sessionCount={count} onClose={goBack} />
    </PreviewStage>
  );
}
