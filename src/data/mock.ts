import { applications } from "./mock/applications";
import { habits } from "./mock/habits";
import { engine, homeHabitStats, profile, streak, targets, you } from "./mock/profile";
import { sessions } from "./mock/sessions";
import { methods, stories } from "./mock/stories";
import { applicationsData } from "./screens/applications";
import { firstRunData } from "./screens/first-run";
import { homeData } from "./screens/home";
import { practiceData } from "./screens/practice";
import { resultsData } from "./screens/results";
import { settingsData } from "./screens/settings";
import { statesData } from "./screens/states";
import { storiesData } from "./screens/stories";
import type { Store } from "./store";

/** Wednesday evening, October 21: the moment the design shows. */
export const MOCK_NOW = new Date("2026-10-21T21:30:00");

export const mockStore: Store = {
  now: () => MOCK_NOW,
  profile,
  you,
  targets,
  activeTarget: targets[0],
  habits,
  stories,
  methods,
  applications,
  sessions,
  engine,
  streak,
  homeHabitStats,
  screens: {
    firstRun: firstRunData,
    home: homeData,
    practice: practiceData,
    results: resultsData,
    stories: storiesData,
    applications: applicationsData,
    settings: settingsData,
    states: statesData,
  },
};
