// Practice, recording. Draft from Design/screens/html/3-2-practice-recording.html. The timer and level bars are live; no audio.
import { useEffect, useRef, useState } from "react";
import { clock } from "../../data/screens/practice";
import { useStore } from "../../data/store";
import { useLive, beginRecording, getLive, micLost, MIC_LOST, recordAgainAfterLoss, recordingScreenShown, recordingStatus, restartRecording, retryFinish, SCORE_LOST_MIN_MS, setRecordingPaused, stopAndFinish } from "../../practice/live";
import { LIMIT_STOPPED, LIMIT_WARNING, limitState } from "../../practice/limit";
import { SILENCE_START, silenceStep, silenceStop } from "../../practice/silence";
import { readPrefs } from "../settings/prefs";
import FocusShell from "../../ui/FocusShell";
import { go } from "../../ui/router";
import { ASK, THINK } from "./practiceFlow";
import { Kbd, SessionHeader } from "./parts";
import { usePractice } from "./usePractice";
import { useKeys } from "./useKeys";
import EndSessionDialog from "./EndSessionDialog";
import { atStake, escDecision } from "./endSession";

const reduceMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The bars' height change: smooth, or instant when the system asks for reduced motion. */
export const barTransition = (reduce: boolean): string => (reduce ? "none" : "height 130ms ease-out");

/** Bars that move like a voice level. Heights breathe around the resting shape from the data. */
function LevelBars({ bars, level }: { bars: number[]; level?: number }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (reduceMotion()) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 130);
    return () => window.clearInterval(id);
  }, []);
  const last = bars.length - 1;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px", height: "96px" }} aria-label="Your voice level">
      {bars.map((h, i) => {
        const wave = 0.65 + 0.35 * Math.sin(tick * 0.9 + i * 1.3);
        const height = Math.max(8, Math.min(100, h * wave * (level === undefined ? 1 : Math.max(0.15, Math.min(1, level * 3)))));
        const opacity = [0.5, 0.6, 0.7][i] ?? ([0.8, 0.6, 0.5][i - (last - 2)] ?? 1);
        return <span key={i} style={{ width: "6px", height: `${height}%`, borderRadius: "3px", background: "var(--e-primary)", opacity, transition: barTransition(reduceMotion()) }} />;
      })}
    </div>
  );
}

/** "30 seconds left" from 3:30 on, in a Drill and in a Mock (a Mock hides the clock, but the limit is the same). */
export function LimitNotice({ seconds }: { seconds: number }) {
  if (limitState(seconds) === "ok") return null;
  return (
    <span role="status" aria-live="polite" style={{ fontSize: "15px", fontWeight: "600", color: "var(--e-warn-ink)" }}>{LIMIT_WARNING}</span>
  );
}

