// The rows of Settings, Speech > Models. A plain component: it shows what it is given and says what the person pressed,
// so every state (partial, downloading here, downloading in another app, installed) can be checked without the app.
import { formatSize } from "./format";
import { deleteQuestion, hiddenCount, progressPercent, visibleRows, type ModelRow } from "./speechModels";

const ring = (color: string) => ({ width: "10px", height: "10px", borderRadius: "50%", boxShadow: `inset 0 0 0 1.5px ${color}`, flex: "none" as const });

export interface SpeechModelListProps {
  rows: ModelRow[];
  /** 0 to 1 for the download running here. */
  fraction: number;
  /** True while a download runs here, so another can't start. */
  busy: boolean;
  showAll: boolean;
  /** The model whose Delete question is open. */
  confirmId: string | null;
  onShowAll: (on: boolean) => void;
  onUse: (id: string) => void;
  onFetch: (id: string) => void;
  onCancel: () => void;
  onAskDelete: (id: string | null) => void;
  onDelete: (id: string) => void;
}

export default function SpeechModelList(p: SpeechModelListProps) {
  const shown = visibleRows(p.rows, p.showAll);
  const hidden = hiddenCount(p.rows);
  return (
    <>
      {shown.map((m, i) => {
        const have = m.canDelete;
        const percent = progressPercent(m.downloadingHere ? p.fraction : (m.fraction ?? 0));
        const asking = p.confirmId === m.id;
        return (
          <div key={m.id} className="e-rowline" style={{ padding: "12px 0", flexWrap: "wrap", ...(i === shown.length - 1 && hidden === 0 ? { borderBottom: "none" } : {}) }}>
            {m.inUse ? <span className="e-dot" aria-hidden="true" /> : <span style={ring(have ? "var(--e-muted)" : "var(--e-line)")} />}
            <span style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: "2px", ...(have ? {} : { color: "var(--e-muted)" }) }}>
              {m.name}
              <span className="e-small">{m.downloadingHere ? `Downloading, ${percent}%` : m.status}{m.note ? ` · ${m.note}` : ""}</span>
            </span>
            <span className="e-small">{formatSize(m.size_mb)}</span>
            {m.canUse && !asking && <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => p.onUse(m.id)}>Use</button>}
            {m.fetch && (
              <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={p.busy} onClick={() => p.onFetch(m.id)}>
                {m.fetch}
              </button>
            )}
            {m.downloadingHere && <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={p.onCancel}>Cancel</button>}
            {m.canDelete && !asking && <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => p.onAskDelete(m.id)}>Delete</button>}
            {asking && (
              <span role="alertdialog" aria-label={`Delete ${m.name}`} style={{ flexBasis: "100%", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <span className="e-small" style={{ color: "var(--e-ink)" }}>{deleteQuestion(m.name)}</span>
                <button type="button" className="e-btn e-btn-line e-btn-sm" onClick={() => p.onDelete(m.id)}>Delete</button>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => p.onAskDelete(null)}>Keep it</button>
              </span>
            )}
            {(m.downloadingHere || m.state === "partial" || m.elsewhere) && (
              <span className="e-bar" style={{ flexBasis: "100%" }} role="progressbar" aria-label={`Download progress for ${m.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
                <span style={{ width: `${percent}%` }} />
              </span>
            )}
          </div>
        );
      })}
      {hidden > 0 && !p.showAll && (
        <div className="e-rowline" style={{ borderBottom: "none", padding: "12px 0" }}>
          <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => p.onShowAll(true)}>Show all models</button>
          <span className="e-small">{`${hidden} more, in other sizes and languages`}</span>
        </div>
      )}
      {p.showAll && hidden > 0 && (
        <div className="e-rowline" style={{ borderBottom: "none", padding: "12px 0" }}>
          <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => p.onShowAll(false)}>Show fewer models</button>
        </div>
      )}
    </>
  );
}
