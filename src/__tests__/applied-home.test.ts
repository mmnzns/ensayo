import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import { StoreProvider, type Store } from "../data/store";
import type { Application } from "../data/types";
import type { RepApi } from "../practice/api";
import { resetLive, setRepApi } from "../practice/live";
import { setSessionPreset, clearSessionPreset } from "../screens/home/preset";
import { showFirstHome } from "../screens/home/state";
import { registry } from "../screens/registry";

const render = (id: string, store: Store) => renderToStaticMarkup(createElement(StoreProvider, { store, children: createElement(registry[id]) }));
const at = (iso: string, over: Partial<Store> = {}): Store => ({ ...mockStore, now: () => new Date(iso), ...over });

/** What the app serves today before the data layer fills it: nothing practised and no applications. */
const EMPTY: Partial<Store> = { applications: [], sessions: [], homeHabitStats: [], streak: { daysInARow: 0, answers: 0, questions: 0, followUps: 0 } };

const real = (over: Partial<Application> & { id: string }): Application => ({ ...mockStore.applications[0], company: "Harbour Labs", role: "Lifecycle lead", status: "interviewing", current_stage_id: null, ...over });
const stage = (id: string, at?: string, done = false) => ({ id, stage: "hiring_manager" as const, label: "Hiring manager", order: 1, done, decides: "", sessions: 0, ...(at ? { at } : {}) });

afterEach(() => {
  setRepApi(null);
  resetLive();
  clearSessionPreset();
});

function inTheApp() {
  setRepApi({} as RepApi);
}

describe("Home in the app with no applications", () => {
  it("shows no sample company, interview or session", () => {
    inTheApp();
    for (const sessions of [[], mockStore.sessions.slice(0, 0)]) {
      const html = render("2-1-home", at("2026-10-22T09:00:00", { ...EMPTY, sessions }));
      for (const sample of ["Kestrel", "Northpine", "Marco", "Next interview", "Last session"]) expect(html, sample).not.toContain(sample);
    }
  });

  it("is the welcome until the first answer, and the full Home once there is an interview to show", () => {
    expect(showFirstHome(true, 0)).toBe(true);
    expect(showFirstHome(true, 0, true)).toBe(false);
    expect(showFirstHome(false, 0, false)).toBe(false);
    inTheApp();
    const interview = real({ id: "app_h", process: [stage("s1", "2026-10-24T14:00")] });
    const html = render("2-1-home", at("2026-10-22T09:00:00", { ...EMPTY, applications: [interview] }));
    expect(html).toContain("Next interview");
    expect(html).toContain("Harbour Labs");
    expect(html).not.toContain("Welcome");
  });
});

describe("Home with the shapes the backend sends", () => {
  const home = (a: Application, now: string) => {
    inTheApp();
    return render("2-1-home", at(now, { ...EMPTY, applications: [a], sessions: mockStore.sessions }));
  };

  it("a stage with a date and no time shows the day, not a made-up hour, and counts through that day", () => {
    const a = real({ id: "app_h", process: [stage("s1", "2026-10-23")] });
    const html = home(a, "2026-10-22T09:00:00");
    expect(html).toContain("Hiring manager · Friday");
    expect(html).not.toMatch(/Friday, \d/);
    expect(html).toContain("Lock your night-before set");
    expect(home(a, "2026-10-23T18:00:00")).toContain("Open cue sheet");
  });

  it("follows the days: practice, lock the night before, open the cue sheet on the day", () => {
    const a = real({ id: "app_h", process: [stage("s1", "2026-10-26T10:00")] });
    expect(home(a, "2026-10-22T09:00:00")).toContain("Practice this stage");
    expect(home(a, "2026-10-25T20:00:00")).toContain("Lock your night-before set");
    expect(home(a, "2026-10-26T08:00:00")).toContain("Open cue sheet");
  });

  it("shows no interview card for an application with no dated open stage", () => {
    const html = home(real({ id: "app_h", process: [stage("s1"), stage("s2", "2026-10-20T10:00", true)] }), "2026-10-22T09:00:00");
    expect(html).not.toContain("Next interview");
  });

  it("ignores a closed application's date", () => {
    const html = home(real({ id: "app_h", status: "closed", process: [stage("s1", "2026-10-24T10:00")] }), "2026-10-22T09:00:00");
    expect(html).not.toContain("Next interview");
  });
});

describe("Start a session from an application", () => {
  const start = (apps: Application[]) => {
    inTheApp();
    return render("2-3-start-a-session", at("2026-10-22T09:00:00", { ...EMPTY, applications: apps }));
  };
  const mine = real({ id: "app_h", analysis: mockStore.applications[0].analysis, process: [stage("s1", "2026-10-26T10:00")] });
  const other = real({ id: "app_o", company: "Otter Bank", analysis: mockStore.applications[0].analysis, process: [stage("o1", "2026-10-30T10:00")] });

  it("offers the nearest interview, with its day", () => {
    const html = start([other, mine]);
    expect(html).toContain("Harbour Labs");
    expect(html).toContain("Hiring manager stage");
    expect(html).not.toContain("Otter Bank");
  });

  it("offers the application a button asked for", () => {
    setSessionPreset({ source: "application", applicationId: "app_o", stageId: "o1" });
    expect(start([mine, other])).toContain("Otter Bank");
  });

  it("offers an open application with nothing dated, with no day badge", () => {
    const html = start([real({ id: "app_u", company: "Undated Inc", process: [stage("u1")] })]);
    expect(html).toContain("Undated Inc");
  });

  it("offers no application row with no applications", () => {
    const html = start([]);
    expect(html).not.toContain("Harbour");
    expect(html).toContain("A stage");
  });

  it("with no posting and no questions yet, Start leads to the page that says so", () => {
    const html = start([real({ id: "app_n", analysis: null, process: [stage("n1", "2026-10-26T10:00")] })]);
    expect(html).toContain('href="#/home-session-no-questions"');
  });
});
