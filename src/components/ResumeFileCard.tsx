/** The card for the resume file chosen on New application: type badge, name and a Replace button. A long name is cut with
 *  an ellipsis (the full name shows on hover) and the button never shrinks, so Replace stays inside the card. */
export default function ResumeFileCard({ fileName, pages, onReplace }: { fileName: string; pages: number | null; onReplace: () => void }) {
  return (
    <div className="e-soft" style={{ display: "flex", alignItems: "center", gap: "16px", background: "var(--e-surface)", boxShadow: "inset 0 0 0 1.5px var(--e-primary)" }}>
      <span style={{ width: "44px", height: "52px", borderRadius: "8px", background: "var(--e-tint)", color: "var(--e-primary-dark)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: "11px", fontWeight: "700" }}>
        {fileName.toLowerCase().endsWith(".pdf") ? "PDF" : "DOC"}
      </span>
      <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
        <span title={fileName} style={{ fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName}</span>
        <span className="e-small">{pages ? `${pages} pages · ` : ""}read on this computer after you save</span>
      </span>
      <button type="button" className="e-btn e-btn-ghost e-btn-sm" style={{ flex: "none" }} onClick={onReplace}>Replace</button>
    </div>
  );
}
