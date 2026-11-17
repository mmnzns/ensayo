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
