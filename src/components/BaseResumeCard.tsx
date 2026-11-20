/** The attached base resume on a target: type badge, name, and Replace / Remove. A long name is cut with an ellipsis
 *  (the full name shows on hover), the buttons never shrink, and the row wraps so the buttons drop to a second line
 *  when the column is narrow. */
export default function BaseResumeCard({ fileName, onReplace, onRemove }: { fileName: string; onReplace: () => void; onRemove: () => void }) {
  return (
    <div className="e-soft" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 14px", padding: "14px 16px", background: "var(--e-ground)" }}>
      <span style={{ width: 36, height: 44, borderRadius: 7, background: "var(--e-tint)", color: "var(--e-primary-dark)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: 10, fontWeight: 700 }}>
        {fileName.toLowerCase().endsWith(".pdf") ? "PDF" : "DOC"}
      </span>
      <span style={{ flex: "1 1 200px", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
        <span title={fileName} style={{ fontWeight: "600", fontSize: "15px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName}</span>
        <span className="e-small">your master for this kind of job</span>
      </span>
      <span style={{ display: "flex", gap: "8px", flex: "none" }}>
        <button type="button" className="e-btn e-btn-ghost e-btn-sm" style={{ flex: "none" }} onClick={onReplace}>Replace</button>
        <button type="button" className="e-btn e-btn-ghost e-btn-sm" style={{ flex: "none" }} onClick={onRemove}>Remove</button>
      </span>
    </div>
  );
}
