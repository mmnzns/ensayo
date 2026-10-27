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
    expect(drill).toContain("across 1 question");
    const debrief = render("4-4-session-results-mock-debrief", store);
    expect(debrief).toContain("All matched");
    expect(debrief).toContain("No answers to show yet.");
  });

  it("says what each debrief tile counted, and the drill's best answer and carry say why", () => {
    const debrief = render("4-4-session-results-mock-debrief");
    expect(debrief).toContain("Held: no check missed on the follow-up answer.");
    expect(debrief).toContain("Answers that said a number from your stories.");
    expect(debrief).toContain("earlier stages and the resume");
    const drill = render("4-3-session-results-drill");
    expect(drill).toContain("Picked because it missed the fewest checks");
    expect(drill).toContain("You kept going 14 seconds on average after your number.");
    expect(drill).toContain("Your focus this session");
  });

  it("says when the app picked the habit, leaves out a missing point time, and names the focus on a miss", () => {
    const d = mockStore.screens.results.drill;
    const store: Store = {
      ...mockStore,
      screens: {
        ...mockStore.screens,
        results: {
          ...mockStore.screens.results,
          drill: { ...d, kind: "flags", focusHabitId: "numbers", focusIsYours: false, questions: [{ id: "q1", firstTry: 0, bestTry: 0, tries: 3 }], bestAnswer: { ...d.bestAnswer, pointAtSeconds: null }, nextTime: { habitId: "ownership", evidence: "Missed on 3 of 5 first tries this session.", advice: "Say it." } },
          debrief: { ...mockStore.screens.results.debrief, followUps: { held: 0, of: 0 }, numbers: { said: 0, of: 0 } },
        },
      },
    };
    const drill = render("4-3-session-results-drill", store);
    expect(drill).toContain("Most missed this session");
    expect(drill).not.toContain("Point at 0:00");
    expect(drill).toContain("Saying my numbers: missed on all 3 tries");
    expect(drill).toContain("Missed on 3 of 5 first tries this session.");
    expect(drill).not.toContain("You kept going");
    const debrief = render("4-4-session-results-mock-debrief", store);
    expect(debrief).toContain("None this time");
    expect(debrief).toContain("None to check");
    expect(debrief).not.toContain("0 of 0");
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
