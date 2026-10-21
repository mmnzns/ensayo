import { createContext, createElement, useContext, type ReactNode } from "react";
import type { ApplicationsData } from "./screens/applications";
import type { FirstRunData } from "./screens/first-run";
import type { HomeData } from "./screens/home";
import type { PracticeData } from "./screens/practice";
import type { ResultsData } from "./screens/results";
import type { SettingsData } from "./screens/settings";
import type { StatesData } from "./screens/states";
import type { StoriesData } from "./screens/stories";
import type { Application, EngineStatus, Habit, HabitStat, Method, Profile, ProcessStage, SessionSummary, Story, Streak } from "./types";

/** Everything the screens read. M1 serves `mockStore`; later milestones serve the real files behind the same interface. */
export interface Store {
  now(): Date;
  profile: Profile;
  habits: Habit[];
  stories: Story[];
  methods: Method[];
  applications: Application[];
  sessions: SessionSummary[];
  engine: EngineStatus;
  streak: Streak;
  homeHabitStats: HabitStat[];
  /** Sample data that only one group of screens shows. Each group owns its slice. */
  screens: {
    firstRun: FirstRunData;
    home: HomeData;
    practice: PracticeData;
    results: ResultsData;
    stories: StoriesData;
    applications: ApplicationsData;
    settings: SettingsData;
    states: StatesData;
  };
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ store, children }: { store: Store; children: ReactNode }) {
  return createElement(StoreContext.Provider, { value: store }, children);
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error("useStore needs a StoreProvider");
  return s;
}

// ---------- shared selectors (pure; the real store reuses them) ----------

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Whole calendar days from `now` to `date` (0 = today). */
export function daysUntil(date: Date, now: Date): number {
  return Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
}

export function greeting(now: Date): string {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** The earliest upcoming, not-done stage with a date across open applications. */
export function nextInterview(apps: Application[], now: Date): { application: Application; stage: ProcessStage } | undefined {
  let best: { application: Application; stage: ProcessStage; at: Date } | undefined;
  for (const application of apps) {
    if (application.status === "closed") continue;
    for (const stage of application.process) {
      if (stage.done || !stage.at) continue;
      const at = new Date(stage.at);
      if (at < now) continue;
      if (!best || at < best.at) best = { application, stage, at };
    }
  }
  return best && { application: best.application, stage: best.stage };
}

function nextStageTime(a: Application): number | undefined {
  const times = a.process.filter((s) => !s.done && s.at).map((s) => new Date(s.at as string).getTime());
  return times.length ? Math.min(...times) : undefined;
}

/** Active (Applied to Offer) sorted by next interview date, then most recent; Closed by most recent. */
export function applicationsByTab(apps: Application[]): { active: Application[]; closed: Application[] } {
  const recent = (a: Application, b: Application) => b.applied_on.localeCompare(a.applied_on);
  const active = apps
    .filter((a) => a.status !== "closed")
    .sort((a, b) => {
      const ta = nextStageTime(a);
      const tb = nextStageTime(b);
      if (ta !== undefined && tb !== undefined) return ta - tb;
      if (ta !== undefined) return -1;
      if (tb !== undefined) return 1;
      return recent(a, b);
    });
  const closed = apps.filter((a) => a.status === "closed").sort(recent);
  return { active, closed };
}

/** The gap badges on a story card, in plain words. */
export function storyGaps(story: Story): string[] {
  const gaps: string[] = [];
  if (!story.approach.trim()) gaps.push("No strategy yet");
  if (story.proof_points.length === 0) gaps.push("No number");
  else if (story.proof_points.some((p) => !p.verified)) gaps.push("Numbers not checked");
  return gaps;
}

/** Pass rate over the last 10; graduates at 8 of 10; no trend before 5 reps (Build Plan, Habit tracking). */
export function habitStatus(results: boolean[]): { passes: number; of: number; graduated: boolean; trend: boolean } {
  const last = results.slice(-10);
  const passes = last.filter(Boolean).length;
  return { passes, of: last.length, graduated: last.length >= 10 && passes >= 8, trend: results.length >= 5 };
}