export default function PracticeRecording() {
  const { timerMaxSeconds, levelBars } = useStore().screens.practice;
  const { live, session, question, targetSeconds, endTo, onEnd } = usePractice();
  const { mode, phase, micName, lostMs } = useLive();
  const lost = live && phase === "mic_lost";
  // Mock is like the real call, so no clock. In a Drill the clock follows "Show the timer in Drill" in Settings.
  const [showTimer] = useState(() => readPrefs().practice.timer);
  const noClock = live && (mode === "mock" || !showTimer);
  const silence = useRef(SILENCE_START);
  const stopRef = useRef<() => void>(() => {});
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const max = live ? Math.max(timerMaxSeconds, targetSeconds.to + 30) : timerMaxSeconds;

  // A live session starts the microphone when the screen opens, shows its real level, and stops itself at the hard cap.
  useEffect(() => {
    if (!live) return;
    const left = recordingScreenShown();
    if (getLive().phase !== "recording") void beginRecording();
    const autoStop = readPrefs().practice.autoStop;
    silence.current = SILENCE_START;
    const id = window.setInterval(
      () =>
        void recordingStatus().then((st) => {
          if (st?.failed && getLive().phase === "recording") {
            void micLost();
            return;
          }
          const l = st?.level ?? 0;
          setLevel(pausedRef.current ? 0 : l);
          // The clock and the limit count recorded time, which the recorder keeps: paused time is not in it.
          if (st) setSeconds(Math.floor(st.elapsed_ms / 1000));
          if (st?.paused !== undefined && st.paused !== pausedRef.current) {
            pausedRef.current = st.paused;
            setPaused(st.paused);
          }
          if (!autoStop || pausedRef.current) return;
          silence.current = silenceStep(silence.current, l, 130);
          if (silenceStop(silence.current)) stopRef.current();
        }),
      130,
    );
    return () => {
      window.clearInterval(id);
      left();
    };
  }, [live]);

  // The microphone didn't start (on Windows, a blocked microphone fails here): back to the question, which says
  // why and offers Try again, instead of a clock ticking over nothing.
  useEffect(() => {
    if (live && phase === "error") go(ASK);
  }, [live, phase]);

  // The preview has no recorder: it counts up from 0:00 while the screen is mounted and not paused.
  useEffect(() => {
    if (live) return;
    const id = window.setInterval(() => {
      if (!pausedRef.current) setSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [live]);

  const stop = (why?: string) => {
    if (lost) return;
    if (live) void stopAndFinish(why ?? null);
    go(THINK);
  };
  const togglePause = () => {
    if (lost) return;
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    silence.current = SILENCE_START;
    if (live) void setRecordingPaused(next);
  };
  stopRef.current = () => stop();
  const end = () => {
    onEnd?.();
    go(endTo);
  };
  const startOver = () => {
    setSeconds(0);
    pausedRef.current = false;
    setPaused(false);
    silence.current = SILENCE_START;
    if (live) void restartRecording();
  };
  // At 4:00 of recorded time it stops, says why on the next screen, and scores the answer.
  useEffect(() => {
    if (limitState(seconds) === "stop") stop(LIMIT_STOPPED);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);
  const [asking, setAsking] = useState(false);
  const onEsc = () => (escDecision(atStake("recording", live)) === "ask" ? setAsking(true) : end());
  useKeys({ space: () => stop(), p: togglePause, esc: onEsc });

  const pct = (n: number) => `${Math.min(100, (n / max) * 100)}%`;
  const dot = (
    <span className="e-pill" style={{ gap: "8px" }}>
      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--e-primary)" }} />
      {lost ? "Stopped" : paused ? "Paused" : "Recording"}
    </span>
  );

  return (
    <FocusShell>
      <div className="e-wrap" style={{ width: "100%" }}>
        <SessionHeader session={session} right={dot} endTo={endTo} onEnd={onEnd} />
      </div>
      <div style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "40px", textAlign: "center", padding: "32px 0" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center", maxWidth: "820px" }}>
          <span className="e-label">You're answering</span>
          <p style={{ margin: "0", fontSize: "22px", fontWeight: "600", lineHeight: "1.35", color: "var(--e-muted)" }}>{question}</p>
        </div>
        {lost ? (
          <div role="alert" className="e-card" style={{ display: "flex", flexDirection: "column", gap: "14px", alignItems: "center", maxWidth: "520px", padding: "28px" }}>
            <span style={{ fontSize: "18px", fontWeight: "600" }}>{MIC_LOST}</span>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
              {lostMs > SCORE_LOST_MIN_MS && (
                <button type="button" className="e-btn e-btn-soft" onClick={() => { void retryFinish(); go(THINK); }}>Score what I said</button>
              )}
              <button type="button" className="e-btn e-btn-primary" onClick={() => void recordAgainAfterLoss()}>Record again</button>
            </div>
            {lostMs > 0 && <span className="e-small">Ensayo kept the {clock(Math.round(lostMs / 1000))} you said before it stopped.</span>}
          </div>
        ) : (
          <LevelBars bars={levelBars} level={live ? level : undefined} />
        )}
        <div style={{ display: lost ? "none" : "flex", flexDirection: "column", alignItems: "center", gap: "12px", width: "100%", maxWidth: "420px" }}>
          {/* A Mock is like the real call: no clock and no target while you talk (the four minute cap still stops it). */}
          {!noClock && <span style={{ fontSize: "44px", fontWeight: "600", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{clock(seconds)}</span>}
          {live && micName && <span className="e-small" data-testid="mic-name">{micName}</span>}
          <LimitNotice seconds={seconds} />
          <div style={{ position: "relative", width: "100%", height: "8px", borderRadius: "999px", background: "var(--e-line)", display: noClock ? "none" : undefined }} aria-label={`${seconds} seconds, target ${targetSeconds.from} to ${targetSeconds.to}`}>
            <span style={{ position: "absolute", left: "0", top: "0", height: "8px", width: pct(seconds), borderRadius: "999px", background: "var(--e-primary)" }} />{" "}
            <span style={{ position: "absolute", left: pct(targetSeconds.from), top: "-4px", width: pct(targetSeconds.to - targetSeconds.from), height: "16px", borderRadius: "6px", boxShadow: "inset 0 0 0 2px var(--e-win)" }} />
          </div>
          <div style={{ display: noClock ? "none" : "flex", justifyContent: "space-between", width: "100%" }}>
            <span className="e-small">{clock(0)}</span>
            <span className="e-small">target {clock(targetSeconds.from)} to {clock(targetSeconds.to)}</span>
            <span className="e-small">{clock(max)}</span>
          </div>
        </div>
        <div style={{ display: lost ? "none" : "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <button type="button" aria-label="Stop answering" onClick={() => stop()} style={{ width: "96px", height: "96px", borderRadius: "50%", background: "var(--e-ink)", color: "var(--e-surface)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(43,39,34,0.22)", border: "none", padding: 0, cursor: "pointer" }}>
            <span style={{ width: "30px", height: "30px", borderRadius: "6px", background: "var(--e-surface)" }} />
          </button>
          <span className="e-meta">
            Press <Kbd>Space</Kbd> when you're done
          </span>
          <button type="button" className="e-btn e-btn-soft e-btn-sm" aria-pressed={paused} onClick={togglePause}>{paused ? "Resume" : "Pause"}</button>
          <span className="e-small">or press <Kbd>P</Kbd></span>
        </div>
      </div>
      <div className="e-wrap" style={{ width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span className="e-small">Pauses are fine. Take a second to find the word.</span>
          <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={startOver}>Start over</button>
        </div>
      </div>
      {asking && <EndSessionDialog stake="recording" onEnd={end} onKeep={() => setAsking(false)} />}
    </FocusShell>
  );
}
