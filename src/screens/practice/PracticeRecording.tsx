// Practice, recording. Draft from Design/screens/html/3-2-practice-recording.html. The timer and level bars are live; no audio.
import { useEffect, useState } from "react";
import { clock } from "../../data/screens/practice";
import { useStore } from "../../data/store";
import FocusShell from "../../ui/FocusShell";
import { go } from "../../ui/router";
import { END_SESSION, THINK } from "./practiceFlow";
import { Kbd, SessionHeader } from "./parts";
import { useKeys } from "./useKeys";

const reduceMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Bars that move like a voice level. Heights breathe around the resting shape from the data. */
function LevelBars({ bars }: { bars: number[] }) {
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
        const height = Math.max(8, Math.min(100, h * wave));
        const opacity = [0.5, 0.6, 0.7][i] ?? ([0.8, 0.6, 0.5][i - (last - 2)] ?? 1);
        return <span key={i} style={{ width: "6px", height: `${height}%`, borderRadius: "3px", background: "var(--e-primary)", opacity, transition: "height 130ms ease-out" }} />;
      })}
    </div>
  );
}

export default function PracticeRecording() {
  const { session, question, targetSeconds, timerMaxSeconds, levelBars } = useStore().screens.practice;
  const [seconds, setSeconds] = useState(0);

  // Count up from 0:00 while the screen is mounted.
  useEffect(() => {
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const stop = () => go(THINK);
  useKeys({ space: stop, esc: () => go(END_SESSION) });

  const pct = (n: number) => `${Math.min(100, (n / timerMaxSeconds) * 100)}%`;
  const dot = (
    <span className="e-pill" style={{ gap: "8px" }}>
      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--e-primary)" }} />
      Recording
    </span>
  );

  return (
    <FocusShell>
      <div className="e-wrap" style={{ width: "100%" }}>
        <SessionHeader session={session} right={dot} />
      </div>
      <div style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "40px", textAlign: "center", padding: "32px 0" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center", maxWidth: "820px" }}>
          <span className="e-label">You're answering</span>
          <p style={{ margin: "0", fontSize: "22px", fontWeight: "600", lineHeight: "1.35", color: "var(--e-muted)" }}>{question}</p>
        </div>
        <LevelBars bars={levelBars} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", width: "100%", maxWidth: "420px" }}>
          <span style={{ fontSize: "44px", fontWeight: "600", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{clock(seconds)}</span>
          <div style={{ position: "relative", width: "100%", height: "8px", borderRadius: "999px", background: "var(--e-line)" }} aria-label={`${seconds} seconds, target ${targetSeconds.from} to ${targetSeconds.to}`}>
            <span style={{ position: "absolute", left: "0", top: "0", height: "8px", width: pct(seconds), borderRadius: "999px", background: "var(--e-primary)" }} />{" "}
            <span style={{ position: "absolute", left: pct(targetSeconds.from), top: "-4px", width: pct(targetSeconds.to - targetSeconds.from), height: "16px", borderRadius: "6px", boxShadow: "inset 0 0 0 2px var(--e-win)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
            <span className="e-small">{clock(0)}</span>
            <span className="e-small">target {clock(targetSeconds.from)} to {clock(targetSeconds.to)}</span>
            <span className="e-small">{clock(timerMaxSeconds)}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <button type="button" aria-label="Stop answering" onClick={stop} style={{ width: "96px", height: "96px", borderRadius: "50%", background: "var(--e-ink)", color: "var(--e-surface)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(43,39,34,0.22)", border: "none", padding: 0, cursor: "pointer" }}>
            <span style={{ width: "30px", height: "30px", borderRadius: "6px", background: "var(--e-surface)" }} />
          </button>
          <span className="e-meta">
            Press <Kbd>Space</Kbd> when you're done
          </span>
        </div>
      </div>
      <div className="e-wrap" style={{ width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span className="e-small">Pauses are fine. Take a second to find the word.</span>
          <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setSeconds(0)}>Start over</button>
        </div>
      </div>
    </FocusShell>
  );
}
