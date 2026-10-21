// Shared pieces for the application detail screens (6-3 to 6-8 and Questions): the header, the tab bar, the status menu.
import { useState, type ComponentType, type ReactNode } from "react";
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import { useStore } from "../../data/store";
import type { ApplicationExtras } from "../../data/screens/applications";
import type { Application, ApplicationStatus, ClosedReason } from "../../data/types";
import { CLOSED_LABEL, STATUSES, STATUS_LABEL, nextStage, shortDate, statusStyle, STAGE_LABEL, whenText } from "./format";

export const EMPTY_EXTRAS: ApplicationExtras = {
  postingText: "",
  postingPastedOn: "",
  wasValues: {},
  practicedByStage: {},
  questions: [],
};

export interface Featured {
  app: Application;
  extras: ApplicationExtras;
  now: Date;
}

/** The application the detail screens show (one route per tab in M1). Undefined when the store has none. */
export function useFeatured(): { app?: Application; extras: ApplicationExtras; now: Date } {
  const store = useStore();
  const data = store.screens.applications;
  const app = store.applications.find((a) => a.id === data.featuredId) ?? store.applications.find((a) => a.status !== "closed") ?? store.applications[0];
  return { app, extras: (app && data.byApp[app.id]) || EMPTY_EXTRAS, now: store.now() };
}

/** Wraps a screen so it reads the featured application once, and shows a quiet empty state when there is none. */
export function withFeatured(Inner: ComponentType<Featured>): ComponentType {
  return function WithFeatured() {
    const { app, extras, now } = useFeatured();
    if (!app) {
      return (
        <AppShell nav="applications">
          <Link to="6-1-applications" className="e-small" style={{ textDecoration: "none" }}>‹ Applications</Link>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start" }}>
            <span className="e-h2">No application yet</span>
            <span className="e-meta">Add one and its resume, stages and night-before set will show up here.</span>
            <Link to="6-2-new-application" className="e-btn e-btn-primary">+ Add an application</Link>
          </section>
        </AppShell>
      );
    }
    return <Inner app={app} extras={extras} now={now} />;
  };
}

export type TabId = "overview" | "resume" | "stages" | "said" | "cue" | "questions";

const TABS: { id: TabId; to: string; label: string }[] = [
  { id: "overview", to: "6-3-application-overview", label: "Overview" },
  { id: "resume", to: "6-5-application-the-resume-you-sent", label: "Resume" },
  { id: "stages", to: "6-6-application-stages-and-night-before", label: "Stages and night before" },
  { id: "said", to: "6-8-application-what-you-ve-said", label: "What you've said" },
  { id: "cue", to: "6-7-cue-sheet", label: "Cue sheet" },
  { id: "questions", to: "applications-questions", label: "Questions" },
];

export function AppTabs({ current }: { current: TabId }) {
  return (
    <nav style={{ display: "flex", flexWrap: "wrap", gap: "6px", background: "var(--e-surface)", borderRadius: "14px", padding: "4px", boxShadow: "var(--e-shadow)", alignSelf: "flex-start" }} aria-label="Application sections">
      {TABS.map((t) =>
        t.id === current ? (
          <Link key={t.id} to={t.to} aria-current="page" className="e-btn e-btn-sm" style={{ background: "var(--e-tint)", color: "var(--e-ink)" }}>
            {t.label}
          </Link>
        ) : (
          <Link key={t.id} to={t.to} className="e-btn e-btn-sm e-btn-ghost">
            {t.label}
          </Link>
        ),
      )}
    </nav>
  );
}

/** The status chip. Opens a menu to change the status; Closed asks why with an inline select. */
export function StatusMenu({ initial, initialReason }: { initial: ApplicationStatus; initialReason: ClosedReason | null }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ApplicationStatus>(initial);
  const [reason, setReason] = useState<ClosedReason | "">(initialReason ?? "");
  const [asking, setAsking] = useState(false);
  const label = status === "closed" && reason ? `Closed · ${CLOSED_LABEL[reason]}` : STATUS_LABEL[status];
  const pick = (s: ApplicationStatus) => {
    if (s === "closed") {
      setAsking(true);
      return;
    }
    setStatus(s);
    setReason("");
    setAsking(false);
    setOpen(false);
  };
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        className="e-pill"
        style={{ border: "none", font: "inherit", fontSize: "13px", fontWeight: "600", cursor: "pointer", ...statusStyle(status) }}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          setAsking(false);
        }}
      >
        {label}{" "}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <span role="menu" className="e-card" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 5, padding: "8px", display: "flex", flexDirection: "column", gap: "2px", minWidth: "220px", boxShadow: "0 8px 28px rgba(43,39,34,.16)" }}>
          {STATUSES.map((s) => (
            <button key={s} type="button" role="menuitem" className="e-btn e-btn-ghost e-btn-sm" style={{ justifyContent: "flex-start", fontWeight: s === status ? 700 : 500 }} onClick={() => pick(s)}>
              {STATUS_LABEL[s]}
            </button>
          ))}
          {asking && (
            <span style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "8px 6px 4px" }}>
              <label htmlFor="closed-why" className="e-small">Why did it close?</label>
              <select
                id="closed-why"
                className="e-input"
                style={{ minHeight: "40px", padding: "8px 10px", fontSize: "14px" }}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value as ClosedReason);
                  setStatus("closed");
                  setAsking(false);
                  setOpen(false);
                }}
              >
                <option value="" disabled>Why?</option>
                {(Object.keys(CLOSED_LABEL) as ClosedReason[]).map((r) => (
                  <option key={r} value={r}>{CLOSED_LABEL[r]}</option>
                ))}
              </select>
            </span>
          )}
        </span>
      )}
    </span>
  );
}

/** Company, badges, role line and the two actions, shared by the application detail screens. */
export function AppHeader({ app, now, children }: { app: Application; now: Date; children?: ReactNode }) {
  const next = nextStage(app);
  const nextBit = next ? ` · next: ${next.label || STAGE_LABEL[next.stage]}, ${next.at ? whenText(next.at, now) : "date to come"}` : "";
  return (
    <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <Link to="6-1-applications" className="e-small" style={{ textDecoration: "none" }}>‹ Applications</Link>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <h1 className="e-h1">{app.company}</h1>
          {app.startup && <span className="e-pill">Startup</span>}
          <StatusMenu initial={app.status} initialReason={app.closed_reason} />
        </div>
        <span className="e-meta">{`${app.role} · applied ${shortDate(app.applied_on)}${nextBit}`}</span>
        {children}
      </div>
      <div style={{ display: "flex", gap: "10px" }}>
        <Link to="6-4-application-edit-details" className="e-btn e-btn-line">Edit details</Link>
        <Link to="2-3-start-a-session" className="e-btn e-btn-primary">Practice the next stage</Link>
      </div>
    </header>
  );
}

/** A claim state as the chip the design uses. */
export function MatchChip({ status, text }: { status: string; text: string }) {
  if (status === "differs") return <span className="e-badge">{text}</span>;
  if (status === "not_in_bank") return <span className="e-pill">{text}</span>;
  if (status === "said_once") return <span className="e-pill" style={{ background: "var(--e-ground)" }}>{text}</span>;
  return <span className="e-badge e-badge-ok">{text}</span>;
}
