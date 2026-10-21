// Small pure helpers for the Settings, Progress and Feedback screens.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-21" to "Oct 21". Read by hand so the result never depends on the time zone. */
export function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[Number(m[2]) - 1] ?? ""} ${Number(m[3])}`;
}

/** 575 to "575 MB", 2400 to "2.4 GB". */
export function formatSize(mb: number): string {
  if (mb >= 1000) return `${(Math.round(mb / 100) / 10).toString()} GB`;
  return `${mb} MB`;
}

/** 41 to "41 cents", 130 to "$1.30". */
export function formatCents(cents: number): string {
  return cents < 100 ? `${cents} cent${cents === 1 ? "" : "s"}` : `$${(cents / 100).toFixed(2)}`;
}

/** The habit labels are written for "I" (Settings chips); Progress speaks to "you". */
export function youLabel(label: string): string {
  return label.replace(/\bmy\b/g, "your").replace(/\bI\b/g, "you");
}

/** Share of a list that passed, 0 to 1 (0 for an empty list). */
export function passRate(results: boolean[]): number {
  const last = results.slice(-10);
  return last.length === 0 ? 0 : last.filter(Boolean).length / last.length;
}
