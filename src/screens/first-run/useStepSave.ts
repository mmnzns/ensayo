import { useState, type MouseEvent } from "react";
import { go } from "../../ui/router";

export const SAVE_PROBLEM = "Ensayo couldn't save that. Check that your data folder is available, then press Continue again.";

/** A setup step's Continue: run the save, then go to the next step; a failed save stays on the step with a plain line. */
export function useStepSave(next: string) {
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  /** For a link's onClick: the link's own href is the fallback when the page has no way to save (the browser preview). */
  const onContinue = (save: () => Promise<void>, ok: () => boolean = () => true) => async (e: MouseEvent) => {
    e.preventDefault();
    if (saving || !ok()) return;
    setSaving(true);
    setProblem("");
    try {
      await save();
      go(next);
    } catch {
      setProblem(SAVE_PROBLEM);
      setSaving(false);
    }
  };
  return { saving, problem, onContinue };
}
