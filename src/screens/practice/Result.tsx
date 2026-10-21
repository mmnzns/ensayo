// The result screen shared by attempts 1, 2 and 3 (3-4, 3-5, 3-8). Each screen file passes its attempt and the few layout choices the design makes.
import { useEffect, useState } from "react";
import { clock, type DetailRow, type PracticeAttempt, type TranscriptLine } from "../../data/screens/practice";
import { useStore } from "../../data/store";
import FocusShell from "../../ui/FocusShell";
import { go } from "../../ui/router";
import { Kbd, SessionHeader } from "./parts";
import { END_SESSION, FOLLOW_UP, MAX_ATTEMPTS, nextAttempt, nextQuestion, RECORD, setAttempt } from "./practiceFlow";
import { hush, speak } from "./speak";
import { useKeys } from "./useKeys";

export interface ResultOptions {
  /** 0 for attempt 1. */
  index: number;
  detailsStartOpen: boolean;
  /** Details toggle sits in the transcript card (3-5, 3-8) instead of a header on the Details card (3-4). */
  detailsInAside: boolean;
  handSize: number;
  showKeyHint: boolean;
}

const wrongButton = { background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--e-muted)", textDecoration: "underline", fontFamily: "inherit" } as const;

function TranscriptLineView({ line, last }: { line: TranscriptLine; last: boolean }) {
  const parts = typeof line.text === "string" ? [{ text: line.text }] : line.text;
  const circled = parts.some((p) => "circle" in p && p.circle);
  const style = {
    ...(line.tone === "muted" ? { color: "var(--e-muted)" } : {}),
    ...(circled ? { lineHeight: "1.8" } : {}),
    ...(last && line.tone !== "highlight" ? { borderBottom: "none" } : {}),
  };
  return (
    <p className={line.tone === "highlight" ? "e-line-p e-hl" : "e-line-p"} style={style}>
      {parts.map((p, i) => ("circle" in p && p.circle ? <span key={i} className="e-circle">{p.text}</span> : p.text))}
    </p>
  );
}

function DetailsRowView({ row }: { row: DetailRow }) {
  const mark =
    row.state === "yes" ? (
      <span style={{ color: "var(--e-primary)", width: "18px", textAlign: "center" }} aria-label="Yes">✓</span>
    ) : row.state === "notyet" ? (
      <span style={{ color: "var(--e-muted)", width: "18px", textAlign: "center" }} aria-label="Not yet">●</span>
    ) : (
      <span style={{ color: "var(--e-muted)", width: "18px", textAlign: "center" }} aria-hidden="true">·</span>
    );
  return (
    <div className="e-rowline" style={{ padding: "12px 0" }}>
      {mark}
      <span style={{ flex: "1" }}>{row.label}</span>
      <span className="e-small">{row.note}</span>
    </div>
  );
}

function DetailsCard({ details, onHide }: { details: PracticeAttempt["details"]; onHide: () => void }) {
  return (
    <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingBottom: "8px" }}>
        <span className="e-h3">Details</span>
        <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-expanded="true" onClick={onHide}>Hide</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: "40px" }}>
        {details.rows.map((row) => (
          <DetailsRowView key={row.label} row={row} />
        ))}
      </div>
      {details.footnote && <p className="e-small" style={{ margin: "8px 0 0" }}>{details.footnote}</p>}
    </section>
  );
}

