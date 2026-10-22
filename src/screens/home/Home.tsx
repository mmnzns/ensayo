import { daysUntil, greeting, useStore } from "../../data/store";
import { nextDated } from "../../practice/applied";
import { practiceTargetFor } from "../../practice/sessionTarget";
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import { dayAndTime, inDays, longDate, weekdayName, whenPhrase } from "./format";
import { setSessionPreset } from "./preset";
import { withParams } from "../../data/selection";
import { liveAvailable } from "../../practice/live";
import { startApplicationDrill, startQuickDrill } from "../../practice/quick";
import { useApplicationExtras } from "../../practice/extras";
import HomeEmpty from "./HomeEmpty";
import { habitCount, showFirstHome } from "./state";
import { viewSession } from "../../practice/viewing";

/** Home. `offline` is the same page with no connection and no AI engine (see HomeOffline). */
export function HomeView({ offline = false }: { offline?: boolean }) {
  const store = useStore();
  const { profile, habits, homeHabitStats, applications, targets, activeTarget } = store;
  const home = store.screens.home;
  const now = store.now();
  const next = nextDated(applications, now);
  const nextAt = next?.when.date ?? null;
  const days = next && nextAt ? daysUntil(nextAt, now) : null;
  const extras = useApplicationExtras(next?.application.id);
  // The Drill is for the application's target when it starts from an application, else for the one practised now.
  const target = practiceTargetFor(next?.application, targets, activeTarget);

  const focusId = profile.focusHabits[0];
  const practiceTitle = focusId ? home.practiceTitles[focusId] : "Practice a few general questions";
  const drillLine = `A ${home.drill.questions}-question Drill${target ? ` from your ${target.name} questions` : ""}, about ${home.drill.minutes} minutes.`;
  const practiceText =
    next && nextAt && days !== null
      ? `${drillLine} ${next.application.company}'s ${next.stage.label.toLowerCase()} questions first, since that interview is ${whenPhrase(nextAt, days)}.`
      : target
        ? drillLine
        : `${drillLine} General questions for a ${profile.targetRole.toLowerCase()} role.`;

  const focusStats = (profile.focusHabits.length ? profile.focusHabits : homeHabitStats.map((s) => s.id))
    .map((id) => homeHabitStats.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s);

  // In the app these come from what was practised; the browser preview keeps the sample numbers.
  const real = liveAvailable();
  const latest = store.sessions[0];
  const streak = real ? store.streak.daysInARow : home.streakBefore;
  const last = real
    ? latest && { id: latest.id, when: latest.when, mode: latest.mode, stageLabel: latest.title.split(" · ")[0], win: latest.headline }
    : home.lastSession && { id: null as string | null, ...home.lastSession };
  const totals = real ? store.streak : home.totalsBefore;

  return (
    <AppShell nav="home">
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span className="e-meta">{longDate(now)}</span>
          <h1 className="e-h1">
            {greeting(now)}, {profile.name}
          </h1>
        </div>
        {streak > 0 && (
          <span className="e-pill" style={{ fontSize: "14px", padding: "8px 14px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ stroke: "var(--e-win)" }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3c2 4 6 5 6 10a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-5 1-7z" />
            </svg>
            {streak} {streak === 1 ? "day" : "days"} in a row
          </span>
        )}
      </header>
      {offline && (
        <section className="e-soft" role="status" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 16px", padding: "14px 20px" }}>
          <span className="e-badge">Offline</span>
          <span className="e-meta" style={{ flex: "1 1 360px" }}>
            Practice still works. Without an engine Ensayo can judge timing, length and filler words, but not whether you answered the question or said your numbers.
          </span>
        </section>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "stretch" }}>
        <section className="e-card e-glow" style={{ flex: "999 1 480px", minWidth: "0", padding: "36px", display: "flex", flexDirection: "column", gap: "18px" }}>
          <span className="e-label">Next up</span>
          <h2 className="e-h1" style={{ fontSize: "28px" }}>{practiceTitle}</h2>
          <p className="e-meta" style={{ margin: "0" }}>{practiceText}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "8px" }}>
            <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-primary e-btn-big" onClick={() => {
              const ctx = { targetRole: target?.role ?? profile.targetRole, stories: store.stories, methods: store.methods, target };
              if (next) startApplicationDrill(ctx, next, extras?.questions);
              else startQuickDrill(ctx);
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0" />
                <path d="M12 18v3" />
              </svg>
              Practice
            </Link>
            <Link to="2-3-start-a-session" className="e-btn e-btn-white" onClick={() => setSessionPreset({ mode: "mock" })}>
              Start a Mock
            </Link>
            <Link to="2-3-start-a-session" className="e-btn e-btn-ghost">More options</Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px", borderTop: "1px solid var(--e-line)", paddingTop: "16px" }}>
            <span className="e-small">
              <strong style={{ color: "var(--e-ink)" }}>Drill</strong> · a note after every answer, then try it again. For building the habit.
            </span>
            <span className="e-small">
              <strong style={{ color: "var(--e-ink)" }}>Mock</strong> · a whole interview stage straight through, notes at the end. For testing it under pressure.
            </span>
          </div>
        </section>
        {next && nextAt && days !== null && (
          <section className="e-card" style={{ flex: "1 1 300px", minWidth: "0", display: "flex", flexDirection: "column", gap: "14px" }}>
            <span className="e-label">Next interview</span>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span className="e-h2">{next.application.company}</span>
              <span className="e-meta">
                {next.stage.label} · {next.when.hasTime ? dayAndTime(nextAt) : weekdayName(nextAt)}
              </span>
            </div>
            <span className="e-badge" style={{ alignSelf: "flex-start" }}>{inDays(days)}</span>
            <p className="e-meta" style={{ margin: "0" }}>
              {days >= 2
                ? `${days === 2 ? "Tomorrow evening" : "The evening before"}, lock your opener, one story and two questions.`
                : days === 1
                  ? "Tonight, lock your opener, one story and two questions."
                  : "Your cue sheet has your beats and numbers, never a script."}
            </p>
            {days >= 2 ? (
              <Link to="2-3-start-a-session" className="e-btn e-btn-line e-btn-sm" style={{ alignSelf: "flex-start", marginTop: "auto" }} onClick={() => setSessionPreset({ source: "application", applicationId: next.application.id, stageId: next.stage.id })}>
                Practice this stage
              </Link>
            ) : days === 1 ? (
              <Link to={withParams("6-6-application-stages-and-night-before", { app: next.application.id, stage: next.stage.id })} className="e-btn e-btn-line e-btn-sm" style={{ alignSelf: "flex-start", marginTop: "auto" }}>
                Lock your night-before set
              </Link>
            ) : (
              <Link to={withParams("6-7-cue-sheet", { app: next.application.id, stage: next.stage.id })} className="e-btn e-btn-line e-btn-sm" style={{ alignSelf: "flex-start", marginTop: "auto" }}>
                Open cue sheet
              </Link>
            )}
          </section>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "stretch" }}>
        <section className="e-card" style={{ flex: "999 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <span className="e-label">Your focus</span>
            <Link to="7-1-progress-habits" className="e-small">All habits</Link>
          </div>
          {focusStats.length === 0 && <span className="e-meta">Pick a habit to work on and it shows up here.</span>}
          {focusStats.map((stat) => {
            const [got, of] = stat.firstTry;
            const pct = of > 0 ? Math.min(100, Math.round((got / of) * 100)) : 0;
            return (
              <div key={stat.id} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                  <span className="e-h3">{habits.find((h) => h.id === stat.id)?.label ?? stat.id}</span>
                  <span className="e-meta">{habitCount(got, of)}</span>
                </div>
                <div className="e-bar" aria-label={`${got} of ${of}`}>
                  <span style={{ width: `${pct}%` }} />
                </div>
                <span className="e-small">{stat.note}</span>
              </div>
            );
          })}
        </section>
        <section className="e-card" style={{ flex: "1 1 300px", minWidth: "0", display: "flex", flexDirection: "column", gap: "10px" }}>
          <span className="e-label">Quick practice</span>
          <Link to="2-3-start-a-session" className="e-nav" style={{ padding: "12px 0", borderBottom: "1px solid var(--e-line)", borderRadius: "0" }} onClick={() => setSessionPreset({ source: "story" })}>
            Practice a story <span style={{ marginLeft: "auto" }}>›</span>
          </Link>
          <Link to="2-3-start-a-session" className="e-nav" style={{ padding: "12px 0", borderBottom: "1px solid var(--e-line)", borderRadius: "0" }} onClick={() => setSessionPreset({ source: "stage" })}>
            Practice a stage <span style={{ marginLeft: "auto" }}>›</span>
          </Link>
          <Link to="2-3-start-a-session" className="e-nav" style={{ padding: "12px 0", borderRadius: "0" }} onClick={() => setSessionPreset({ source: "own" })}>
            Type your own question <span style={{ marginLeft: "auto" }}>›</span>
          </Link>
        </section>
      </div>
      {last && (
        <section className="e-card" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "20px" }}>
          <span className="e-label" style={{ flex: "none" }}>Last session</span>
          <span className="e-h3" style={{ flex: "1 1 260px" }}>
            {last.when} · {last.mode === "mock" ? "Mock" : "Drill"} · {last.stageLabel} stage
          </span>
          <span className="e-win" style={{ fontSize: "18px" }}>{last.win}</span>
          <Link to={last.mode === "mock" ? "4-4-session-results-mock-debrief" : "4-3-session-results-drill"} className="e-btn e-btn-ghost e-btn-sm" onClick={() => viewSession(last.id)}>See results ›</Link>
        </section>
      )}
      <p className="e-small" style={{ margin: "0" }}>
        {totals.answers} answers practiced · {totals.questions} questions faced · {totals.followUps} follow-ups handled
      </p>
    </AppShell>
  );
}

export default function Home() {
  const store = useStore();
  // In the app, before the first answer, Home is the welcome: nothing to show yet, and a way to start.
  return showFirstHome(liveAvailable(), store.sessions.length, nextDated(store.applications, store.now()) !== undefined) ? <HomeEmpty /> : <HomeView />;
}
