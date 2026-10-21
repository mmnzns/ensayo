import { useStore } from "../../data/store";
import Dialog, { useQuietConfirm } from "./Dialog";
import PreviewStage, { goBack } from "./Preview";

export interface DataFolderMissingDialogProps {
  folder: string;
  localFolder: string;
  onClose: () => void;
  onWait?: () => void;
  onUseLocal?: () => void;
}

/** The data folder cannot be found (Drive not mounted, offline before the first sync). Never starts an empty bank over it. */
export function DataFolderMissingDialog({ folder, localFolder, onClose, onWait, onUseLocal }: DataFolderMissingDialogProps) {
  const { message, confirm } = useQuietConfirm(onClose, 1400);
  return (
    <Dialog
      title="Your data folder isn't available"
      onClose={onClose}
      confirmed={message}
      width={560}
      actions={
        <>
          <button
            type="button"
            className="e-btn e-btn-line"
            onClick={() => {
              onUseLocal?.();
              confirm(`Using ${localFolder} for now. Your other folder is untouched.`);
            }}
          >
            Use a local folder for now
          </button>
          <button
            type="button"
            className="e-btn e-btn-primary"
            data-autofocus
            onClick={() => {
              onWait?.();
              confirm("Waiting. Ensayo will look again in a moment.");
            }}
          >
            Wait
          </button>
        </>
      }
    >
      <p className="e-body" style={{ margin: 0 }}>
        Ensayo keeps your stories, applications and practice in <span className="e-kbd" style={{ fontSize: "13px" }}>{folder}</span>, and it can't find it right now. A synced drive that hasn't mounted yet, or a computer that's offline before its first sync, can cause this.
      </p>
      <p className="e-meta" style={{ margin: 0 }}>
        Waiting is usually enough. A local folder lets you keep practicing, and Ensayo will never create an empty bank over the one that's missing. You can switch back in Settings, under Privacy.
      </p>
    </Dialog>
  );
}

export default function DataFolderMissing() {
  const { path, localPath } = useStore().screens.states.dataFolderMissing;
  return (
    <PreviewStage>
      <DataFolderMissingDialog folder={path} localFolder={localPath} onClose={goBack} />
    </PreviewStage>
  );
}
