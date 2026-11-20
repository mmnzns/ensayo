// The rows of Settings, Speech > Models. A plain component: it shows what it is given and says what the person pressed,
// so every state (partial, downloading here, downloading in another app, installed) can be checked without the app.
import { formatSize } from "./format";
import Dialog from "../states/Dialog";
import { Ratings } from "./RatingDots";
import { deleteQuestion, removeQuestion, hiddenCount, progressPercent, visibleRows, type ModelRow } from "./speechModels";

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
  /** The model whose "Remove from this computer" question is open. */
  removeId?: string | null;
  onAskRemove?: (id: string | null) => void;
  onRemove?: (id: string) => void;
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
          <div key={m.id} className="e-rowline" aria-disabled={m.too_small_here || undefined} style={{ padding: "12px 0", flexWrap: "wrap", ...(m.too_small_here ? { opacity: 0.55 } : {}), ...(i === shown.length - 1 && hidden === 0 ? { borderBottom: "none" } : {}) }}>
            {m.inUse ? <span className="e-dot" aria-hidden="true" /> : <span style={ring(have ? "var(--e-muted)" : "var(--e-line)")} />}
            <span style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: "2px", ...(have ? {} : { color: "var(--e-muted)" }) }}>
              {m.name}
              <span className="e-small">{m.downloadingHere ? `Downloading, ${percent}%` : m.status}{m.note ? ` · ${m.note}` : ""}</span>
              {m.ratings ? <Ratings speed={m.ratings.speed} accuracy={m.ratings.accuracy} where={m.speedWhere} /> : null}
              {m.about ? <span className="e-small">{m.about}</span> : null}
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
            {m.canDelete && !asking && p.onAskRemove && (
              <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => p.onAskRemove?.(m.id)}>Remove from this computer</button>
            )}
            {p.removeId === m.id && p.onAskRemove && (
              <Dialog
                title="Remove from this computer?"
                onClose={() => p.onAskRemove?.(null)}
                actions={
                  <>
                    <button type="button" className="e-btn e-btn-line" onClick={() => p.onAskRemove?.(null)}>Keep it</button>
                    <button type="button" className="e-btn e-btn-line" onClick={() => p.onRemove?.(m.id)}>Remove</button>
                  </>
                }
              >
                <p className="e-body" style={{ margin: 0 }}>{removeQuestion(m.name, m.size_mb)}</p>
              </Dialog>
            )}
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
