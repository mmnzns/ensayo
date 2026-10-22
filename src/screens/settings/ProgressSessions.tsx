// Draft generated from Design/screens/html/7-2-progress-sessions.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import { viewSession } from "../../practice/viewing";
import { useState } from "react";
import { useActions, useRepHistory, useTrashedSessions } from "../../data/real";
import { plainError } from "../../data/actions";
import { answersIn, deleteSessionText, keptUntil, recentlyDeletedLine, restoreHint, TRASH_NOTE, trashedTitle } from "../../data/trash";
import { whenText } from "../../practice/habits";
import { forgetSession } from "../../practice/live";
import { TrashIcon } from "../../ui/Icons";
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import { useStore } from "../../data/store";
import type { Mode } from "../../data/types";
import { applicationTarget } from "../../data/targets";
import { TargetMark } from "../applications/TargetMark";
import { filterSessionsByTarget, progressChoices, sessionTargetId } from "./progressTargets";

const quiet = { background: "none", border: "none", padding: 0, font: "inherit", fontSize: "13px", color: "var(--e-muted)", textDecoration: "underline", cursor: "pointer" } as const;

/** The end of the list while the trash has anything: "Recently deleted (2) · Restore". Restore opens what is there, a row each. */
function RecentlyDeleted() {
  const trashed = useTrashedSessions();
  const { applications } = useStore();
  const actions = useActions();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  if (trashed.length === 0) return null;
  const now = new Date();
  const companyOf = (id: string) => applications.find((a) => a.id === id)?.company;
  const restore = async (id: string) => {
    setBusy(id);
    setError("");
    try {
      await actions.restoreSession(id);
    } catch (e) {
      setError(plainError(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "10px" }} aria-label="Recently deleted">
      <span className="e-meta">
        {recentlyDeletedLine(trashed.length)} · <button type="button" style={quiet} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide" : "Restore"}</button>
      </span>
      {error && <span role="alert" className="e-small" style={{ color: "var(--e-danger)" }}>{error}</span>}
      {open && (
        <div className="e-card" style={{ padding: "4px 28px" }}>
          {trashed.map((t, i) => (
            <div key={t.id} className="e-rowline" style={i === trashed.length - 1 ? { borderBottom: "none" } : undefined}>
              <span className="e-meta" style={{ width: "120px" }}>{whenText(t.started, now)}</span>
              <span style={{ flex: "1", display: "flex", flexDirection: "column" }}>
                {trashedTitle(t, companyOf)}
                <span className="e-small">{`${t.reps} ${t.reps === 1 ? "answer" : "answers"} · ${keptUntil(t.deleted_at)}`}</span>
              </span>
              <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={busy !== null} onClick={() => void restore(t.id)}>Restore</button>
            </div>
          ))}
          <span className="e-small" style={{ display: "block", padding: "8px 0 14px" }}>{TRASH_NOTE}</span>
        </div>
      )}
    </section>
  );
}

/** The chips are one row: All clears the filters, Drill and Mock pick a mode, an application narrows to it. They combine. */
export default function ProgressSessions() {
  const { sessions, applications, targets } = useStore();
  const actions = useActions();
  const reps = useRepHistory();
  const [asking, setAsking] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [mode, setMode] = useState<Mode | null>(null);
  const [appId, setAppId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string>("all");
  const choices = progressChoices(targets, [...sessions.map((s) => sessionTargetId(s, applications, targets)), ...applications.map((a) => applicationTarget(a, targets)?.id)]);
  const chosen = choices.some((t) => t.id === targetId) ? targetId : "all";
  const withMarker = targets.filter((t) => !t.archived).length > 1;

  // Applications that have at least one session, in the order they first show up.
  const appIds = sessions.map((s) => s.applicationId).filter((id, i, all): id is string => !!id && all.indexOf(id) === i);
  const appName = (id: string) => applications.find((a) => a.id === id)?.company ?? "Application";

  const shown = filterSessionsByTarget(sessions, applications, targets, chosen).filter((s) => (!mode || s.mode === mode) && (!appId || s.applicationId === appId));
  const groups = shown.map((s) => s.group).filter((g, i, all) => all.indexOf(g) === i);
  const lastId = shown[shown.length - 1]?.id;
  const noFilter = !mode && !appId && chosen === "all";

  const removeSession = async (id: string) => {
    setDeleting(true);
    setDeleteError("");
    try {
      await actions.deleteSession(id);
      forgetSession(id);
      setAsking(null);
    } catch (e) {
      setDeleteError(plainError(e));
    } finally {
      setDeleting(false);
    }
  };

  const chip = (on: boolean) => (on ? "e-chip e-chip-on" : "e-chip");

  return (
    <AppShell nav="progress">
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px" }}>
        <h1 className="e-h1">Progress</h1>
        <div style={{ display: "flex", gap: "6px", background: "var(--e-surface)", borderRadius: "14px", padding: "4px", boxShadow: "var(--e-shadow)" }} role="tablist">
          <Link to="7-1-progress-habits" role="tab" aria-selected="false" className="e-btn e-btn-sm e-btn-ghost">Habits</Link>
          <Link to="7-2-progress-sessions" role="tab" aria-selected="true" className="e-btn e-btn-sm" style={{ background: "var(--e-tint)", color: "var(--e-ink)" }}>Sessions</Link>
        </div>
      </header>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {choices.length > 1 && (
          <select className="e-input" style={{ width: "200px", minHeight: "44px" }} aria-label="Target" value={chosen} onChange={(e) => setTargetId(e.target.value)}>
            <option value="all">All targets</option>
            {choices.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
        <button type="button" className={chip(noFilter)} aria-pressed={noFilter} onClick={() => { setMode(null); setAppId(null); setTargetId("all"); }}>All</button>
        <button type="button" className={chip(mode === "drill")} aria-pressed={mode === "drill"} onClick={() => setMode(mode === "drill" ? null : "drill")}>Drill</button>
        <button type="button" className={chip(mode === "mock")} aria-pressed={mode === "mock"} onClick={() => setMode(mode === "mock" ? null : "mock")}>Mock</button>
        {appIds.map((id) => (
          <button key={id} type="button" className={chip(appId === id)} aria-pressed={appId === id} onClick={() => setAppId(appId === id ? null : id)}>{appName(id)}</button>
        ))}
      </div>
      <span className="e-small">Drill: a note after every answer, with retries. Mock: a full stage run straight through, notes at the end.</span>
      <section className="e-card" style={{ padding: "4px 28px" }}>
        {shown.length === 0 && (
          <p className="e-meta" style={{ margin: "0", padding: "22px 0" }}>No sessions match. Pick All to see every session.</p>
        )}
        {groups.map((g, gi) => (
          <div key={g}>
            <span className="e-label" style={{ display: "block", padding: gi === 0 ? "18px 0 4px" : "22px 0 4px" }}>{g}</span>
            {shown
              .filter((s) => s.group === g)
              .map((s) => (
                <div key={s.id} style={{ display: "flex", flexDirection: "column" }}>
                <div className="e-rowline" style={{ ...(s.id === lastId && asking !== s.id ? { borderBottom: "none" } : {}), ...(asking === s.id ? { borderBottom: "none", paddingBottom: "4px" } : {}) }}>
                <Link
                  to={s.mode === "mock" ? "4-4-session-results-mock-debrief" : "4-3-session-results-drill"}
                  onClick={() => viewSession(s.id)}
                  style={{ flex: "1", display: "flex", alignItems: "center", gap: "16px", minWidth: "0", textDecoration: "none", color: "var(--e-ink)" }}
                >
                  <span className="e-meta" style={{ width: "120px" }}>{s.when}</span>
                  <span className="e-pill" style={s.mode === "mock" ? { background: "var(--e-ink)", color: "var(--e-surface)", width: "52px", justifyContent: "center" } : { background: "var(--e-ground)", width: "52px", justifyContent: "center" }}>
                    {s.mode === "mock" ? "Mock" : "Drill"}
                  </span>
                  <span style={{ flex: "1", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px" }}>
                    {s.title}
                    {withMarker && (() => {
                      const t = targets.find((x) => x.id === sessionTargetId(s, applications, targets));
                      return t ? (
                        <span className="e-small" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                          <TargetMark target={t} />
                          {t.name}
                        </span>
                      ) : null;
                    })()}
                  </span>
                  <span className="e-hand" style={{ fontSize: "17px", ...(s.headline.includes("→") ? { color: "var(--e-win)" } : {}) }}>{s.headline}</span>
                  <span className="e-small" style={{ width: "24px" }}>›</span>
                </Link>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" style={{ padding: "10px" }} aria-label={`Delete the ${s.title} session`} aria-expanded={asking === s.id} onClick={() => { setAsking(asking === s.id ? null : s.id); setDeleteError(""); }}>
                  <TrashIcon size={18} />
                </button>
                </div>
                {asking === s.id && (
                  <div className="e-soft" role="alertdialog" aria-label="Delete this session" style={{ display: "flex", flexDirection: "column", gap: "8px", margin: "4px 0 12px" }}>
                    <span className="e-meta">{deleteSessionText(answersIn(reps, s.id))}</span>
                    <span className="e-small">{restoreHint(1)}</span>
                    {deleteError && <span role="alert" className="e-small" style={{ color: "var(--e-danger)" }}>{deleteError}</span>}
                    <span style={{ display: "flex", gap: "8px" }}>
                      <button type="button" className="e-btn e-btn-danger e-btn-sm" disabled={deleting} onClick={() => void removeSession(s.id)}>Delete</button>
                      <button type="button" className="e-btn e-btn-ghost e-btn-sm" disabled={deleting} onClick={() => setAsking(null)}>Keep it</button>
                    </span>
                  </div>
                )}
                </div>
              ))}
          </div>
        ))}
      </section>
      <RecentlyDeleted />
      <span className="e-small">Recordings are kept for 30 days, then only the text stays. Change this in <Link to="8-6-settings-privacy">Settings, Privacy</Link>.</span>
    </AppShell>
  );
}
