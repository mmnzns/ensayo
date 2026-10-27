import type { Dispatch, SetStateAction } from "react";

export interface NumberRow {
  id: string;
  label: string;
  value: string;
  checked: boolean;
  /** Added by the user on this screen: label and value are typed in. */
  isNew?: boolean;
}

/** An empty row to type into, shown when there are no numbers yet so nobody has to find "+ Add a number" first. It
 * becomes a real row on the first keystroke; an empty row is never saved (proofPointsFromRows skips it). */
const BLANK: NumberRow = { id: "blank", label: "", value: "", checked: false, isNew: true };

/** The numbers list with a Checked toggle per row, an X to take a row out, and "+ Add a number", shared by the review
 * and story screens. */
export default function Numbers({ rows, setRows, onEdit, lastBorder }: { rows: NumberRow[]; setRows: Dispatch<SetStateAction<NumberRow[]>>; onEdit?: () => void; lastBorder?: boolean }) {
  const shown = rows.length > 0 ? rows : [BLANK];
  const patch = (id: string, p: Partial<NumberRow>) => {
    setRows((rs) => (rs.length === 0 && id === BLANK.id ? [{ ...BLANK, id: `new${Date.now()}`, ...p }] : rs.map((r) => (r.id === id ? { ...r, ...p } : r))));
    onEdit?.();
  };
  const remove = (id: string) => {
    setRows((rs) => rs.filter((r) => r.id !== id));
    onEdit?.();
  };
  return (
    <>
      {shown.map((r, i) => (
        <div key={r.id} className="e-rowline" style={{ padding: "12px 0", ...(!lastBorder && i === shown.length - 1 ? { borderBottom: "none" } : {}) }}>
          {r.isNew ? (
            <>
              <input className="e-input" style={{ flex: "1" }} aria-label="What the number is" placeholder="What it measures" value={r.label} onChange={(e) => patch(r.id, { label: e.target.value })} />
              <input className="e-input" style={{ width: "170px" }} aria-label="The number" placeholder="31% → 44%" value={r.value} onChange={(e) => patch(r.id, { value: e.target.value })} />
            </>
          ) : (
            <>
              <span style={{ flex: "1" }}>{r.label}</span>
              <span className="e-meta" style={{ width: "170px" }}>{r.value}</span>
            </>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
            <input type="checkbox" className="e-check" checked={r.checked} onChange={(e) => patch(r.id, { checked: e.target.checked })} />
            Checked
          </label>
          {rows.length > 0 ? (
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label="Remove this number" title="Remove this number" onClick={() => remove(r.id)}>
              ×
            </button>
          ) : (
            <span aria-hidden="true" style={{ width: "32px" }} />
          )}
        </div>
      ))}
      <button
        type="button"
        className="e-btn e-btn-ghost e-btn-sm"
        style={{ alignSelf: "flex-start" }}
        onClick={() => {
          setRows((rs) => [...rs, { id: `new${Date.now()}${rs.length}`, label: "", value: "", checked: false, isNew: true }]);
          onEdit?.();
        }}
      >
        + Add a number
      </button>
    </>
  );
}