export default function Result({ index, detailsStartOpen, detailsInAside, handSize, showKeyHint }: ResultOptions) {
  const { session, question, attempts } = useStore().screens.practice;
  const attempt = attempts[index];
  const [open, setOpen] = useState(detailsStartOpen);
  const [wrong, setWrong] = useState(false);

  // Keep the chain in step with the screen the user is looking at, so Again always means "one more than this".
  const number = attempt?.number ?? index + 1;
  useEffect(() => {
    setAttempt(number);
    return hush;
  }, [number]);

  const wins = attempt?.wins ?? [];
  const everythingWorked = wins.length > 0;
  const lastAttempt = number >= MAX_ATTEMPTS;
  const canFollowUp = number >= 2 && !everythingWorked;

  const again = () => {
    nextAttempt();
    go(RECORD);
  };
  const next = () => go(nextQuestion());
  const followUp = () => go(FOLLOW_UP);
  const listen = () => attempt && speak(attempt.transcript.map((l) => (typeof l.text === "string" ? l.text : l.text.map((p) => p.text).join(""))).join(" "));
  const sayIt = () => attempt?.trySaying && speak(attempt.trySaying);

  // Enter does whatever the big button does.
  const primary = everythingWorked ? followUp : lastAttempt ? next : again;
  useKeys({ enter: primary, n: next, l: listen, esc: () => go(END_SESSION) });

  if (!attempt) {
    return (
      <FocusShell>
        <div className="e-wrap">
          <SessionHeader session={session} />
          <p className="e-meta">Nothing to show for this answer yet.</p>
        </div>
      </FocusShell>
    );
  }

  const delta = attempt.delta;
  const deltaText = delta ? (delta.fromSeconds != null && delta.toSeconds != null ? `${delta.label} · ${delta.fromSeconds}s → ${delta.toSeconds}s` : delta.label) : "";
  const lastLine = attempt.transcript.length - 1;

  const wrongLink = wrong ? (
    <span className="e-small" role="status">Thanks, noted</span>
  ) : (
    <button type="button" className="e-small" style={wrongButton} onClick={() => setWrong(true)}>That note was wrong</button>
  );

  return (
    <FocusShell>
      <div className="e-wrap">
        <SessionHeader session={session} />
        <section style={{ display: "flex", gap: "18px", alignItems: "center" }}>
          <div className="e-presence" aria-hidden="true">
            <span />
          </div>
          <h1 className="e-h1" style={{ fontSize: "28px", fontWeight: "600", maxWidth: "860px" }}>{question}</h1>
        </section>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "stretch" }}>
          <section className="e-card" style={{ flex: "999 1 560px", minWidth: "0", padding: "36px", display: "flex", flexDirection: "column", gap: "24px" }}>
            {delta ? (
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <span className="e-meta">Attempt {number} of {MAX_ATTEMPTS}</span>
                {delta.caption ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
                    <span className="e-win" style={{ fontSize: "21px" }}>{deltaText}</span>
                    <span className="e-small">{delta.caption}</span>
                  </div>
                ) : (
                  <span className="e-win" style={{ fontSize: "21px" }}>{deltaText}</span>
                )}
              </div>
            ) : (
              <span className="e-meta">Attempt {number} of {MAX_ATTEMPTS}</span>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span className="e-label">Coach's note</span>
              <p className="e-hand" style={{ margin: "0", fontSize: `${handSize}px` }}>{attempt.coachNote}</p>
            </div>
            {attempt.trySaying && (
              <div className="e-soft" style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
                <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <span className="e-label">Try saying</span>
                  <p style={{ margin: "0", fontSize: "20px", lineHeight: "1.5" }}>"{attempt.trySaying}"</p>
                </div>
                <button type="button" aria-label="Hear this line" onClick={sayIt} style={{ flex: "none", width: "48px", height: "48px", borderRadius: "50%", border: "none", background: "var(--e-surface)", color: "var(--e-pen)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M7 4l13 8-13 8z" />
                  </svg>
                </button>
              </div>
            )}
            {everythingWorked && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                {wins.map((w) => (
                  <span key={w} className="e-pill" style={{ background: "var(--e-ok-tint)", color: "var(--e-ok)", fontWeight: "600" }}>{w}</span>
                ))}
              </div>
            )}
            {attempt.closing && <p className="e-meta" style={{ margin: "0" }}>{attempt.closing}</p>}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", marginTop: "auto" }}>
              {everythingWorked ? (
                <>
                  <button type="button" className="e-btn e-btn-primary e-btn-big" onClick={followUp}>Take a follow-up</button>
                  <button type="button" className="e-btn e-btn-ghost" onClick={next}>Next question →</button>
                </>
              ) : lastAttempt ? (
                <>
                  <button type="button" className="e-btn e-btn-primary e-btn-big" onClick={next}>Next question →</button>
                  {canFollowUp && <button type="button" className="e-btn e-btn-soft" onClick={followUp}>They have a follow-up</button>}
                </>
              ) : (
                <>
                  <button type="button" className="e-btn e-btn-primary e-btn-big" onClick={again}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 12a9 9 0 1 0 3-6.7" />
                      <path d="M3 4v5h5" />
                    </svg>
                    Again
                  </button>
                  {canFollowUp && <button type="button" className="e-btn e-btn-soft" onClick={followUp}>They have a follow-up</button>}
                  <button type="button" className="e-btn e-btn-ghost" onClick={next}>Next question →</button>
                </>
              )}
            </div>
          </section>
          <aside className="e-card" style={{ flex: "1 1 320px", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingBottom: "8px" }}>
              <span style={{ fontSize: "15px", fontWeight: "600" }}>
                Your answer <span style={{ color: "var(--e-muted)", fontWeight: "400" }}>· {clock(attempt.durationSeconds)}</span>
              </span>
              <button type="button" className="e-btn e-btn-soft e-btn-sm" onClick={listen}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
                  <path d="M21 15a2 2 0 0 1-2 2h-1v-5h3z" />
                  <path d="M3 15a2 2 0 0 0 2 2h1v-5H3z" />
                </svg>
                Listen
              </button>
            </div>
            {attempt.transcript.map((line, i) => (
              <TranscriptLineView key={i} line={line} last={i === lastLine} />
            ))}
            {attempt.highlightCaption && <p className="e-small" style={{ margin: "8px 0 0" }}>{attempt.highlightCaption}</p>}
            {detailsInAside ? (
              <div style={{ marginTop: "auto", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "10px", borderTop: "1px solid var(--e-line)", paddingTop: "12px" }}>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" style={{ paddingLeft: "0" }} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                  {open ? "Hide details" : "Details ›"}
                </button>
                {wrongLink}
              </div>
            ) : (
              <div style={{ marginTop: "auto", paddingTop: "12px", display: "flex" }}>{wrongLink}</div>
            )}
          </aside>
        </div>
        {open && <DetailsCard details={attempt.details} onHide={() => setOpen(false)} />}
        {!open && !detailsInAside && (
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <span className="e-h3">Details</span>
              <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-expanded="false" onClick={() => setOpen(true)}>Show</button>
            </div>
          </section>
        )}
        {showKeyHint && (
          <p className="e-small" style={{ margin: "0" }}>
            <Kbd>Enter</Kbd> again · <Kbd>N</Kbd> next · <Kbd>L</Kbd> listen · <Kbd>Esc</Kbd> end
          </p>
        )}
      </div>
    </FocusShell>
  );
}
