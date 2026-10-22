import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { TIMING_ONLY } from "../data/engine";
import { mockStore } from "../data/mock";
import { StoreProvider, type Store } from "../data/store";
import { BLANK_PROFILE } from "../data/real";
import type { RepApi } from "../practice/api";
import { resetLive, setRepApi } from "../practice/live";
import { registry } from "../screens/registry";
import { habitCount, showEngineNudge, showFirstHome } from "../screens/home/state";

const render = (id: string, store: Store) => renderToStaticMarkup(createElement(StoreProvider, { store, children: createElement(registry[id]) }));

/** What the app serves a brand-new user: their profile, nothing else. */
const fresh: Store = {
  ...mockStore,
  profile: { ...BLANK_PROFILE, name: "Sam", targetRole: "Product manager" },
  stories: [],
  applications: [],
  sessions: [],
  streak: { daysInARow: 0, answers: 0, questions: 0, followUps: 0 },
  homeHabitStats: [],
  engine: TIMING_ONLY,
};

afterEach(() => {
  setRepApi(null);
  resetLive();
});

describe("which Home", () => {
  it("is the welcome in the app until something has been practised", () => {
    expect(showFirstHome(true, 0)).toBe(true);
    expect(showFirstHome(true, 3)).toBe(false);
    expect(showFirstHome(false, 0)).toBe(false);
  });

  it("nudges toward an engine in the browser, and in the app only while it is timing only", () => {
    expect(showEngineNudge(false, mockStore.engine)).toBe(true);
    expect(showEngineNudge(true, TIMING_ONLY)).toBe(true);
    expect(showEngineNudge(true, { label: "Built-in model", kind: "local", offline: false })).toBe(false);
    expect(showEngineNudge(true, { label: "Claude Sonnet 5.5", kind: "key", offline: false })).toBe(false);
  });

  it("counts a habit in plain words, even with no answers", () => {
    expect(habitCount(7, 10)).toBe("7 of your last 10");
    expect(habitCount(0, 0)).toBe("No answers yet");
  });
});

describe("Home for a brand-new user in the app", () => {
  const api = { aiReady: async () => true } as unknown as RepApi;

  it("shows the welcome with their name, and none of the sample", () => {
    setRepApi(api);
    const html = render("2-1-home", fresh);
    expect(html).toContain("Welcome, Sam");
    expect(html).toContain("product manager");
    for (const sample of ["Dana", "Ortiz", "Kestrel", "Fernhill", "Lifecycle", "Yesterday", "4 days in a row", "3 fixes stuck"]) expect(html, sample).not.toContain(sample);
  });

  it("offers the engine nudge only while feedback is timing only", () => {
    setRepApi(api);
    expect(render("2-1-home", fresh)).toContain("Add an engine");
    expect(render("2-1-home", { ...fresh, engine: { label: "Built-in model", kind: "local", offline: false } })).not.toContain("Add an engine");
  });

  it("shows Home as before once there is a session", () => {
    setRepApi(api);
    const html = render("2-1-home", { ...fresh, sessions: [{ id: "s1", when: "Today, 9:00 AM", group: "This week", mode: "drill", title: "Hiring manager · 3 answers", headline: "One fix landed" }], streak: { daysInARow: 1, answers: 3, questions: 3, followUps: 0 } });
    expect(html).toContain("Good ");
    expect(html).toContain("Last session");
    expect(html).toContain("1 day in a row");
    expect(html).not.toContain("Welcome, Sam");
  });

  it("is unchanged in the browser preview", () => {
    const html = render("2-1-home", mockStore);
    expect(html).toContain("Good evening, Dana");
    expect(html).toContain("4 days in a row");
  });
});

describe("setup screens in the browser preview", () => {
  it("About you asks for a first name and keeps the sample prefill", () => {
    const html = render("1-2-about-you", mockStore);
    expect(html).toContain("First name");
    expect(html).toContain(mockStore.profile.name);
    expect(html).toContain(mockStore.profile.targetRole);
  });

  it("About you starts blank for a new user", () => {
    const html = render("1-2-about-you", fresh);
    expect(html).toContain("First name");
    expect(html).not.toContain("Dana");
    expect(html).not.toContain("Lifecycle");
  });

  it("What to work on starts with nothing picked for a new user", () => {
    expect(render("1-3-what-to-work-on", fresh)).toContain("0 of 2 picked");
  });

  it("the loop card still goes to Home and to more practice", () => {
    const html = render("first-run-loop", mockStore);
    expect(html).toContain("Go to Home");
    expect(html).toContain("Practice another");
  });

  it("no setup line carries an exclamation mark or an em dash", () => {
    for (const id of ["1-2-about-you", "1-3-what-to-work-on", "1-4-microphone", "1-5-speech", "1-6-feedback-engine", "1-7-your-first-story", "first-run-loop"]) {
      const text = render(id, fresh).replace(/<[^>]*>/g, " ");
      expect(text, id).not.toContain("!");
      expect(text, id).not.toContain("—");
    }
  });
});
