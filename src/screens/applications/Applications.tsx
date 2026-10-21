import { useState } from "react";
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import { applicationsByTab, nextInterview, useStore } from "../../data/store";
import type { Application } from "../../data/types";
import { CLOSED_LABEL, STAGE_LABEL, STATUS_LABEL, answersText, inDays, isThisWeek, rowWhen, shortDate, shortFileName, statusStyle, whenText, nextStage } from "./format";

const FILE_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <path d="M14 3v6h6" />
  </svg>
);

function lastDoneStage(a: Application) {
  return [...a.process].filter((s) => s.done).sort((x, y) => y.order - x.order)[0];
}

/** The "Next" column: the next stage and its date, "Waiting to hear", or how a closed one ended. */
function nextColumn(a: Application): { title: string; sub: string } {
  if (a.status === "closed") {
    const last = lastDoneStage(a);
    return { title: a.closed_reason ? CLOSED_LABEL[a.closed_reason] : "Closed", sub: last ? `After ${last.label || STAGE_LABEL[last.stage]}` : "Before any interview" };
  }
  const next = nextStage(a);
  if (next && next.at) return { title: next.label || STAGE_LABEL[next.stage], sub: rowWhen(next.at) };
  if (next && a.process.some((s) => s.done || s.at)) return { title: next.label || STAGE_LABEL[next.stage], sub: "Date to come" };
  return { title: "Waiting to hear", sub: a.waiting ?? "" };
}

export default function Applications() {
  const store = useStore();
  const now = store.now();
  const { active, closed } = applicationsByTab(store.applications);
  const [tab, setTab] = useState<"active" | "closed">("active");
  const rows = tab === "active" ? active : closed;
  const upNext = nextInterview(store.applications, now);
  const waiting = active.filter((a) => a.status === "applied" && !a.process.some((s) => s.at && !s.done)).length;
  const thisWeek = active.reduce((n, a) => n + a.process.filter((s) => !s.done && isThisWeek(s.at, now)).length, 0);
  const summary =
    tab === "active"
      ? [`${waiting} waiting to hear back`, `${thisWeek} ${thisWeek === 1 ? "interview" : "interviews"} this week`].join(" · ")
      : `${closed.length} closed`;
  const practicedHere = upNext ? (store.screens.applications.byApp[upNext.application.id]?.practicedByStage[upNext.stage.id] ?? 0) : 0;

  const tabStyle = (on: boolean) => (on ? { background: "var(--e-tint)", color: "var(--e-ink)" } : undefined);

  return (
    <AppShell nav="applications">
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <h1 className="e-h1">Applications</h1>
          <span className="e-meta">Everything you've applied to. Attach the resume you sent, and practice each one stage by stage.</span>
        </div>
        <Link to="6-2-new-application" className="e-btn e-btn-primary">+ Add an application</Link>
      </header>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
        <nav style={{ display: "flex", gap: "6px", background: "var(--e-surface)", borderRadius: "14px", padding: "4px", boxShadow: "var(--e-shadow)" }} aria-label="Filter">
          <button type="button" aria-current={tab === "active" ? "page" : undefined} className={tab === "active" ? "e-btn e-btn-sm" : "e-btn e-btn-sm e-btn-ghost"} style={tabStyle(tab === "active")} onClick={() => setTab("active")}>
            {`Active · ${active.length}`}
          </button>
          <button type="button" aria-current={tab === "closed" ? "page" : undefined} className={tab === "closed" ? "e-btn e-btn-sm" : "e-btn e-btn-sm e-btn-ghost"} style={tabStyle(tab === "closed")} onClick={() => setTab("closed")}>
            {`Closed · ${closed.length}`}
          </button>
        </nav>
        <span className="e-small">{summary}</span>
      </div>
      {tab === "active" && upNext && (
        <div className="e-card" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "20px", color: "var(--e-ink)", boxShadow: "inset 0 0 0 2px var(--e-primary)" }}>
          <Link to="6-3-application-overview" style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: "6px", textDecoration: "none", color: "var(--e-ink)" }}>
            <span className="e-label">Next up</span>
            <span className="e-h2">{`${upNext.application.company} · ${upNext.stage.label || STAGE_LABEL[upNext.stage.stage]}`}</span>
            <span className="e-meta">{`${whenText(upNext.stage.at, now)} · ${practicedHere > 0 ? `${practicedHere} answers practiced for this stage` : "not practiced yet"}`}</span>
          </Link>
          <span className="e-badge">{inDays(upNext.stage.at, now)}</span>
          <Link to="2-3-start-a-session" className="e-btn e-btn-primary e-btn-sm">Practice this stage</Link>
        </div>
      )}
      <section className="e-card" style={{ padding: "8px 28px" }}>
        <div className="e-rowline" style={{ padding: "14px 0" }}>
          <span className="e-label" style={{ flex: "2 1 0" }}>Company</span>
          <span className="e-label" style={{ flex: "1 1 0" }}>Status</span>
          <span className="e-label" style={{ flex: "1.3 1 0" }}>Sent</span>
          <span className="e-label" style={{ flex: "1.5 1 0" }}>{tab === "active" ? "Next" : "How it ended"}</span>
          <span className="e-label" style={{ flex: "0.8 1 0", textAlign: "right" }}>Practice</span>
        </div>
        {rows.length === 0 && (
          <div style={{ padding: "28px 0" }}>
            <span className="e-meta">{tab === "active" ? "Nothing open right now. Add an application when you apply." : "Nothing closed yet."}</span>
          </div>
        )}
        {rows.map((a, i) => {
          const nx = nextColumn(a);
          return (
            <Link key={a.id} to="6-3-application-overview" className="e-rowline" style={{ padding: "18px 0", textDecoration: "none", color: "var(--e-ink)", ...(i === rows.length - 1 ? { borderBottom: "none" } : {}) }}>
              <span style={{ flex: "2 1 0", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontWeight: "700", fontSize: "16px" }}>
                  {a.company}
                  {a.startup && (
                    <>
                      {" "}
                      <span className="e-pill" style={{ background: "var(--e-ground)", padding: "3px 10px", fontSize: "12px" }}>Startup</span>
                    </>
                  )}
                </span>
                <span className="e-small">{a.role}</span>
              </span>
              <span style={{ flex: "1 1 0" }}>
                <span className="e-pill" style={{ fontWeight: "600", ...statusStyle(a.status) }}>{STATUS_LABEL[a.status]}</span>
              </span>
              <span style={{ flex: "1.3 1 0", display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "14px" }}>{`Applied ${shortDate(a.applied_on)}`}</span>
                {a.resume ? (
                  <span className="e-small" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    {FILE_ICON}
                    {`Resume · ${shortFileName(a.resume.fileName)}`}
                  </span>
                ) : (
                  <span className="e-small" style={{ color: "var(--e-warn-ink)" }}>No resume attached</span>
                )}
              </span>
              <span style={{ flex: "1.5 1 0", display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "14px", fontWeight: "600" }}>{nx.title}</span>
                <span className="e-small">{nx.sub}</span>
              </span>
              <span className="e-small" style={{ flex: "0.8 1 0", textAlign: "right" }}>{answersText(a.answersPracticed)}</span>
            </Link>
          );
        })}
      </section>
    </AppShell>
  );
}
