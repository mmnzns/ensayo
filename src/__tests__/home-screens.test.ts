import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import { StoreProvider, type Store } from "../data/store";
import { allScreens, registry } from "../screens/registry";

const ids = ["2-1-home", "2-2-home-empty", "2-3-start-a-session", "home-offline", "home-session-no-questions"];
const known = new Set(allScreens.map((s) => s.id));

function render(id: string, store: Store = mockStore): string {
  return renderToStaticMarkup(createElement(StoreProvider, { store, children: createElement(registry[id]) }));
}
const at = (iso: string): Store => ({ ...mockStore, now: () => new Date(iso) });

describe("home screens", () => {
  it.each(ids)("%s renders and its links go somewhere", (id) => {
    const html = render(id);
    for (const bad of ["undefined", "NaN", "[object Object]", "href=\"#\""]) expect(html, bad).not.toContain(bad);
    for (const m of html.matchAll(/href="([^"]*)"/g)) {
      if (/^(https?:|mailto:)/.test(m[1])) continue;
      expect(known.has(m[1].replace(/^#\//, "")), `${id}: ${m[1]}`).toBe(true);
    }
  });

  it("Home reads the store: greeting, next interview, focus", () => {
    const html = render("2-1-home");
    expect(html).toContain("Good evening, Dana");
    expect(html).toContain("Kestrel Pay");
    expect(html).toContain("Hiring manager · Friday, 2:00 PM");
    expect(html).toContain("In 2 days");
    expect(html).toContain("Practice this stage");
    expect(html).toContain("Passed 7 of your last 10 first tries");
    expect(html).toContain("4 days in a row");
  });

  it("the Next interview button follows the timing", () => {
    expect(render("2-1-home", at("2026-10-22T09:00:00"))).toContain("Lock your night-before set");
    expect(render("2-1-home", at("2026-10-23T09:00:00"))).toContain("Open cue sheet");
    expect(render("2-1-home", at("2026-10-23T09:00:00"))).toContain("Today");
  });

  it("Home survives no interview, no focus stats and no last session", () => {
    const store: Store = {
      ...mockStore,
      applications: [],
      homeHabitStats: [],
      screens: { ...mockStore.screens, home: { ...mockStore.screens.home, lastSession: null } },
    };
    const html = render("2-1-home", store);
    expect(html).not.toContain("Next interview");
    expect(html).not.toContain("Last session");
    expect(html).toContain("Practice");
    render("2-3-start-a-session", store);
  });

  it("offline Home shows the timing-only chip and the notice", () => {
    const html = render("home-offline");
    expect(html).toContain("Timing only");
    expect(html).toContain("offline");
    expect(html).toContain("Practice still works");
  });

  it("Start a session lists the stories and a stage line", () => {
    const html = render("2-3-start-a-session");
    expect(html).toContain("Onboarding drop-off");
    expect(html).toContain("What the hiring manager stage is like");
    expect(html).toContain("Focus this session");
    expect(html).toContain("getting to the point");
  });
});
