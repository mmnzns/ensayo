import { useStore } from "../../data/store";
import Dialog, { useQuietConfirm } from "./Dialog";
import { ago } from "./format";
import PreviewStage, { goBack } from "./Preview";

export interface OtherMachineOpenDialogProps {
  machine: string;
  /** "4 minutes ago" */
  lastSeen: string;
  onClose: () => void;
  onWait?: () => void;
  onOpenAnyway?: () => void;
}

/** The lock-file warning: another computer had Ensayo open recently. */
export function OtherMachineOpenDialog({ machine, lastSeen, onClose, onWait, onOpenAnyway }: OtherMachineOpenDialogProps) {
  const { message, confirm } = useQuietConfirm(onClose, 1400);
  return (
    <Dialog
      title="Ensayo is open on another computer"
      onClose={onClose}
      confirmed={message}
      actions={
        <>
          <button
            type="button"
            className="e-btn e-btn-line"
            onClick={() => {
              onOpenAnyway?.();
              confirm("Opening. If two copies of a file clash, Ensayo will ask you which one to keep.");
            }}
          >
            Open anyway
          </button>
          <button
            type="button"
            className="e-btn e-btn-primary"
            data-autofocus
            onClick={() => {
              onWait?.();
              confirm("Okay. Close Ensayo on the other computer, then open it here.");
            }}
          >
            Wait
          </button>
        </>
      }
    >
      <p className="e-body" style={{ margin: 0 }}>
        {machine} had Ensayo open {lastSeen}, and your data folder is shared between the two.
      </p>
      <p className="e-meta" style={{ margin: 0 }}>
        Running both at once is how clashing copies of a file happen. If you're sure it's closed over there, you can open it here anyway.
      </p>
    </Dialog>
  );
}

export default function OtherMachineOpen() {
  const store = useStore();
  const { machine, lastSeen } = store.screens.states.otherMachine;
  return (
    <PreviewStage>
      <OtherMachineOpenDialog machine={machine} lastSeen={ago(lastSeen, store.now())} onClose={goBack} />
    </PreviewStage>
  );
}
