// The result screen shared by attempts 1, 2 and 3 (3-4, 3-5, 3-8). Each screen file passes its attempt and the few layout choices the design makes.
import { useEffect, useState } from "react";
import { clock, type DetailRow, type PracticeAttempt, type TranscriptLine } from "../../data/screens/practice";
import { useStore } from "../../data/store";
import { keepAfterRestart, labelCriteria, listenToRep, savedLabels, markWrong, nextLiveQuestion, startOverAfterRestart, stopListening, tryAgain, useLive } from "../../practice/live";
import FocusShell from "../../ui/FocusShell";
import { go } from "../../ui/router";
import { Kbd, SessionHeader } from "./parts";
import { ASK, FOLLOW_UP, MAX_ATTEMPTS, nextAttempt, nextQuestion, RECORD, setAttempt } from "./practiceFlow";
import { hush, speak } from "./speak";
import { usePractice } from "./usePractice";
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

type Labels = Record<string, "pass" | "fail">;

/** The user's own pass or fail for one row ("Label this rep", for the eval set). */
function LabelChips({ id, labels, set }: { id: string; labels: Labels; set: (id: string, v: "pass" | "fail" | undefined) => void }) {
  const chip = (v: "pass" | "fail") => (
    <button type="button" className={labels[id] === v ? "e-chip e-chip-on" : "e-chip"} aria-pressed={labels[id] === v} style={{ minHeight: "28px", padding: "0 10px", fontSize: "13px" }} onClick={() => set(id, labels[id] === v ? undefined : v)}>
      {v === "pass" ? "Pass" : "Fail"}
    </button>
  );
  return <span style={{ display: "flex", gap: "6px" }}>{chip("pass")}{chip("fail")}</span>;
}

function DetailsRowView({ row, label }: { row: DetailRow; label?: { labels: Labels; set: (id: string, v: "pass" | "fail" | undefined) => void } }) {
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
      {label && row.id && <LabelChips id={row.id} labels={label.labels} set={label.set} />}
    </div>
  );
}

function DetailsCard({ details, onHide, labeling }: { details: PracticeAttempt["details"]; onHide: () => void; labeling?: { on: boolean; toggle: () => void; labels: Labels; set: (id: string, v: "pass" | "fail" | undefined) => void; save: () => void; saved: boolean } }) {
  return (
    <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingBottom: "8px" }}>
        <span className="e-h3">Details</span>
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {labeling && <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-expanded={labeling.on} onClick={labeling.toggle}>{labeling.on ? "Done labelling" : "Label this rep"}</button>}
          <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-expanded="true" onClick={onHide}>Hide</button>
        </span>
      </div>
      {labeling?.on && <p className="e-small" style={{ margin: "0 0 6px" }}>Mark each row the way you would judge it. This is how Ensayo learns how often it agrees with you.</p>}
      <div style={{ display: "grid", gridTemplateColumns: labeling?.on ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))", columnGap: "40px" }}>
        {details.rows.map((row) => (
          <DetailsRowView key={row.label} row={row} label={labeling?.on ? { labels: labeling.labels, set: labeling.set } : undefined} />
        ))}
      </div>
      {labeling?.on && (
        <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingTop: "8px" }}>
          <button type="button" className="e-btn e-btn-soft e-btn-sm" onClick={labeling.save}>Save labels</button>
          {labeling.saved && <span className="e-small" role="status">Saved</span>}
        </div>
      )}
      {details.footnote && <p className="e-small" style={{ margin: "8px 0 0" }}>{details.footnote}</p>}
    </section>
  );
}

