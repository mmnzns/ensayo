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
