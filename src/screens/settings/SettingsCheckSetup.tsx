// Draft generated from Design/screens/html/8-7-settings-check-setup.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isApp } from "../../data/real";
import type { SetupCheck } from "../../data/screens/settings";
import { useStore } from "../../data/store";
import { say, stopSaying } from "../../practice/voice";
import { NO_VOICE } from "../../practice/voiceEngine";
import Link from "../../ui/Link";
import { osOf } from "../first-run/setup";
import { CheckIcon, SettingsLayout, useLater } from "./parts";
import { readPrefs } from "./prefs";
import { checkers, summaryLine } from "./setupChecks";

/** While "Run again" works down the list, each row is waiting, then checking, then settled on its real state. */
type Phase = "waiting" | "checking" | "done";

const VOICE_LINE = "Tell me about a time you changed your mind.";

export default function SettingsCheckSetup() {
  const sample = useStore().screens.settings.checkSetup;
  const app = isApp();
  // In the app the rows are the real checks, run one after another; in the browser preview they stay the sample.
  const plan = useRef(app ? checkers(invoke, osOf(typeof navigator === "undefined" ? "" : navigator.userAgent), readPrefs().speech.model) : []);
  const [live, setLive] = useState<SetupCheck[]>([]);
  const checkSetup: SetupCheck[] = app ? plan.current.map((c) => live.find((r) => r.id === c.id) ?? { id: c.id, label: c.label, detail: "", state: "ready" }) : sample;
  const [phases, setPhases] = useState<Record<string, Phase>>(app ? Object.fromEntries(plan.current.map((c) => [c.id, "waiting" as Phase])) : {});
  const alive = useRef(true);
  const [running, setRunning] = useState(false);
  const [help, setHelp] = useState<string | null>(null);
  const later = useLater();
  // The interviewer voice row has a manual button: nothing is spoken until you press it.
  const [playing, setPlaying] = useState(false);
  const [playNote, setPlayNote] = useState<string | null>(null);
  useEffect(() => stopSaying, []);
  const playLine = () => {
    if (playing) {
      stopSaying();
      setPlaying(false);
      return;
    }
    setPlayNote(null);
    setPlaying(true);
    const started = say(VOICE_LINE, (spoke) => {
      if (!alive.current) return;
      setPlaying(false);
      if (!spoke) setPlayNote(NO_VOICE);
    });
    if (!started) {
      setPlaying(false);
      setPlayNote(NO_VOICE);
    }
  };

  const phaseOf = (id: string): Phase => phases[id] ?? "done";

  const runLive = async () => {
    setRunning(true);
    setHelp(null);
    setPhases(Object.fromEntries(plan.current.map((c) => [c.id, "waiting" as Phase])));
    for (const c of plan.current) {
      if (!alive.current) return;
      setPhases((p) => ({ ...p, [c.id]: "checking" }));
      const result = await c.run();
      if (!alive.current) return;
      setLive((l) => [...l.filter((r) => r.id !== c.id), result]);
      setPhases((p) => ({ ...p, [c.id]: "done" }));
    }
    setRunning(false);
  };
  useEffect(() => {
    alive.current = true;
    if (app) void runLive();
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAgain = () => {
    if (running) return;
    if (app) return void runLive();
    setRunning(true);
    setHelp(null);
    setPhases(Object.fromEntries(checkSetup.map((c) => [c.id, "waiting" as Phase])));
    checkSetup.forEach((c, i) => {
      later(() => setPhases((p) => ({ ...p, [c.id]: "checking" })), i * 700);
      later(() => setPhases((p) => ({ ...p, [c.id]: "done" })), i * 700 + 650);
    });
    later(() => setRunning(false), checkSetup.length * 700);
  };

  const settled = checkSetup.filter((c) => phaseOf(c.id) === "done");
  const ready = settled.filter((c) => c.state === "ready").length;
  const summary = running ? "Checking…" : summaryLine(ready, checkSetup.length);

  return (
    <SettingsLayout active="8-7-settings-check-setup">
      <div style={{ flex: "999 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingBottom: "10px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="e-h2">Check setup</span>
              <span className="e-meta">Runs everything once, the way a real session would.</span>
            </div>
            <button type="button" className="e-btn e-btn-primary e-btn-sm" disabled={running} onClick={runAgain}>{running ? "Checking…" : "Run again"}</button>
          </div>
          {checkSetup.map((c, i) => {
            const phase = phaseOf(c.id);
            const last = i === checkSetup.length - 1;
            const fix = phase === "done" && c.state === "fix";
            return (
              <div key={c.id} style={{ display: "flex", flexDirection: "column" }}>
                <div className="e-rowline" style={{ padding: "14px 0", ...(last && help !== c.id ? { borderBottom: "none" } : {}) }}>
                  {fix ? (
                    <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "var(--e-win)", flex: "none" }} aria-hidden="true" />
                  ) : phase === "done" ? (
                    <span className="e-dot" aria-hidden="true" />
                  ) : (
                    <span style={{ width: "10px", height: "10px", borderRadius: "50%", boxShadow: `inset 0 0 0 1.5px ${phase === "checking" ? "var(--e-primary)" : "var(--e-line)"}`, flex: "none" }} aria-hidden="true" />
                  )}
                  <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                    {c.label}<span className="e-small">{c.detail}</span>
                  </span>
                  {phase === "done" && c.state === "ready" && (
                    <span className="e-meta" style={{ display: "inline-flex", gap: "6px", alignItems: "center", color: "var(--e-primary-dark)" }}>
                      <CheckIcon />
                      Ready
                    </span>
                  )}
                  {phase === "checking" && <span className="e-meta" role="status">Checking…</span>}
                  {phase === "waiting" && <span className="e-small">Waiting</span>}
                  {phase === "done" && c.id === "voice" && c.state === "ready" && app && (
                    <button type="button" className="e-btn e-btn-soft e-btn-sm" aria-pressed={playing} onClick={playLine}>{playing ? "Stop" : "Play a line"}</button>
                  )}
                  {fix && c.fixTo && <Link to={c.fixTo} className="e-btn e-btn-soft e-btn-sm">{c.fixLabel ?? "How to fix"}</Link>}
                  {fix && !c.fixTo && (
                    <button type="button" className="e-btn e-btn-soft e-btn-sm" aria-expanded={help === c.id} onClick={() => setHelp(help === c.id ? null : c.id)}>{c.fixLabel ?? "How to fix"}</button>
                  )}
                </div>
                {c.id === "voice" && playNote && (
                  <p className="e-meta" role="status" style={{ margin: "0", padding: "0 0 14px 26px" }}>{playNote}</p>
                )}
                {fix && !c.fixTo && help === c.id && (
                  <p className="e-meta" style={{ margin: "0", padding: "0 0 14px 26px" }}>{c.fixHelp}</p>
                )}
              </div>
            );
          })}
        </section>
        <span className="e-hand" style={{ fontSize: "18px" }}>{summary}</span>
      </div>
    </SettingsLayout>
  );
}
