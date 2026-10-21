/** "Wednesday, October 21". */
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const weekdayName = (d: Date) => WEEKDAYS[d.getDay()];
export const longDate = (d: Date) => `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;

/** "2:00 PM". */
export function clockTime(d: Date): string {
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

/** "Friday, 2:00 PM". */
export const dayAndTime = (d: Date) => `${weekdayName(d)}, ${clockTime(d)}`;

/** The badge on the Next interview card. */
export function inDays(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

/** How a sentence refers to the interview day ("today", "tomorrow", "Friday", "on October 30"). */
export function whenPhrase(d: Date, days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return weekdayName(d);
  return `on ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "Getting to the point" becomes "getting to the point". */
export const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/** "October 30". */
export const monthDay = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;

/** The small badge on a dated row: "Today", "Tomorrow", "Friday", or "October 30" a week or more out. */
export function dayBadge(d: Date, days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return days < 7 ? weekdayName(d) : monthDay(d);
}
