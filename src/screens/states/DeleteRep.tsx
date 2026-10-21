import { useStore } from "../../data/store";
import Dialog, { dangerButton, useQuietConfirm } from "./Dialog";
import { formatWhen } from "./format";
import PreviewStage, { goBack } from "./Preview";

export interface DeleteRepDialogProps {
  question: string;
  /** "Attempt 2 of 3 · Today, 9:12 PM" */
  detail: string;
  onClose: () => void;
  onConfirm?: () => void;
}

/** "Delete this answer?": one rep, with its recording, transcript and notes. */
export function DeleteRepDialog({ question, detail, onClose, onConfirm }: DeleteRepDialogProps) {
  const { message, confirm } = useQuietConfirm(onClose);
  return (
    <Dialog
      title="Delete this answer?"
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
              onConfirm?.();
              confirm("Answer deleted.");
            }}
          >
            Delete answer
          </button>
        </>
      }
    >
      <div className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <span className="e-body" style={{ fontWeight: 600 }}>{question}</span>
        <span className="e-small">{detail}</span>
      </div>
      <p className="e-meta" style={{ margin: 0 }}>
        Its recording, transcript and note are removed from this computer, and nothing is left behind. The other answers in that session stay. It can't be undone.
      </p>
    </Dialog>
  );
}

export default function DeleteRep() {
  const store = useStore();
  const rep = store.screens.states.deleteRep;
  return (
    <PreviewStage>
      <DeleteRepDialog question={rep.question} detail={`Attempt ${rep.attempt} of ${rep.of} · ${formatWhen(rep.at, store.now())}`} onClose={goBack} />
    </PreviewStage>
  );
}
