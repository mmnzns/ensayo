import Dialog from "../screens/states/Dialog";
import { LEAVE_BODY, LEAVE_GO, LEAVE_STAY, LEAVE_TITLE, confirmLeave, stayHere, useLeaveQuestion } from "./dirtyGuard";

export function LeaveDialogView({ asking, onStay, onLeave }: { asking: boolean; onStay: () => void; onLeave: () => void }) {
  if (!asking) return null;
  return (
    <Dialog
      title={LEAVE_TITLE}
      onClose={onStay}
      width={440}
      actions={
        <>
          <button type="button" data-autofocus className="e-btn e-btn-line" onClick={onStay}>{LEAVE_STAY}</button>
          <button type="button" className="e-btn e-btn-primary" onClick={onLeave}>{LEAVE_GO}</button>
        </>
      }
    >
      <p className="e-body" style={{ margin: 0 }}>{LEAVE_BODY}</p>
    </Dialog>
  );
}

/** Mounted in both shells: the question every `useDirtyGuard` screen asks. */
export default function LeaveDialog() {
  return <LeaveDialogView asking={useLeaveQuestion()} onStay={stayHere} onLeave={confirmLeave} />;
}
