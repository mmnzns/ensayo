import { useStore } from "../../data/store";
import Dialog, { dangerButton, useQuietConfirm } from "./Dialog";
import PreviewStage, { goBack } from "./Preview";

export interface DeleteStoryDialogProps {
  storyTitle: string;
  onClose: () => void;
  onConfirm?: () => void;
}

/** "Delete this story?" */
export function DeleteStoryDialog({ storyTitle, onClose, onConfirm }: DeleteStoryDialogProps) {
  const { message, confirm } = useQuietConfirm(onClose);
  return (
    <Dialog
      title={`Delete "${storyTitle}"?`}
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
              confirm("Story deleted.");
            }}
          >
            Delete story
          </button>
        </>
      }
    >
      <p className="e-body" style={{ margin: 0 }}>
        This removes the story and its numbers from your bank. It can't be undone.
      </p>
      <p className="e-meta" style={{ margin: 0 }}>
        Practice you already did on it stays in your history. Any application that leaned on it will show "No story for this yet" for that point.
      </p>
    </Dialog>
  );
}

export default function DeleteStory() {
  const { stories } = useStore();
  return (
    <PreviewStage>
      <DeleteStoryDialog storyTitle={stories[0]?.title ?? "This story"} onClose={goBack} />
    </PreviewStage>
  );
}