export default function Result({ index, detailsStartOpen, detailsInAside, handSize, showKeyHint }: ResultOptions) {
  const { attempts } = useStore().screens.practice;
  const { live, session, question, endTo, onEnd } = usePractice();
  const state = useLive();
  const attempt = live ? state.attempts[state.attempt - 1] : attempts[index];
  const [open, setOpen] = useState(detailsStartOpen);
  const [mockWrong, setMockWrong] = useState(false);
  const [noAudio, setNoAudio] = useState(false);
  const wrong = live ? state.noteWrong : mockWrong;
  const [labelOn, setLabelOn] = useState(false);
  const [labels, setLabels] = useState<Labels>({});
  const [labelsSaved, setLabelsSaved] = useState(false);
  const repKey = live ? `${state.sessionId}/${state.attempt}` : "";
  useEffect(() => {
    setLabelOn(false);
    setLabelsSaved(false);
    setLabels({});
    if (live) void savedLabels().then(setLabels);
  }, [repKey, live]);
  const setLabel = (id: string, v: "pass" | "fail" | undefined) => {
    setLabelsSaved(false);
    setLabels((cur) => {
      const { [id]: _gone, ...rest } = cur;
      return v ? { ...rest, [id]: v } : rest;
    });
  };

  // Keep the chain in step with the screen the user is looking at, so Again always means "one more than this".
  const number = attempt?.number ?? index + 1;
  useEffect(() => {
    if (!live) setAttempt(number);
    return () => {
      hush();
      stopListening();
    };
  }, [number, live]);

  const wins = attempt?.wins ?? [];
  const everythingWorked = wins.length > 0;
  const lastAttempt = number >= MAX_ATTEMPTS;
  // Follow-ups are built in M6; a live session does not offer them yet.
  const canFollowUp = number >= 2 && !everythingWorked && !live;

  const again = () => {
    if (live) tryAgain();
    else nextAttempt();
    go(RECORD);
  };
  const next = () => {
    if (!live) return go(nextQuestion());
    if (nextLiveQuestion() === "done") go(endTo);
    else go(ASK);
  };
  const followUp = live ? next : () => go(FOLLOW_UP);
  const end = () => {
    onEnd?.();
    go(endTo);
  };
  const listen = () => {
    if (live) return void listenToRep().then((ok) => setNoAudio(!ok));
    return attempt && speak(attempt.transcript.map((l) => (typeof l.text === "string" ? l.text : l.text.map((p) => p.text).join(""))).join(" "));
  };
  const sayIt = () => attempt?.trySaying && speak(attempt.trySaying);

  // Enter does whatever the big button does.
  const primary = everythingWorked ? followUp : lastAttempt ? next : again;
  useKeys({ enter: primary, n: next, l: listen, esc: end });

  if (!attempt) {
    return (
      <FocusShell>
        <div className="e-wrap">
          <SessionHeader session={session} endTo={endTo} onEnd={onEnd} />
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
    <button type="button" className="e-small" style={wrongButton} onClick={() => (live ? void markWrong(true) : setMockWrong(true))}>That note was wrong</button>
  );

  return (
    <FocusShell>
      <div className="e-wrap">
        <SessionHeader session={session} endTo={endTo} onEnd={onEnd} />
        {live && state.notice && (
          <div className="e-soft" role="status">
            <span className="e-meta" style={{ color: "var(--e-ink)" }}>{state.notice}</span>
          </div>
        )}
        {live && state.restartOffered && (
          <div className="e-soft" role="alert" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
            <span className="e-meta" style={{ flex: "1 1 320px", color: "var(--e-ink)" }}>It sounds like you started again partway through. Start this answer again?</span>
            <button type="button" className="e-btn e-btn-soft e-btn-sm" onClick={() => void startOverAfterRestart().then(() => go(RECORD))}>Start again</button>
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => void keepAfterRestart()}>Keep it, count from the restart</button>
          </div>
        )}
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
                  {live ? (
                    <button type="button" className="e-btn e-btn-primary e-btn-big" onClick={next}>Next question →</button>
                  ) : (
                    <>
                      <button type="button" className="e-btn e-btn-primary e-btn-big" onClick={followUp}>Take a follow-up</button>
                      <button type="button" className="e-btn e-btn-ghost" onClick={next}>Next question →</button>
                    </>
                  )}
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
            {live && noAudio && <p className="e-small" role="status" style={{ margin: "0 0 8px" }}>The audio is no longer on this computer. The words are still here.</p>}
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
        {open && (
          <DetailsCard
            details={attempt.details}
            onHide={() => setOpen(false)}
            labeling={live ? { on: labelOn, toggle: () => setLabelOn((o) => !o), labels, set: setLabel, save: () => void labelCriteria(labels).then(() => setLabelsSaved(true)), saved: labelsSaved } : undefined}
          />
        )}
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
