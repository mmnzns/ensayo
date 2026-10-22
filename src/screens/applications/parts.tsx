// Shared pieces for the application detail screens (6-3 to 6-8 and Questions): the header, the tab bar, the status menu.
import { createContext, useCallback, useContext, useEffect, useState, type ComponentType, type ReactNode } from "react";
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import { EMPTY_EXTRAS, plainError } from "../../data/actions";
import { useActions, useApplicationExtras } from "../../data/real";
import { useHashParam, withParams } from "../../data/selection";
import { useStore } from "../../data/store";
import { applicationTarget } from "../../data/targets";
import { TargetLabel } from "./TargetMark";
import type { ApplicationExtras } from "../../data/screens/applications";
import type { Application, ApplicationStatus, ClosedReason } from "../../data/types";
import { CLOSED_LABEL, STATUSES, STATUS_LABEL, nextStage, shortDate, statusStyle, STAGE_LABEL, whenText } from "./format";

export { EMPTY_EXTRAS };

/** The application the screen on show is about, so every link inside it carries the choice along. */
const SelectedContext = createContext<string | undefined>(undefined);

/** A link target for one of the application screens, for the application on show. */
export function useAppLink(): (screen: string, extra?: Record<string, string | null | undefined>) => string {
  const id = useContext(SelectedContext);
  return useCallback((screen, extra) => withParams(screen, { app: id, ...extra }), [id]);
}

/** The application most recently on show, for a screen reached with nothing said about which one. */
let lastSelected: string | undefined;

/** Runs a command and keeps its plain-words error for the screen. */
export function useRun() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(plainError(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, setError };
}

/** A rejected command, in plain words, where the person is looking. */
export function ErrorLine({ error }: { error: string }) {
  if (!error) return null;
  return (
    <span role="alert" className="e-small" style={{ color: "var(--e-danger)" }}>
      {error}
    </span>
  );
}

/** A quiet note, for what Ensayo did instead of what was asked (the posting read by keywords) or what it kept. */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="e-soft" role="status" style={{ padding: "14px 18px" }}>
      <span className="e-meta">{children}</span>
    </div>
  );
}

export interface Featured {
  app: Application;
  extras: ApplicationExtras;
  now: Date;
}

/** The application the detail screens show: the one the link named, else the last one looked at, else the sample's
 *  featured one, else the first open one. Undefined when there are none. */
export function useFeatured(): { app?: Application; extras: ApplicationExtras; now: Date } {
  const store = useStore();
  const named = useHashParam("app");
  const apps = store.applications;
  const app =
    apps.find((a) => a.id === named) ??
    apps.find((a) => a.id === lastSelected) ??
    apps.find((a) => a.id === store.screens.applications.featuredId) ??
    apps.find((a) => a.status !== "closed") ??
    apps[0];
  const extras = useApplicationExtras(app?.id);
  useEffect(() => {
    if (app) lastSelected = app.id;
  }, [app]);
  return { app, extras, now: store.now() };
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
    return (
      <SelectedContext.Provider value={app.id}>
        <Inner key={app.id} app={app} extras={extras} now={now} />
      </SelectedContext.Provider>
    );
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
  const link = useAppLink();
  return (
    <nav style={{ display: "flex", flexWrap: "wrap", gap: "6px", background: "var(--e-surface)", borderRadius: "14px", padding: "4px", boxShadow: "var(--e-shadow)", alignSelf: "flex-start" }} aria-label="Application sections">
      {TABS.map((t) =>
        t.id === current ? (
          <Link key={t.id} to={link(t.to)} aria-current="page" className="e-btn e-btn-sm" style={{ background: "var(--e-tint)", color: "var(--e-ink)" }}>
            {t.label}
          </Link>
        ) : (
          <Link key={t.id} to={link(t.to)} className="e-btn e-btn-sm e-btn-ghost">
            {t.label}
          </Link>
        ),
      )}
    </nav>
  );
}

/** The status chip. Opens a menu to change the status; Closed asks why with an inline select. */
export function StatusMenu({ app }: { app: Application }) {
  const actions = useActions();
  const { busy, error, run } = useRun();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const status = app.status;
  const reason = app.closed_reason;
  const label = status === "closed" && reason ? `Closed · ${CLOSED_LABEL[reason]}` : STATUS_LABEL[status];
  const change = async (patch: { status: ApplicationStatus; closed_reason?: ClosedReason }) => {
    const done = await run(() => actions.updateApplication(app.id, patch));
    if (done) {
      setAsking(false);
      setOpen(false);
    }
  };
  const pick = (s: ApplicationStatus) => {
    if (s === "closed") {
      setAsking(true);
      return;
    }
    void change({ status: s });
  };
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: "10px" }}>
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
      {!open && <ErrorLine error={error} />}
      {open && (
        <span role="menu" className="e-card" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 5, padding: "8px", display: "flex", flexDirection: "column", gap: "2px", minWidth: "220px", boxShadow: "0 8px 28px rgba(43,39,34,.16)" }}>
          {STATUSES.map((s) => (
            <button key={s} type="button" role="menuitem" className="e-btn e-btn-ghost e-btn-sm" disabled={busy} style={{ justifyContent: "flex-start", fontWeight: s === status ? 700 : 500 }} onClick={() => pick(s)}>
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
                value={reason ?? ""}
                disabled={busy}
                onChange={(e) => void change({ status: "closed", closed_reason: e.target.value as ClosedReason })}
              >
                <option value="" disabled>Why?</option>
                {(Object.keys(CLOSED_LABEL) as ClosedReason[]).map((r) => (
                  <option key={r} value={r}>{CLOSED_LABEL[r]}</option>
                ))}
              </select>
            </span>
          )}
          <ErrorLine error={error} />
        </span>
      )}
    </span>
  );
}

/** Company, badges, role line and the two actions, shared by the application detail screens. */
export function AppHeader({ app, now, children }: { app: Application; now: Date; children?: ReactNode }) {
  const link = useAppLink();
  const store = useStore();
  const filed = applicationTarget(app, store.targets);
  const next = nextStage(app);
  const nextBit = next ? ` · next: ${next.label || STAGE_LABEL[next.stage]}, ${next.at ? whenText(next.at, now) : "date to come"}` : "";
  return (
    <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <Link to="6-1-applications" className="e-small" style={{ textDecoration: "none" }}>‹ Applications</Link>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <h1 className="e-h1">{app.company}</h1>
          {app.startup && <span className="e-pill">Startup</span>}
          <StatusMenu app={app} />
        </div>
        <span className="e-meta">
          {`${app.role} · applied ${shortDate(app.applied_on)}${nextBit}`}
          {filed && (
            <>
              {" · target: "}
              <Link to={link("6-4-application-edit-details")} style={{ fontWeight: 600, color: "var(--e-ink)", textDecoration: "none" }} aria-label={`Target: ${filed.name}. Change it in Edit details`}>
                <TargetLabel target={filed} />
              </Link>
            </>
          )}
        </span>
        {children}
      </div>
      <div style={{ display: "flex", gap: "10px" }}>
        <Link to={link("6-4-application-edit-details")} className="e-btn e-btn-line">Edit details</Link>
        <Link to={link("2-3-start-a-session", { stage: next?.id })} className="e-btn e-btn-primary">Practice the next stage</Link>
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
