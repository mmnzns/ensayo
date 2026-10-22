// "What leaves this computer" is worked out from the engines in use, so changing engines changes the list.
import type { PrivacyData } from "../../data/screens/settings";

export interface LeaveRow {
  title: string;
  detail: string;
  badge: string;
  /** True when nothing goes out for this row (green badge). */
  stays: boolean;
}

export function leavesRows(setup: PrivacyData["setup"]): LeaveRow[] {
  const { speech, speechLocal, ai, provider, assistant } = setup;
  const rows: LeaveRow[] = [];
  rows.push(
    speechLocal
      ? { title: "Your recordings", detail: `${speech} runs here. Audio never leaves.`, badge: "Stays here", stays: true }
      : { title: "Your recordings", detail: `Sent to ${speech} to turn into text, one answer at a time.`, badge: `Sent to ${speech}`, stays: false },
  );
  if (ai === "key") {
    rows.push({ title: "Transcripts of your answers", detail: `Sent to ${provider} so ${assistant} can give feedback. Not used for training.`, badge: `Sent to ${provider}`, stays: false });
    rows.push({ title: "Stories, job postings and resumes", detail: "Sent only when a question needs them.", badge: "Sent when needed", stays: false });
  } else if (ai === "local") {
    rows.push({ title: "Transcripts of your answers", detail: "The AI runs on this computer. Nothing is sent.", badge: "Stays here", stays: true });
    rows.push({ title: "Stories, job postings and resumes", detail: "Read by the AI on this computer only.", badge: "Stays here", stays: true });
  } else {
    rows.push({ title: "Transcripts of your answers", detail: "Timing and fillers are worked out here. No AI is used.", badge: "Stays here", stays: true });
    rows.push({ title: "Stories, job postings and resumes", detail: "Not used without an AI engine.", badge: "Stays here", stays: true });
  }
  rows.push({ title: "Feedback you send", detail: "Only the message, your email if you add it, and app version if you tick it. Sent when you press Send.", badge: "Sent when you choose", stays: false });
  rows.push({ title: "Usage data about Ensayo", detail: "There is none. Ensayo has no analytics.", badge: "Nothing sent", stays: true });
  return rows;
}

const RETENTION: [string, string][] = [
  ["7 days", "7"],
  ["30 days", "30"],
  ["90 days", "90"],
  ["Forever", "forever"],
  ["Don't keep", "none"],
];

/** The label in the Keep recordings list for what the backend stores ("30"), and back. */
export const retentionLabel = (choice: string): string => RETENTION.find(([, c]) => c === choice)?.[0] ?? "30 days";
export const retentionChoice = (label: string): string => RETENTION.find(([l]) => l === label)?.[1] ?? "30";

// ---------- Settings, Privacy in the app ----------

/** What the data folder box says when its text can't be a folder yet; null when it can. */
export function folderPathProblem(text: string): string | null {
  const t = text.trim();
  if (!t) return "Type or paste the folder you want to use.";
  if (!/^(\/|~|[A-Za-z]:[\\/]|\\\\)/.test(t)) return "Use the full path to the folder, for example /Users/sam/Drive/Ensayo or C:\\Users\\Sam\\Drive\\Ensayo.";
  return null;
}

/** What `move_data_folder` did, in a sentence. Ensayo reopens right after. */
export function folderChangedLine(result: "copied" | "existing"): string {
  return result === "copied"
    ? "Your data is copied to the new folder. The old one is left as it was, so delete it yourself once you've checked. Ensayo is reopening."
    : "That folder already had your Ensayo data, so Ensayo is using it as it is and reopening.";
}

const sentence = (e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : "").trim();

/** The backend rejects with a plain sentence (not a folder, other files in it); never show an empty one. */
export function folderProblemLine(e: unknown): string {
  return sentence(e) || "The folder didn't change. Check the path and try again.";
}

export function deleteFailedLine(e: unknown): string {
  return sentence(e) || "That didn't finish. Try again in a moment.";
}
