// Settings, Targets: the kinds of jobs the person is going for, how ready each one is, and the ways to add, edit,
// duplicate, archive and switch. Readiness comes from `targetReadiness`.
import { useState } from "react";
import { keptCounts, keptLine, targetReadiness } from "../../data/readiness";
import { useActions, useRepHistory } from "../../data/real";
import { withParams } from "../../data/selection";
import { useStore } from "../../data/store";
import type { SellsTo, Target } from "../../data/types";
import Link from "../../ui/Link";
import { go } from "../../ui/router";
import { TargetMarker, useTargetChoice } from "../../ui/TargetSwitcher";
import { SettingsLayout } from "./parts";

const SELLS: Record<SellsTo, string> = { b2b: "sells to businesses", b2c: "sells to consumers", both: "sells to businesses and consumers" };

function Tick({ ok }: { ok: boolean }) {
  return ok ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

export default function SettingsTargets() {
  const store = useStore();
  const { targets, stories, applications, activeTarget } = store;
  const labels = store.screens.settings.seniorityLabels;
  const reps = useRepHistory();
  const { duplicateTarget, restoreTarget } = useActions();
  const choice = useTargetChoice();
  const [problem, setProblem] = useState("");
  const live = targets.filter((t) => !t.archived);
  const archived = targets.filter((t) => t.archived);
  const input = { targets, stories, applications, reps, now: store.now() };

  const duplicate = async (t: Target) => {
    setProblem("");
    try {
      const copy = await duplicateTarget(t.id);
      go(withParams("8-3-target-editor", { target: copy.id }));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Ensayo couldn't copy that target. Try again.");
    }
  };
  const restore = async (t: Target) => {
    setProblem("");
    try {
      await restoreTarget(t.id);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Ensayo couldn't restore that target. Try again.");
    }
  };

  return (
    <SettingsLayout active="8-2-settings-targets">
      <div style={{ flex: "999 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxWidth: "560px" }}>
            <span className="e-h2">Targets</span>
            <span className="e-meta">The kinds of jobs you're going for. Each has its own pitch, questions and lead stories. Your stories, habits and history are shared.</span>
          </div>
          <Link to="8-3-target-editor" className="e-btn e-btn-primary e-btn-sm">+ Add a target</Link>
        </div>
        {(problem || choice.note) && (
          <span className="e-meta" role="status" style={{ color: "var(--e-ink)" }}>{problem || choice.note}</span>
        )}
        {live.map((t) => {
          const on = t.id === activeTarget?.id;
          const r = targetReadiness(t, input);
          return (
            <section key={t.id} className="e-card" style={{ display: "flex", flexDirection: "column", gap: "16px", ...(on ? { boxShadow: "inset 0 0 0 2px var(--e-primary)" } : {}) }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
                <TargetMarker color={t.color} size={12} />
                <span className="e-h2">{t.name}</span>
                {on && <span className="e-badge" style={{ background: "var(--e-tint)", color: "var(--e-primary-dark)" }}>Practicing now</span>}
                <span style={{ flex: "1" }} />
                {!on && <button type="button" className="e-btn e-btn-soft e-btn-sm" onClick={() => void choice.choose(t.id)}>Practice for this</button>}
                <Link to={withParams("8-3-target-editor", { target: t.id })} className="e-btn e-btn-line e-btn-sm">Edit</Link>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => void duplicate(t)}>Duplicate</button>
              </div>
              <span className="e-meta" style={{ marginTop: "-8px" }}>{[t.role, SELLS[t.sellsTo], t.industry, labels[t.seniority].toLowerCase()].filter(Boolean).join(" · ")}</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0 24px", borderTop: "1px solid var(--e-line)", paddingTop: "8px" }}>
                {r.lines.map((l) => (
                  <div key={l.id} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "8px 0" }}>
                    <span style={{ color: l.ok ? "var(--e-ok)" : "var(--e-muted)", paddingTop: "2px" }}><Tick ok={l.ok} /></span>
                    <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                      <span style={{ fontSize: "15px", fontWeight: "600" }}>{l.title}</span>
                      {l.detail && <span className="e-small">{l.detail}</span>}
                    </span>
                  </div>
                ))}
              </div>
              <span className="e-small">{r.applications.length > 0 ? `Applications: ${r.applications.join(", ")}` : "No applications yet"}</span>
            </section>
          );
        })}
        {archived.map((t) => (
          <section key={t.id} className="e-card" style={{ padding: "18px 28px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "14px" }}>
            <span className="e-label" style={{ flex: "none" }}>Archived</span>
            <TargetMarker color={t.color} />
            <span style={{ flex: "1 1 240px" }}>
              <span style={{ fontWeight: "600" }}>{t.name}</span> <span className="e-small">· {keptLine(keptCounts(t, input))}</span>
            </span>
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => void restore(t)}>Restore</button>
          </section>
        ))}
      </div>
    </SettingsLayout>
  );
}
