// What the full coach says about one answer: the verdict, what worked, the one thing to work on, how this try compares to
// the last one, and a folded "More". Shown on the Result screen in place of the plain coach's note.
import { useState, type ReactNode } from "react";
import type { CoachVerdict, SmartCoachReply } from "../../practice/types";

export const VERDICT_LABEL: Record<CoachVerdict, string> = { ready: "Ready", nearly: "Nearly", not_yet: "Not yet" };

/** Calm colours: Ready is positive, Nearly neutral amber, Not yet muted. Never an alarm. */
const VERDICT_STYLE: Record<CoachVerdict, { background: string; color: string }> = {
  ready: { background: "var(--e-ok-tint)", color: "var(--e-ok)" },
  nearly: { background: "var(--e-mark)", color: "var(--e-ink)" },
  not_yet: { background: "var(--e-highlight)", color: "var(--e-muted)" },
};

export const MOVE_ON_LINE = "This one is ready. Move on.";
export const BASIC_LINE = "Basic feedback. The full coach needs a stronger model, set in Settings › AI.";
const DIRECTION_LABEL = { better: "Better", same: "Same", worse: "Worse" } as const;

const quoteStyle = { margin: "0", padding: "2px 0 2px 12px", borderLeft: "3px solid var(--e-line)", fontSize: "16px", lineHeight: "1.5", fontStyle: "italic" } as const;
const colStyle = { display: "flex", flexDirection: "column", gap: "8px" } as const;

const Quote = ({ text }: { text: string }) => <p style={quoteStyle}>“{text}”</p>;

export default function CoachFeedback({ coach, afterFix, startOpen = false }: { coach: SmartCoachReply; /** The "Try saying" block, drawn right under the fix. */ afterFix?: ReactNode; /** "More" starts unfolded. Only the tests set this; the screen starts folded. */ startOpen?: boolean }) {
  const [moreOpen, setMoreOpen] = useState(startOpen);
  const verdict = VERDICT_STYLE[coach.verdict] ?? VERDICT_STYLE.not_yet;
  const more = coach.more.slice(0, 3);
  const since = coach.since_last;
  return (
    <>
      <div style={colStyle}>
        <span className="e-pill" style={{ alignSelf: "flex-start", fontWeight: "600", fontSize: "15px", ...verdict }}>{VERDICT_LABEL[coach.verdict] ?? VERDICT_LABEL.not_yet}</span>
        <p className="e-hand" style={{ margin: "0", fontSize: "26px", lineHeight: "1.3", color: "var(--e-ink)" }}>{coach.verdict_line}</p>
      </div>
      {coach.worked.length > 0 && (
        <div style={colStyle}>
          <span className="e-label">What worked</span>
          {coach.worked.map((w, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {w.quote && <Quote text={w.quote} />}
              <span className="e-meta" style={{ color: "var(--e-ink)" }}>{w.why}</span>
            </div>
          ))}
        </div>
      )}
      {coach.fix ? (
        <div style={colStyle}>
          <span className="e-label">Work on this next</span>
          <p style={{ margin: "0", fontSize: "18px", fontWeight: "600", lineHeight: "1.4" }}>{coach.fix.what}</p>
          <p className="e-meta" style={{ margin: "0", color: "var(--e-ink)" }}>{coach.fix.why}</p>
          {coach.fix.quote && (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="e-small">Where: </span>
              <Quote text={coach.fix.quote} />
            </div>
          )}
          <p className="e-meta" style={{ margin: "0", color: "var(--e-ink)" }}>
            <strong>Next time: </strong>
            {coach.fix.do_instead}
          </p>
        </div>
      ) : (
        coach.verdict === "ready" && <p className="e-meta" style={{ margin: "0", color: "var(--e-ink)", fontWeight: "600" }}>{MOVE_ON_LINE}</p>
      )}
      {afterFix}
      {since && (
        <div style={colStyle}>
          <span className="e-label">Since your last try</span>
          <span style={{ fontWeight: "600", fontSize: "16px" }}>{DIRECTION_LABEL[since.direction] ?? since.direction}</span>
          {since.fixed.map((f, i) => (
            <p key={`f${i}`} className="e-meta" style={{ margin: "0", color: "var(--e-ink)" }}>
              <strong>Fixed: </strong>
              {f}
            </p>
          ))}
          {since.still.map((f, i) => (
            <p key={`s${i}`} className="e-meta" style={{ margin: "0", color: "var(--e-ink)" }}>
              <strong>Still there: </strong>
              {f}
            </p>
          ))}
        </div>
      )}
      {more.length > 0 && (
        <div style={colStyle}>
          <button type="button" className="e-btn e-btn-ghost e-btn-sm" style={{ alignSelf: "flex-start", paddingLeft: "0" }} aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
            {moreOpen ? "Hide more" : "More ›"}
          </button>
          {moreOpen &&
            more.map((m, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span className="e-meta" style={{ color: "var(--e-ink)" }}>{m.what}</span>
                {m.quote && <Quote text={m.quote} />}
              </div>
            ))}
        </div>
      )}
    </>
  );
}
