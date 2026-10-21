import type { Dispatch, SetStateAction } from "react";

export interface NumberRow {
  id: string;
  label: string;
  value: string;
  checked: boolean;
  /** Added by the user on this screen: label and value are typed in. */
  isNew?: boolean;
}

/** The numbers list with a Checked toggle per row and "+ Add a number", shared by the review and story screens. */
export default function Numbers({ rows, setRows, onEdit, lastBorder }: { rows: NumberRow[]; setRows: Dispatch<SetStateAction<NumberRow[]>>; onEdit?: () => void; lastBorder?: boolean }) {
  const patch = (id: string, p: Partial<NumberRow>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
    onEdit?.();
  };
  return (
    <>
      {rows.map((r, i) => (
        <div key={r.id} className="e-rowline" style={{ padding: "12px 0", ...(!lastBorder && i === rows.length - 1 ? { borderBottom: "none" } : {}) }}>
          {r.isNew ? (
            <>
              <input className="e-input" style={{ flex: "1" }} aria-label="What the number is" placeholder="What it measures" value={r.label} onChange={(e) => patch(r.id, { label: e.target.value })} />
              <input className="e-input" style={{ width: "120px" }} aria-label="The number" placeholder="31% → 44%" value={r.value} onChange={(e) => patch(r.id, { value: e.target.value })} />
            </>
          ) : (
            <>
              <span style={{ flex: "1" }}>{r.label}</span>
              <span className="e-meta" style={{ width: "120px" }}>{r.value}</span>
            </>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
            <input type="checkbox" className="e-check" checked={r.checked} onChange={(e) => patch(r.id, { checked: e.target.checked })} />
            Checked
          </label>
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
