// A percent sign is added to a number only when it is not already there. The AI read can store "about 40%" with the
// unit "%", and stories saved that way must still show "about 40%", not "about 40%%".

/** "40" gives "40%", "about 40%" stays "about 40%". */
export function withPercent(v: string): string {
  const t = v.trim();
  return t.endsWith("%") ? t : `${t}%`;
}

/** "about 40%" gives "about 40"; what a stored number should hold when its unit is "%". */
export function stripPercent(v: string): string {
  return v.trim().replace(/\s*%+$/, "").trim();
}
