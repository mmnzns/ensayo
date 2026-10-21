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
  includeSystem: boolean;
  /** "Ensayo 0.1.0 · macOS" and so on; only added when includeSystem is true. */
  system: string;
}

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
  if (input.includeSystem && input.system.trim()) extra.push(input.system.trim());
  if (extra.length) lines.push("", ...extra);
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
