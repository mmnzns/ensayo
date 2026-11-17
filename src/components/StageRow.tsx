import type { ReactNode } from "react";
import type { StageId } from "../data/types";
import { STAGE_LABEL } from "../screens/applications/format";

const arrow = { minHeight: "20px", padding: "0 6px", fontSize: "11px", lineHeight: 1 } as const;
const field = { minHeight: "40px", padding: "8px", fontSize: "14px", minWidth: 0, width: "auto" } as const;

/** The name a stage added to a list gets. The first of a kind keeps its plain name; a second is "Technical 2", a third
 *  "Technical 3". Two technical rounds are normal, and every stage has its own id, so the name is what tells them apart. */
export function uniqueStageLabel(stage: StageId, existing: string[]): string {
  const base = STAGE_LABEL[stage];
  const taken = new Set(existing.map((l) => l.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

/** One interview stage in a narrow card. Line one: the reorder arrows and the name. Line two: date, time and remove, in
 *  a row that is the same on every stage, so the boxes line up down the card. Nothing has a fixed width wider than the
 *  card: the boxes share what is left and the row wraps only when the card is very narrow. */
export default function StageRow({ name, label, date, time, onDate, onTime, onUp, onDown, onRemove, last, note }: { name: ReactNode; label: string; date: string; time: string; onDate: (v: string) => void; onTime: (v: string) => void; onUp: (() => void) | null; onDown: (() => void) | null; onRemove: () => void; last?: boolean; note?: ReactNode }) {
  return (
    <div className="e-rowline" style={{ flexDirection: "column", alignItems: "stretch", gap: "8px", padding: "12px 0", minWidth: 0, ...(last ? { borderBottom: "none" } : {}) }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
        <span style={{ display: "flex", flexDirection: "column", flex: "none" }}>
          <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label={`Move ${label} up`} disabled={!onUp} onClick={() => onUp?.()} style={arrow}>▲</button>
          <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label={`Move ${label} down`} disabled={!onDown} onClick={() => onDown?.()} style={arrow}>▼</button>
        </span>
        <span style={{ flex: "1", minWidth: 0, display: "flex" }}>{name}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}>
        <input type="date" className="e-input" style={{ ...field, flex: "1 1 118px" }} value={date} aria-label={`${label} date`} onChange={(e) => onDate(e.target.value)} />
        <input type="time" className="e-input" style={{ ...field, flex: "1 1 104px" }} value={time} aria-label={`${label} time`} onChange={(e) => onTime(e.target.value)} />
        <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label={`Remove ${label}`} style={{ minHeight: "40px", padding: "8px", flex: "none" }} onClick={onRemove}>✕</button>
      </div>
      {note}
    </div>
  );
}
