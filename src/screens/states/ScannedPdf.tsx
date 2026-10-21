import { useId, useState } from "react";
import { useStore } from "../../data/store";
import Dialog, { disabledButton, useQuietConfirm } from "./Dialog";
import PreviewStage, { goBack } from "./Preview";

export interface ScannedPdfDialogProps {
  fileName: string;
  onClose: () => void;
  onConfirm?: (text: string) => void;
}

/** A resume PDF with no readable text: paste the text instead. The file stays as the record of what was sent. */
export function ScannedPdfDialog({ fileName, onClose, onConfirm }: ScannedPdfDialogProps) {
  const [text, setText] = useState("");
  const { message, confirm } = useQuietConfirm(onClose);
  const fieldId = useId();
  const ready = text.trim().length > 0;
  return (
    <Dialog
      title="This PDF has no text Ensayo can read"
      onClose={onClose}
      confirmed={message}
      width={600}
      actions={
        <>
          <button type="button" className="e-btn e-btn-line" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="e-btn e-btn-primary"
            disabled={!ready}
            style={ready ? undefined : disabledButton}
            onClick={() => {
              onConfirm?.(text);
              confirm("Saved. Ensayo is reading the text you pasted.");
            }}
          >
            Use this text
          </button>
        </>
      }
    >
      <p className="e-body" style={{ margin: 0 }}>
        "{fileName}" looks like a scan or a picture of a page, so there are no words in it to read. The file stays as the record of what you sent. Paste the text of your resume below and Ensayo will read that instead.
      </p>
      <div className="e-field">
        <label htmlFor={fieldId}>Your resume text</label>
        <textarea id={fieldId} className="e-input" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the text of your resume here" spellCheck={false} />
      </div>
      <p className="e-small" style={{ margin: 0 }}>
        Nothing leaves this computer except what the AI engine reads, and only when it needs it. With no AI engine, the text stays here and Ensayo finds numbers and dates by pattern.
      </p>
    </Dialog>
  );
}

export default function ScannedPdf() {
  const { applications, screens } = useStore();
  const fileName = applications.find((a) => a.resume)?.resume?.fileName ?? screens.states.scannedPdf.fileName;
  return (
    <PreviewStage>
      <ScannedPdfDialog fileName={fileName} onClose={goBack} />
    </PreviewStage>
  );
}
