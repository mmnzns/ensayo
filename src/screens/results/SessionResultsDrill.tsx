import { habitStatus, useStore } from "../../data/store";
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import Wordmark from "../../ui/Wordmark";
import { playRep } from "../../practice/live";
import type { SessionResults } from "../../practice/results";
import { clock, ListenButton, speak, stopSpeaking } from "./speak";
import { useResults } from "./useResults";
import { useEffect, useState } from "react";
import DeleteSession from "./DeleteSession";

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const word = (n: number) => WORDS[n] ?? String(n);
const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** "Tell me about a time you improved a metric..." from a full question. */
function shorten(q: string, max = 44): string {
  const bare = q.replace(/[.?]+$/, "");
  if (bare.length <= max) return q;
  const cut = bare.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 1))}...`;
}

/** Listen on the best answer: the saved recording when it is still on this computer, else the words read aloud. */
function ListenBest({ from, text }: { from?: { sessionId: string; n: number }; text: string }) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => stopSpeaking(), []);
  if (!from) return <ListenButton text={text} className="e-btn e-btn-soft e-btn-sm" style={{ alignSelf: "flex-start", marginTop: "auto" }} />;
  const toggle = async () => {
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    if (await playRep(from.sessionId, from.n)) return;
    if (!speak(text, () => setPlaying(false))) setPlaying(false);
  };
  return (
    <button type="button" className="e-btn e-btn-soft e-btn-sm" style={{ alignSelf: "flex-start", marginTop: "auto" }} onClick={() => void toggle()} aria-pressed={playing}>
      {playing ? "Stop" : "Listen"}
    </button>
  );
}

export default function SessionResultsDrill() {
  const state = useResults();
  if (state.status === "loading" || state.status === "empty") {
    return (
      <FocusShell>
        <div className="e-wrap">
          <section className="e-card" style={{ padding: "40px", display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start" }}>
            <span className="e-h2">{state.status === "loading" ? "Opening your session…" : "Nothing to show here yet"}</span>
            {state.status === "empty" && <span className="e-meta">Once you have answered a question, what it said shows up here.</span>}
            <Link to="2-1-home" className="e-btn e-btn-primary">Back home</Link>
          </section>
        </div>
      </FocusShell>
    );
  }
  return <DrillResults results={state.results} />;
}

function DrillResults({ results }: { results: SessionResults }) {
  const { applications, habits, engine, streak } = useStore();
  const d = results.drill;
  const g = results.graduation;
  const flags = d.kind === "flags";
  const app = applications.find((a) => a.id === d.applicationId);
  const habitLabel = (id: string) => habits.find((h) => h.id === id)?.label ?? "";
  const graduatedStatus = g ? habitStatus(g.results) : null;
  const n = d.questions.length;
  const firstAvg = Math.round(avg(d.questions.map((q) => q.firstTry)));
  const bestAvg = Math.round(avg(d.questions.map((q) => q.bestTry)));
  const pct = (sec: number) => round1((Math.min(sec, d.chartMaxSeconds) / d.chartMaxSeconds) * 100);
  const targetFrac = d.targetSeconds / d.chartMaxSeconds;
  const mid = d.chartMaxSeconds / 2;
  const best = d.bestAnswer;
  const next = d.nextTime;
  const cost = engine.kind === "local" || d.totals.costCents < 1 ? "" : ` · about ${d.totals.costCents} cents with ${engine.label}`;
  const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
  const focusLabel = habitLabel(d.focusHabitId);
  const heroLabel = d.focusHabitId === "to_the_point" ? "Time to your point" : d.focusHabitId === "clean_stop" ? "Time after your number" : focusLabel;
  const gotFirst = d.questions.filter((q) => q.firstTry > 0).length;
  const gotBest = d.questions.filter((q) => q.bestTry > 0).length;
  const chartLabel = `Seconds to your point per question, first try then best try: ${d.questions.map((q, i) => `Q${i + 1} ${q.firstTry} to ${q.bestTry}`).join(", ")}. Target under ${d.targetSeconds} seconds.`;
  return (
    <FocusShell>
      <div className="e-wrap">
        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <span className="e-brand" style={{ padding: "0" }} aria-label="Ensayo">
              <Wordmark size={24} />
            </span>
            <span className="e-pill">{["Drill", d.stageLabel, app?.company].filter(Boolean).join(" · ")}</span>
          </div>
          <Link to="2-1-home" className="e-btn e-btn-white e-btn-sm">Done</Link>
        </header>
        {g && graduatedStatus?.graduated && (
          <Link to="4-5-habit-graduation" className="e-soft" style={{ display: "flex", alignItems: "center", gap: "14px", textDecoration: "none", color: "var(--e-ink)", background: "var(--e-glow)", padding: "16px 22px" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--e-win)" }}>
              <path d="M12 15l-4 6 1-5-4-3 5-1 2-5 2 5 5 1-4 3 1 5z" />
            </svg>
            <span style={{ flex: "1", fontSize: "16px" }}>
              <strong>A habit just stuck.</strong> {habitLabel(g.habitId)} passed {graduatedStatus.passes} of your last {graduatedStatus.of}.
            </span>
            <span style={{ fontWeight: "600", color: "var(--e-win)" }}>See it ›</span>
          </Link>
        )}
        <section className="e-card" style={{ padding: "40px", display: "flex", flexWrap: "wrap", gap: "40px", alignItems: "center" }}>
          <div style={{ flex: "1 1 340px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <span className="e-label">Your focus this session</span>
            <span className="e-h2">{heroLabel}</span>
            <span className="e-hand" style={{ fontSize: "53px", color: "var(--e-win)" }}>
              {flags ? `${gotFirst} of ${n} → ${gotBest} of ${n}` : `${firstAvg}s → ${bestAvg}s`}
            </span>
            <span className="e-meta">
              {flags ? `Questions where you had it on the first try, against your best try, across ${plural(n, "question")}.` : `Average first try against your best try, across ${plural(n, "question")}.`}
            </span>
          </div>
          {flags ? (
            <div style={{ flex: "1 1 420px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <span className="e-small">first try ○ · best try ●</span>
              {d.questions.map((q, i) => (
                <div key={q.id} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span className="e-small" style={{ width: "32px" }}>Q{i + 1}</span>
                  <span className="e-meta">{q.firstTry > 0 ? "Had it first time" : q.bestTry > 0 ? "Missed, then got it" : "Not yet"}</span>
                </div>
              ))}
            </div>
          ) : (
          <div style={{ flex: "1 1 420px", display: "flex", flexDirection: "column", gap: "12px" }} role="img" aria-label={chartLabel}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="e-small">first try ○ · best try ●</span>
              <span className="e-small">target under {d.targetSeconds}s</span>
            </div>
            <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: "14px", padding: "6px 0" }}>
              <span style={{ position: "absolute", left: "32px", top: "0", bottom: "0", width: `calc((100% - 32px) * ${round1(targetFrac * 10000) / 10000})`, background: "var(--e-tint)", borderRadius: "6px" }} />
              {d.questions.map((q, i) => (
                <div key={q.id} style={{ position: "relative", display: "flex", alignItems: "center", height: "18px" }}>
                  <span className="e-small" style={{ width: "32px" }}>Q{i + 1}</span>
                  <span style={{ position: "relative", flex: "1", height: "18px" }}>
                    <span style={{ position: "absolute", left: `${pct(Math.min(q.firstTry, q.bestTry))}%`, width: `${round1(Math.abs(pct(q.firstTry) - pct(q.bestTry)))}%`, top: "8px", height: "2px", background: "var(--e-line)" }} />
                    <span style={{ position: "absolute", left: `calc(${pct(q.firstTry)}% - 7px)`, top: "2px", width: "14px", height: "14px", borderRadius: "50%", boxShadow: "inset 0 0 0 2px var(--e-muted)", background: "var(--e-surface)" }} />
                    <span style={{ position: "absolute", left: `calc(${pct(q.bestTry)}% - 7px)`, top: "2px", width: "14px", height: "14px", borderRadius: "50%", background: "var(--e-primary)" }} />
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: "32px" }}>
              <span className="e-small">0s</span>
              <span className="e-small">{mid}s</span>
              <span className="e-small">{d.chartMaxSeconds}s</span>
            </div>
          </div>
          )}
        </section>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "20px" }}>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span className="e-label">Fixes that stuck</span>
            <span className="e-hand" style={{ fontSize: "39px" }}>
              {d.fixes.stuck} of {d.fixes.of}
            </span>
            <span className="e-meta">
              {d.fixes.of === 0 ? "Try an answer again after a note and this shows whether the fix held." : `When you tried again, the fix held ${d.fixes.stuck === 1 ? "once" : `${word(d.fixes.stuck)} times`} out of ${word(d.fixes.of)}.`}
            </span>
          </section>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <span className="e-label">Best answer</span>
            <span className="e-h3">"{shorten(best.question)}"</span>
            <span className="e-meta">
              Attempt {best.attempt}. Point at {clock(best.pointAtSeconds)}, {best.note}.
            </span>
            <ListenBest from={d.bestFrom} text={best.spoken} />
          </section>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <span className="e-label">Next time</span>
            <span className="e-h3">{habitLabel(next.habitId)}</span>
            <span className="e-meta">You kept going {next.keptGoingSeconds} seconds on average after your result. {next.advice}</span>
            <Link to="2-3-start-a-session" className="e-small" style={{ marginTop: "auto" }}>Practice just this</Link>
          </section>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <p className="e-small" style={{ margin: "0" }}>
            {plural(n, "question")} · {plural(d.totals.answers, "answer")} · {plural(d.totals.followUps, "follow-up")} handled · {plural(streak.daysInARow, "day")} in a row{cost}
          </p>
          <div style={{ display: "flex", gap: "12px" }}>
            <Link to="2-1-home" className="e-btn e-btn-ghost">Back home</Link>
            <Link to="2-3-start-a-session" className="e-btn e-btn-primary e-btn-big">Practice again</Link>
          </div>
        </div>
        <DeleteSession />
      </div>
    </FocusShell>
  );
}
