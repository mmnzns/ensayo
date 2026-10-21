import { useStore } from "../../data/store";
import Dialog, { useQuietConfirm } from "./Dialog";
import PreviewStage, { goBack } from "./Preview";

export interface NightBeforeLockWarningDialogProps {
  company: string;
  stageLabel: string;
  opener: string;
  storyTitle: string;
  questions: string[];
  onClose: () => void;
  onKeepLocked?: () => void;
  onUnlock?: () => void;
}

/** Shown when someone tries to change the night-before set after locking it. Closing it (Esc, scrim) keeps the lock. */
export function NightBeforeLockWarningDialog({ company, stageLabel, opener, storyTitle, questions, onClose, onKeepLocked, onUnlock }: NightBeforeLockWarningDialogProps) {
  const { message, confirm } = useQuietConfirm(onClose);
  const rows: { label: string; value: string }[] = [
    { label: "Opener", value: opener },
    { label: "Power story", value: storyTitle },
    ...questions.map((q, i) => ({ label: i === 0 ? "Your questions" : "", value: q })),
  ];
  return (
    <Dialog
      title="This set is locked for tomorrow"
      onClose={onClose}
      confirmed={message}
      width={560}
      actions={
        <>
          <button
            type="button"
            className="e-btn e-btn-line"
            onClick={() => {
              onUnlock?.();
              confirm("Unlocked. Pick what you want to change.");
            }}
          >
            Unlock and change
          </button>
          <button
            type="button"
            className="e-btn e-btn-primary"
            data-autofocus
            onClick={() => {
              onKeepLocked?.();
              confirm("Still locked. One more run of it is plenty.");
            }}
          >
            Keep it locked
          </button>
        </>
      }
    >
      <p className="e-body" style={{ margin: 0 }}>
        You locked three things for {company}, {stageLabel}: your opener, one story and two questions to ask. The idea is to change nothing after that.
      </p>
      <div className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: "12px", alignItems: "baseline" }}>
            <span className="e-label" style={{ width: "110px", flex: "none" }}>{r.label}</span>
            <span style={{ flex: 1 }}>{r.value}</span>
          </div>
        ))}
      </div>
      <p className="e-meta" style={{ margin: 0 }}>
        New material the night before tends to crowd out what you already know cold. You can unlock it, but a short run of these three usually does more than a change.
      </p>
    </Dialog>
  );
}

export default function NightBeforeLockWarning() {
  const { applications, screens } = useStore();
  const app = applications.find((a) => a.id === "app_kestrel") ?? applications[0];
  const stage = app?.process.find((s) => s.id === app.current_stage_id);
  const set = screens.states.lockedSet;
  return (
    <PreviewStage>
      <NightBeforeLockWarningDialog
        company={app?.company ?? "this application"}
        stageLabel={stage?.label ?? "your next stage"}
        opener={set.opener}
        storyTitle={set.storyTitle}
        questions={set.questions}
        onClose={goBack}
      />
    </PreviewStage>
  );
}
