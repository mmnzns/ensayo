// "Fix a word": the helpers behind editing the transcript on the result screen.
import type { TranscriptLine } from "../../data/screens/practice";

/** Shown in Details once the person fixed the transcript. */
export const FIXED_LINE = "You fixed the transcript.";
export const FIX_SAVED_HINT = "Change what was heard wrong, one line at a time. Ensayo keeps the original words and scores the answer again.";

/** A line as plain text, whether it came as one string or as pieces. */
export const lineText = (line: TranscriptLine): string => (typeof line.text === "string" ? line.text : line.text.map((p) => p.text).join(""));

/** True when the edited lines differ from the ones shown, ignoring runs of spaces. */
export function linesChanged(shown: string[], edited: string[]): boolean {
  const norm = (s: string) => s.trim().split(/\s+/).filter(Boolean).join(" ");
  return shown.length !== edited.length || shown.some((s, i) => norm(s) !== norm(edited[i]));
}
