// The review fields for one draft inside the bulk list: the same fields, help lines and Numbers rows as Add a story's
// review step (AddAStoryReview), laid out to sit inside a card. AddAStoryReview keeps its own copy of this markup, so a
// change to the fields there needs the same change here.
import { useState, type Dispatch, type SetStateAction } from "react";
import { FIELD_HELP } from "./fieldHelp";
import Numbers, { type NumberRow } from "./Numbers";
import type { ReviewFields } from "./parseDraft";

interface Props {
  /** Makes the ids unique when several reviews exist on one page. */
  idPrefix: string;
  fields: ReviewFields;
  rows: NumberRow[];
  dropped: string[];
  onFields: (patch: Partial<ReviewFields>) => void;
  onRows: (rows: NumberRow[]) => void;
}

const TEXT: { key: "headline" | "context" | "approach" | "action" | "ownership" | "result"; label: string; help: string }[] = [
  { key: "headline", label: "Headline", help: FIELD_HELP.headline },
  { key: "context", label: "What was going on", help: FIELD_HELP.context },
  { key: "approach", label: "What you noticed and decided", help: FIELD_HELP.approach },
  { key: "action", label: "What you did", help: FIELD_HELP.action },
  { key: "ownership", label: "What you owned", help: FIELD_HELP.ownership },
  { key: "result", label: "What changed", help: FIELD_HELP.result },
];

export default function BulkReviewFields({ idPrefix, fields, rows, dropped, onFields, onRows }: Props) {
  const [custom, setCustom] = useState("");
  const setRows: Dispatch<SetStateAction<NumberRow[]>> = (u) => onRows(typeof u === "function" ? u(rows) : u);
  const addTheme = (t: string) => {
    const v = t.trim();
    if (v && !fields.goodFor.some((g) => g.toLowerCase() === v.toLowerCase())) onFields({ goodFor: [...fields.goodFor, v] });
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", borderTop: "1px solid var(--e-line)", paddingTop: "16px" }}>
      {dropped.length > 0 && (
        <div className="e-soft" role="status" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ fontSize: "14px", fontWeight: "600" }}>Left out because it is not in your text</span>
          {dropped.map((d) => (
            <span key={d} className="e-meta">{d}</span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
        <div className="e-field" style={{ flex: "1 1 260px", minWidth: "0" }}>
          <label htmlFor={`${idPrefix}-t`}>Title</label>
          <span className="e-meta">{FIELD_HELP.title}</span>
          <input id={`${idPrefix}-t`} className="e-input" value={fields.title} onChange={(e) => onFields({ title: e.target.value })} />
        </div>
        <div className="e-field" style={{ flex: "1 1 260px", minWidth: "0" }}>
          <label htmlFor={`${idPrefix}-c`}>Company</label>
          <span className="e-meta">{FIELD_HELP.company}</span>
          <input id={`${idPrefix}-c`} className="e-input" value={fields.company} onChange={(e) => onFields({ company: e.target.value })} />
        </div>
      </div>
      {TEXT.map((f) => (
        <div key={f.key} className="e-field">
          <label htmlFor={`${idPrefix}-${f.key}`}>{f.label}</label>
          <span className="e-meta">{f.help}</span>
          <textarea id={`${idPrefix}-${f.key}`} className="e-input" rows={2} value={fields[f.key]} onChange={(e) => onFields({ [f.key]: e.target.value })} />
        </div>
      ))}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <span className="e-h3">Numbers</span>
        <span className="e-meta">{FIELD_HELP.numbers}</span>
        <Numbers rows={rows} setRows={setRows} />
        <span className="e-small">Tick each once you're sure it's right. Ensayo will flag it if you ever say a different number.</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <span className="e-h3">Good for questions about</span>
        <span className="e-meta">{FIELD_HELP.goodFor}</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {fields.goodFor.map((g) => (
            <button key={g} type="button" className="e-chip e-chip-on" aria-pressed="true" title="Click to remove" onClick={() => onFields({ goodFor: fields.goodFor.filter((x) => x !== g) })}>{g}</button>
          ))}
        </div>
        <form
          style={{ display: "flex", gap: "8px", maxWidth: "420px" }}
          onSubmit={(e) => {
            e.preventDefault();
            addTheme(custom);
            setCustom("");
          }}
        >
          <input className="e-input" aria-label="Add a theme" placeholder="Type one and press Add" value={custom} onChange={(e) => setCustom(e.target.value)} />
          <button type="submit" className="e-btn e-btn-soft e-btn-sm">Add</button>
        </form>
      </div>
    </div>
  );
}
