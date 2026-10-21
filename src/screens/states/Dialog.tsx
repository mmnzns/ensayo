import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";

/** The solid red button for the one delete action in a dialog. Red is only ever for delete. */
export const dangerButton: CSSProperties = { background: "var(--e-danger)", color: "var(--e-primary-ink)" };
/** Added to a button that cannot be pressed yet. */
export const disabledButton: CSSProperties = { opacity: 0.45, cursor: "not-allowed" };

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  title: string;
  /** Called for Esc, a click on the scrim, and every Cancel or Close button the body renders. */
  onClose: () => void;
  children: ReactNode;
  /** The buttons row. Put the safe choice first and the main action last. */
  actions?: ReactNode;
  /** When set, the body and buttons give way to this quiet confirmation line. */
  confirmed?: string | null;
  /** Card width in pixels (default 520). */
  width?: number;
}

/**
 * A modal dialog: scrim, centred card, title, body, buttons row.
 * Esc and a click on the scrim close it. Focus goes to the first control (or to the one marked data-autofocus)
 * and stays inside until it closes, then returns to where it was. No portal, so it mounts over any screen.
 */
export default function Dialog({ title, onClose, children, actions, confirmed, width = 520 }: DialogProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const card = cardRef.current;
    const before = document.activeElement as HTMLElement | null;
    const first = card?.querySelector<HTMLElement>("[data-autofocus]") ?? card?.querySelector<HTMLElement>(FOCUSABLE) ?? card;
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !card) return;
      const items = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        card.focus();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstItem || active === card)) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && active === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      before?.focus?.();
    };
  }, []);

  // When the quiet confirmation replaces the buttons, keep focus inside the dialog.
  useEffect(() => {
    if (confirmed) cardRef.current?.focus();
  }, [confirmed]);

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeRef.current();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        boxSizing: "border-box",
        background: "color-mix(in srgb, var(--e-ink) 45%, transparent)",
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className="e-card"
        style={{
          width: "100%",
          maxWidth: `${width}px`,
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          padding: "32px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          outline: "none",
          color: "var(--e-ink)",
          boxShadow: "0 24px 64px color-mix(in srgb, var(--e-ink) 28%, transparent)",
        }}
      >
        <h2 id={titleId} className="e-h2">
          {title}
        </h2>
        {confirmed ? (
          <div role="status" id={bodyId} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 0 4px" }}>
            <span style={{ width: "28px", height: "28px", borderRadius: "50%", background: "var(--e-ok-tint)", color: "var(--e-ok)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </span>
            <span className="e-body">{confirmed}</span>
          </div>
        ) : (
          <>
            <div id={bodyId} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {children}
            </div>
            {actions ? <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "12px", marginTop: "4px" }}>{actions}</div> : null}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The quiet confirmation every confirm button uses: show a short line in the dialog, then call `onDone` (usually "go back").
 * `confirm(message)` can be called once; later calls are ignored.
 */
export function useQuietConfirm(onDone: () => void, delayMs = 1100) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const confirm = useCallback(
    (text: string) => {
      if (timer.current !== undefined) return;
      setMessage(text);
      timer.current = window.setTimeout(() => doneRef.current(), delayMs);
    },
    [delayMs],
  );
  return { message, confirm };
}
