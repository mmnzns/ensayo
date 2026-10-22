import type { CSSProperties, ReactNode } from "react";
import type { PracticeSession } from "../../data/screens/practice";
import Link from "../../ui/Link";
import Wordmark from "../../ui/Wordmark";
import { END_SESSION } from "./practiceFlow";

const MODE_TITLE: Record<PracticeSession["mode"], string> = {
  Drill: "A note after every answer, then try again",
  Mock: "Like a real call: no notes until the end",
};

/** "2 of 5" as a width. */
const progress = (s: PracticeSession) => `${s.total > 0 ? Math.min(100, Math.round((s.position / s.total) * 100)) : 0}%`;

/** The top bar on every practice screen: wordmark, mode, stage and position, progress, then End session (or a recording badge). */
export function SessionHeader({
  session,
  right = "end",
  endTo = END_SESSION,
  onEnd,
  showModeNote = false,
}: {
  session: PracticeSession;
  right?: "end" | ReactNode;
  endTo?: string;
  /** Runs when End session is clicked (the live loop stops a recording and clears itself). */
  onEnd?: () => void;
  showModeNote?: boolean;
}) {
  return (
    <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <span className="e-brand" style={{ padding: "0" }} aria-label="Ensayo">
          <Wordmark size={24} />
        </span>
        <span className="e-pill" style={{ background: "var(--e-tint)", color: "var(--e-primary-dark)", fontWeight: "600" }} title={MODE_TITLE[session.mode]}>
          {session.mode}
        </span>
        {showModeNote && <span className="e-small">{session.modeNote}</span>}
        <span className="e-pill">
          {session.stage} · {session.position} of {session.total}
        </span>
      </div>
      <div className="e-bar" style={{ flex: "1 1 200px", maxWidth: "280px" }} aria-label={`Session progress, ${session.position} of ${session.total}`}>
        <span style={{ width: progress(session) }} />
      </div>
      {right === "end" ? (
        <Link to={endTo} onClick={onEnd} className="e-btn e-btn-white e-btn-sm">
          End session
        </Link>
      ) : (
        right
      )}
    </header>
  );
}

/** "Hear it again" under a question. */
export function HearItAgain({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={onClick}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5L6 9H2v6h4l5 4V5z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      </svg>
      Hear it again
    </button>
  );
}

const tint = (pct: number) => `color-mix(in srgb, var(--e-primary) ${pct}%, transparent)`;

/** The pulsing-shape stand-in for the interviewer: three rings. */
export function Presence({ size }: { size: 140 | 120 }) {
  const mid = size === 140 ? 104 : 88;
  const core = size === 140 ? 64 : 54;
  const ring = (d: number, pct: number, child?: ReactNode): ReactNode => (
    <div style={{ width: `${d}px`, height: `${d}px`, borderRadius: "50%", background: tint(pct), display: "flex", alignItems: "center", justifyContent: "center" }}>{child}</div>
  );
  return (
    <div aria-hidden="true" style={{ width: `${size}px`, height: `${size}px`, borderRadius: "50%", background: tint(8), display: "flex", alignItems: "center", justifyContent: "center" }}>
      {ring(mid, 14, <div style={{ width: `${core}px`, height: `${core}px`, borderRadius: "50%", background: "var(--e-primary)" }} />)}
    </div>
  );
}

const bigButton = (size: number, bg: string, shadow: string): CSSProperties => ({
  width: `${size}px`,
  height: `${size}px`,
  borderRadius: "50%",
  background: bg,
  color: "var(--e-primary-ink)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "none",
  padding: 0,
  cursor: "pointer",
  boxShadow: shadow,
});

export const startShadow = `0 8px 24px ${tint(28)}`;

/** The big round "start answering" control: a link to a screen, or a button with an action. */
export function MicButton({ size = 96, to, onClick }: { size?: 96 | 88; to?: string; onClick?: () => void }) {
  const icon = (
    <svg width={size === 96 ? 36 : 32} height={size === 96 ? 36 : 32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
  const style = bigButton(size, "var(--e-primary)", startShadow);
  if (to) {
    return (
      <Link to={to} aria-label="Start answering" style={style}>
        {icon}
      </Link>
    );
  }
  return (
    <button type="button" aria-label="Start answering" style={style} onClick={onClick}>
      {icon}
    </button>
  );
}

/** Lines under the screen for keyboard hints, as the design shows them. */
export const Kbd = ({ children }: { children: ReactNode }) => <span className="e-kbd">{children}</span>;
