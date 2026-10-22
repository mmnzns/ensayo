// The Feedback screen's email: one pure function builds the subject, the body and the mailto link, so
// "Send by email" and "Copy message" always carry the same text.

export const FEEDBACK_ADDRESS = "miguel@mnmonzones.com";

export interface FeedbackInput {
  topic: string;
  message: string;
  /** "No", "Maybe", "Yes", or null when the optional question was skipped. */
  pay: string | null;
  /** The "what feels fair" answer; only used with Maybe or Yes. */
  fair: string | null;
  email: string;
  /** The "Include diagnostics" tick. Off by default: nothing about the computer is sent unless it is on. */
  includeDiagnostics: boolean;
  /** The diagnostics block (Settings › About › Copy diagnostics); only added when includeDiagnostics is true. */
  diagnostics: string;
}

/** The line that opens the diagnostics in the email, so the reader knows where the block came from. */
export const DIAGNOSTICS_HEADING = "Diagnostics (from Settings › About)";

export interface FeedbackEmail {
  to: string;
  subject: string;
  body: string;
  mailto: string;
}

export function buildFeedbackEmail(input: FeedbackInput): FeedbackEmail {
  const topic = input.topic.trim() || "Something else";
  const subject = `Ensayo feedback: ${topic}`;
  const lines: string[] = [input.message.trim()];
  const extra: string[] = [];
  if (input.pay) {
    const fair = (input.pay === "Maybe" || input.pay === "Yes") && input.fair ? ` (fair, one time: ${input.fair})` : "";
    extra.push(`Would I pay: ${input.pay}${fair}`);
  }
  if (input.email.trim()) extra.push(`Reply to: ${input.email.trim()}`);
  if (extra.length) lines.push("", ...extra);
  if (input.includeDiagnostics && input.diagnostics.trim()) lines.push("", DIAGNOSTICS_HEADING, input.diagnostics.trim());
  const body = lines.join("\n");
  const mailto = `mailto:${FEEDBACK_ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { to: FEEDBACK_ADDRESS, subject, body, mailto };
}

/** "macOS", "Windows" or "your system", read from the browser's user agent. */
export function describeSystem(userAgent: string): string {
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(userAgent)) return "macOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "an unknown system";
}

/** Windows and some email apps drop an email link past about two thousand characters. */
export const MAILTO_LIMIT = 1900;

const CUT_NOTE = "\n\n[Cut short to fit. Press Copy message in Ensayo for the whole of it.]";

/** The email link, shortened when the message is too long for one. `cut` says the start of it was kept. */
export function fitMailto(email: FeedbackEmail): { mailto: string; cut: boolean } {
  if (email.mailto.length <= MAILTO_LIMIT) return { mailto: email.mailto, cut: false };
  const head = `mailto:${email.to}?subject=${encodeURIComponent(email.subject)}&body=`;
  const room = MAILTO_LIMIT - head.length - encodeURIComponent(CUT_NOTE).length;
  // Cut the text, not the encoded form, so a character is never split in half.
  const chars = Array.from(email.body);
  let keep = chars.length;
  let encoded = encodeURIComponent(chars.join(""));
  while (encoded.length > room && keep > 0) {
    keep = Math.max(0, Math.min(keep - 1, Math.floor((keep * room) / encoded.length)));
    encoded = encodeURIComponent(chars.slice(0, keep).join(""));
  }
  return { mailto: head + encoded + encodeURIComponent(CUT_NOTE), cut: true };
}
