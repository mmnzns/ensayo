import { useState } from "react";
import { useStore } from "../../data/store";
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import Wordmark from "../../ui/Wordmark";
import { clock, ListenButton, stageWithKind } from "./speak";
import type { MockDebriefData } from "../../data/screens/results";
import { useDebrief } from "./useDebrief";

export default function SessionResultsMockDebrief() {
  const state = useDebrief();
  const { screens } = useStore();
  if (state.status === "loading" || state.status === "empty") {
    return (
      <FocusShell>
        <div className="e-wrap">
          <section className="e-card" style={{ padding: "40px", display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start" }}>
            <span className="e-h2">{state.status === "loading" ? "Opening your mock…" : "Nothing to show here yet"}</span>
            {state.status === "empty" && <span className="e-meta">Once you have answered a question in a Mock, the notes show up here.</span>}
            <Link to="2-1-home" className="e-btn e-btn-primary">Back home</Link>
          </section>
        </div>
      </FocusShell>
    );
  }
  if (state.status === "demo") return <Debrief d={screens.results.debrief} />;
  const notice = state.judging ? "Reading how your own questions landed…" : state.judgeError;
  return <Debrief d={state.debrief.data} notice={notice} />;
}

function Debrief({ d, notice = null }: { d: MockDebriefData; notice?: string | null }) {
  const { applications } = useStore();
  const app = applications.find((a) => a.id === d.applicationId);
  const stageText = stageWithKind(d.stageLabel, app?.startup);
  // Flags the user has kept ("Two weeks is right now") for this visit only.
  const [kept, setKept] = useState<string[]>([]);
  const openFlags = d.flags.filter((f) => !kept.includes(f.id));
  const mismatch = openFlags.length;
  return (
    <FocusShell>
      <div className="e-wrap">
        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <span className="e-brand" style={{ padding: "0" }} aria-label="Ensayo">
              <Wordmark size={24} />
            </span>
            <span className="e-pill" style={{ background: "var(--e-ink)", color: "var(--e-surface)", fontWeight: "600" }} title="A whole stage straight through, notes at the end">Mock</span>
            <span className="e-pill">{[app?.company, stageText, `${d.durationMinutes} min`].filter(Boolean).join(" · ")}</span>
          </div>
          <Link to="2-1-home" className="e-btn e-btn-white e-btn-sm">Done</Link>
        </header>
        <section className="e-card" style={{ padding: "36px", display: "flex", flexWrap: "wrap", gap: "32px", alignItems: "center" }}>
          <div style={{ flex: "1 1 360px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <span className="e-label">How it went</span>
            <span className="e-hand" style={{ fontSize: "38px", color: "var(--e-win)" }}>
              {d.openedWithPoint.of > 0 ? `${d.openedWithPoint.count} of ${d.openedWithPoint.of} opened with the point` : "Mock finished"}
            </span>
            <span className="e-meta">{d.summary}</span>
          </div>
          <div style={{ flex: "1 1 280px", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
            <div className="e-soft" style={{ padding: "16px" }}>
              <span className="e-small">Follow-ups</span>
              <div className="e-h2">
                {d.followUps.held} of {d.followUps.of} held
              </div>
            </div>
            <div className="e-soft" style={{ padding: "16px" }}>
              <span className="e-small">Average answer</span>
              <div className="e-h2">{clock(d.averageAnswerSeconds)}</div>
            </div>
            <div className="e-soft" style={{ padding: "16px" }}>
              <span className="e-small">Numbers said</span>
              <div className="e-h2">
                {d.numbers.said} of {d.numbers.of}
              </div>
            </div>
            <div className="e-soft" style={{ padding: "16px", background: mismatch ? "var(--e-highlight)" : "var(--e-ok-tint)" }}>
              <span className="e-small">To check</span>
              <div className="e-h2">{mismatch === 0 ? "All matched" : mismatch === 1 ? "1 mismatch" : `${mismatch} mismatches`}</div>
            </div>
          </div>
        </section>
        {notice && (
          <div className="e-soft" role="status" style={{ padding: "14px 20px" }}>
            <span className="e-meta">{notice}</span>
          </div>
        )}
        {d.flags.map((f) => {
          const isKept = kept.includes(f.id);
          return (
            <section key={f.id} className="e-card" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px", boxShadow: isKept ? "inset 0 0 0 2px var(--e-ok)" : "inset 0 0 0 2px var(--e-line)" }}>
              <span className={isKept ? "e-badge e-badge-ok" : "e-badge"}>{isKept ? "Updated" : f.badge}</span>
              <span style={{ flex: "1 1 420px", fontSize: "16px", lineHeight: "1.5" }} role={isKept ? "status" : undefined}>
                {isKept ? (
                  f.keptNote
                ) : (
                  <>
                    In the {f.earlierStage} stage you said <strong>{f.earlierSaid}</strong>. Here you said <strong>{f.nowSaid}</strong>. Pick one and say it the same way every time.
                  </>
                )}
              </span>
              {!isKept && (
                <button type="button" className="e-btn e-btn-line e-btn-sm" onClick={() => setKept((k) => [...k, f.id])}>
                  {f.keepLabel}
                </button>
              )}
              <Link to="6-8-application-what-you-ve-said" className="e-btn e-btn-ghost e-btn-sm">See what you've said</Link>
            </section>
          );
        })}
        {d.mustSay.length > 0 && (
          <section className="e-card" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 20px", padding: "20px 28px" }}>
            <span className="e-h3" style={{ flex: "1 1 100%" }}>From your resume, said out loud</span>
            {d.mustSay.map((m) => (
              <span key={m.id} className={m.said ? "e-badge e-badge-ok" : "e-badge"}>
                {m.text}
                {m.said ? "" : " · not said"}
              </span>
            ))}
            <Link to="6-5-application-the-resume-you-sent" className="e-btn e-btn-ghost e-btn-sm" style={{ marginLeft: "auto" }}>See your resume</Link>
          </section>
        )}
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "0", padding: "12px 28px" }}>
          {d.rows.length === 0 && <p className="e-meta" style={{ margin: "0", padding: "22px 0" }}>No answers to show yet.</p>}
          {d.rows.map((r, i) => {
            const last = i === d.rows.length - 1;
            const hasFix = !!r.trySaying;
            const rowStyle = hasFix
              ? { alignItems: "flex-start", padding: "22px 0", background: "var(--e-ground)", margin: "0 -28px", paddingLeft: "28px", paddingRight: "28px" }
              : last
                ? { alignItems: "flex-start", padding: "22px 0", borderBottom: "none" }
                : { alignItems: "flex-start", padding: "22px 0" };
            return (
              <div key={r.id} className="e-rowline" style={rowStyle}>
                <span className="e-small" style={{ width: "28px", paddingTop: "3px" }}>{r.label}</span>
                <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: hasFix ? "8px" : "6px" }}>
                  {r.kind === "followup" ? <span className="e-meta">Follow-up · "{r.prompt}"</span> : <span className="e-h3">{r.prompt}</span>}
                  <span className="e-hand" style={{ fontSize: "21px" }}>{r.note}</span>
                  {r.trySaying && (
                    <span style={{ fontSize: "16px", lineHeight: "1.5" }}>
                      <span className="e-small">Try saying</span> {r.trySaying}
                    </span>
                  )}
                </div>
                {r.rehearse ? (
                  <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-primary e-btn-sm">Rehearse</Link>
                ) : (
                  <ListenButton text={r.listen} />
                )}
              </div>
            );
          })}
        </section>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <span className="e-meta">Next time: {d.nextTime}</span>
          <div style={{ display: "flex", gap: "12px" }}>
            <Link to="2-1-home" className="e-btn e-btn-ghost">Back home</Link>
            <Link to="2-3-start-a-session" className="e-btn e-btn-primary e-btn-big">Run it again</Link>
          </div>
        </div>
      </div>
    </FocusShell>
  );
}
