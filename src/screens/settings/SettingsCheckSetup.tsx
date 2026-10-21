// Draft generated from Design/screens/html/8-7-settings-check-setup.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import { useState } from "react";
import { useStore } from "../../data/store";
import { CheckIcon, SettingsLayout, useLater } from "./parts";

/** While "Run again" works down the list, each row is waiting, then checking, then settled on its real state. */
type Phase = "waiting" | "checking" | "done";

export default function SettingsCheckSetup() {
  const { checkSetup } = useStore().screens.settings;
  const [phases, setPhases] = useState<Record<string, Phase>>({});
  const [running, setRunning] = useState(false);
  const [help, setHelp] = useState<string | null>(null);
  const later = useLater();

  const phaseOf = (id: string): Phase => phases[id] ?? "done";

  const runAgain = () => {
    if (running) return;
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
  const summary = running
    ? "Checking…"
    : ready === checkSetup.length
      ? `${ready} of ${checkSetup.length} ready`
      : `${ready} of ${checkSetup.length} ready · you can still practice`;

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
                  {fix && (
                    <button type="button" className="e-btn e-btn-soft e-btn-sm" aria-expanded={help === c.id} onClick={() => setHelp(help === c.id ? null : c.id)}>{c.fixLabel ?? "How to fix"}</button>
                  )}
                </div>
                {fix && help === c.id && (
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
