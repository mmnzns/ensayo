import { nothingMatches } from "../screens/search";

/** The one search box at the top of a list. */
export default function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="search" className="e-input" aria-label="Search" placeholder="Search" value={value} onChange={(e) => onChange(e.target.value)} style={{ maxWidth: "320px", minHeight: "44px" }} />;
}

/** What a list says when the search (with the chips) leaves nothing. */
export function NoMatch({ query, onClear, style }: { query: string; onClear: () => void; style?: React.CSSProperties }) {
  return (
    <span className="e-meta" role="status" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", ...style }}>
      {nothingMatches(query)}
      <button type="button" className="e-btn e-btn-line e-btn-sm" onClick={onClear}>Clear</button>
    </span>
  );
}
