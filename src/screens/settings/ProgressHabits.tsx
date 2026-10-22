// Draft generated from Design/screens/html/7-1-progress-habits.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import { habitStatus, useStore } from "../../data/store";
import type { Habit, Streak } from "../../data/types";
import type { HabitProgress } from "../../data/screens/settings";
import { passRate, shortDate, youLabel } from "./format";
import { useRepHistory } from "../../data/real";
import { liveAvailable } from "../../practice/live";
import { progressData } from "../../practice/habits";

const TOTALS: { label: string; key: keyof Streak; color?: string }[] = [
  { label: "Days in a row", key: "daysInARow", color: "var(--e-win)" },
  { label: "Answers practiced", key: "answers" },
  { label: "Questions faced", key: "questions" },
  { label: "Follow-ups handled", key: "followUps" },
];

/** The last 10 first tries as ten small blocks, oldest first, padded on the left when there are fewer. */
function LastTen({ results }: { results: boolean[] }) {
  const last = results.slice(-10);
  const cells: (boolean | null)[] = [...Array(10 - last.length).fill(null), ...last];
  const { passes, of } = habitStatus(results);
  return (
    <div style={{ display: "flex", gap: "6px" }} aria-label={`Last ${of} answers: ${passes} passed`}>
      {cells.map((c, i) => (
        <span key={i} style={{ flex: "1", height: "28px", borderRadius: "6px", background: c ? "var(--e-primary)" : "var(--e-line)" }} />
      ))}
    </div>
  );
}

const retryText = (r?: [number, number]) => (r ? `${r[0]} of ${r[1]}` : "n/a");

export default function ProgressHabits() {
  const store = useStore();
  const { streak, habits } = store;
  const history = useRepHistory();
  // In the app the numbers come from what was practised; the browser preview keeps the sample data.
  const data = liveAvailable() ? progressData(habits, history, store.profile.focusHabits) : store.screens.settings.progress;
  const habitOf = (id: string): Habit | undefined => habits.find((h) => h.id === id);
  const progressOf = (id: string): HabitProgress | undefined => data.habits.find((p) => p.id === id);
  const rows = habits.map((h) => ({ habit: h, progress: progressOf(h.id) }));
  const focus = data.focus.map((f) => ({ f, habit: habitOf(f.id), progress: progressOf(f.id) })).filter((x) => x.habit && x.progress);

  return (
    <AppShell nav="progress">
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px" }}>
        <h1 className="e-h1">Progress</h1>
        <div style={{ display: "flex", gap: "6px", background: "var(--e-surface)", borderRadius: "14px", padding: "4px", boxShadow: "var(--e-shadow)" }} role="tablist">
          <Link to="7-1-progress-habits" role="tab" aria-selected="true" className="e-btn e-btn-sm" style={{ background: "var(--e-tint)", color: "var(--e-ink)" }}>Habits</Link>
          <Link to="7-2-progress-sessions" role="tab" aria-selected="false" className="e-btn e-btn-sm e-btn-ghost">Sessions</Link>
        </div>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "16px" }}>
        {TOTALS.map((t) => (
          <div key={t.key} className="e-card" style={{ padding: "20px" }}>
            <span className="e-small">{t.label}</span>
            <div className="e-hand" style={{ fontSize: "31px", ...(t.color ? { color: t.color } : {}) }}>{streak[t.key]}</div>
          </div>
        ))}
      </div>
      {focus.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
          {focus.map(({ f, habit, progress }) => {
            const { passes, of } = habitStatus(progress!.results);
            const detail = f.detail ?? (progress!.retry ? `the fix stuck on retry ${progress!.retry[0]} of ${progress!.retry[1]} times` : "");
            return (
              <section key={f.id} className="e-card" style={{ display: "flex", flexDirection: "column", gap: "14px", boxShadow: "inset 0 0 0 2px var(--e-primary)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                  <span className="e-label" style={{ color: "var(--e-primary-dark)" }}>Focus</span>
                  {f.since && <span className="e-small">since {shortDate(f.since)}</span>}
                </div>
                <span className="e-h2">{youLabel(habit!.label)}</span>
                <LastTen results={progress!.results} />
                <span className="e-meta">
                  {passes} of your last {of} first tries{detail ? ` · ${detail}` : ""}
                </span>
              </section>
            );
          })}
        </div>
      )}
      <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "0", padding: "8px 28px" }}>
        <div className="e-rowline" style={{ padding: "14px 0" }}>
          <span className="e-h3" style={{ flex: "1" }}>All habits</span>
          <span className="e-small" style={{ width: "200px" }}>right first time</span>
          <span className="e-small" style={{ width: "120px", textAlign: "right" }}>fix stuck on retry</span>
        </div>
        {rows.map(({ habit, progress }, i) => {
          const graduated = progress ? habitStatus(progress.results).graduated : false;
          return (
            <div key={habit.id} className="e-rowline" style={{ padding: "14px 0", ...(i === rows.length - 1 ? { borderBottom: "none" } : {}) }}>
              <span style={{ flex: "1", display: "flex", alignItems: "center", gap: "10px" }}>
                <span>
                  {youLabel(habit.label)}
                  {progress?.note ? <span className="e-small"> · {progress.note}</span> : null}
                </span>
                {graduated ? <span className="e-badge" style={{ background: "#FFE7B8", color: "#7A4A12" }}>Graduated</span> : null}
              </span>
              <div className="e-bar" style={{ width: "200px" }} role="img" aria-label={progress ? `Right first time in ${Math.round(passRate(progress.results) * 100)} percent of recent answers` : "No answers yet"}>
                <span style={{ width: `${Math.round((progress ? passRate(progress.results) : 0) * 100)}%` }} />
              </div>
              <span className="e-meta" style={{ width: "120px", textAlign: "right" }}>{retryText(progress?.retry)}</span>
            </div>
          );
        })}
      </section>
      <span className="e-small">
        Based on your last {data.basedOnLast} answers.
        {data.judgedUpdatedOn ? ` How answers are judged was updated on ${shortDate(data.judgedUpdatedOn)}; older results keep their original marks.` : ""}
      </span>
    </AppShell>
  );
}
