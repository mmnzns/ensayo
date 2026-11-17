import { useId } from "react";

// The Recheck button: circling arrows and a word, in the size of a small button.

/** Two arrows going round, drawn like the app's other icons. */
export function RecheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-icon="recheck">
      <path d="M20 12a8 8 0 0 0-14-5.3L4 9" />
      <path d="M4 4v5h5" />
      <path d="M4 12a8 8 0 0 0 14 5.3L20 15" />
      <path d="M20 20v-5h-5" />
    </svg>
  );
}

export function RecheckButton({ busy, disabled, onClick }: { busy: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={busy || disabled} onClick={onClick}>
      <RecheckIcon />
      {busy ? "Rechecking" : "Recheck"}
    </button>
  );
}

/** The same button in the shape of the status pill, for the application header. */
export function RecheckPill({ busy, disabled, title, onClick }: { busy: boolean; disabled?: boolean; title?: string; onClick: () => void }) {
  const off = busy || disabled;
  return (
    <button
      type="button"
      className="e-pill"
      title={title}
      disabled={off}
      style={{ border: "none", font: "inherit", fontSize: "13px", fontWeight: "600", cursor: off ? "default" : "pointer", background: "var(--e-ground)", color: "var(--e-ink)", opacity: disabled && !busy ? 0.6 : 1 }}
      onClick={onClick}
    >
      {busy ? "Rechecking" : "Recheck"} <RecheckIcon size={12} />
    </button>
  );
}

/** Keep my edits (the default) or use the new reading, for the next recheck. Only worth showing when there are edits. */
export function RecheckChoice({ replace, disabled, onChange }: { replace: boolean; disabled?: boolean; onChange: (replace: boolean) => void }) {
  const name = useId();
  return (
    <span role="radiogroup" aria-label="What Recheck does with your edits" style={{ display: "inline-flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
      <label className="e-small" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
        <input type="radio" name={name} checked={!replace} disabled={disabled} onChange={() => onChange(false)} />
        Keep my edits
      </label>
      <label className="e-small" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
        <input type="radio" name={name} checked={replace} disabled={disabled} onChange={() => onChange(true)} />
        Use the new reading
      </label>
      {replace && <span className="e-meta">Replaces what you edited in this overview. Your own questions stay.</span>}
    </span>
  );
}
