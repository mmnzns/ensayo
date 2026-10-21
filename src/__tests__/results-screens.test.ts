import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import { StoreProvider, type Store } from "../data/store";
import { routes } from "../screens/results";

const ids = ["4-1-mock-in-progress", "4-2-mock-your-questions", "4-3-session-results-drill", "4-4-session-results-mock-debrief", "4-5-habit-graduation"];

function render(id: string, store: Store = mockStore): string {
  return renderToStaticMarkup(createElement(StoreProvider, { store, children: createElement(routes[id]) }));
}

describe("results screens", () => {
  it("builds all five and no extras are needed", () => {
    for (const id of ids) expect(routes[id], id).toBeTruthy();
  });

  it("draws the Drill hero from the numbers", () => {
    const html = render("4-3-session-results-drill");
    expect(html).toContain("38s → 9s");
    expect(html).toContain("across 5 questions");
  });

  it("changes with the data", () => {
    const store: Store = {
      ...mockStore,
      screens: {
        ...mockStore.screens,
        results: {
          ...mockStore.screens.results,
          drill: { ...mockStore.screens.results.drill, questions: [{ id: "q1", firstTry: 20, bestTry: 10 }] },
          debrief: { ...mockStore.screens.results.debrief, rows: [], mustSay: [], flags: [] },
        },
      },
    };
    const drill = render("4-3-session-results-drill", store);
    expect(drill).toContain("20s → 10s");
    expect(drill).toContain("across 1 questions");
    const debrief = render("4-4-session-results-mock-debrief", store);
    expect(debrief).toContain("All matched");
    expect(debrief).toContain("No answers to show yet.");
  });

  it("graduation uses the habit labels and status", () => {
    const html = render("4-5-habit-graduation");
    expect(html).toContain("Getting to the point");
    expect(html).toContain("8 of your last 10 answers");
    expect(html).toContain("Saying what I decided");
    expect(html).toContain("Saying my numbers");
    expect(html).toContain("Fewer filler words");
  });
});
