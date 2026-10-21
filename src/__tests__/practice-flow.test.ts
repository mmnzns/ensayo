import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import { clock } from "../data/screens/practice";
import { StoreProvider, type Store } from "../data/store";
import { registry } from "../screens/registry";
import { getAttempt, isFollowUp, nextAttempt, resetFlow, resultAfterThinking, setAttempt, setFollowUp } from "../screens/practice/practiceFlow";

const html = (id: string, store: Store = mockStore) => renderToStaticMarkup(createElement(StoreProvider, { store, children: createElement(registry[id]) }));

describe("practice flow", () => {
  it("walks attempt 1, 2, 3 through the right results", () => {
    resetFlow();
    expect(resultAfterThinking()).toBe("3-4-result-attempt-1-details-open");
    nextAttempt();
    expect(resultAfterThinking()).toBe("3-5-result-attempt-2");
    nextAttempt();
    nextAttempt();
    expect(getAttempt()).toBe(3);
    expect(resultAfterThinking()).toBe("3-8-result-everything-worked");
  });

  it("a follow-up lands on the last result, and a new question resets everything", () => {
    setAttempt(1);
    setFollowUp(true);
    expect(resultAfterThinking()).toBe("3-8-result-everything-worked");
    resetFlow();
    expect(getAttempt()).toBe(1);
    expect(isFollowUp()).toBe(false);
  });

  it("formats clock times", () => {
    expect(clock(41)).toBe("0:41");
    expect(clock(64)).toBe("1:04");
  });
});

describe("practice screens read the store", () => {
  it("shows the question and progress from the data", () => {
    const other: Store = {
      ...mockStore,
      screens: { ...mockStore.screens, practice: { ...mockStore.screens.practice, question: "Walk me through a hard call.", session: { ...mockStore.screens.practice.session, position: 4, total: 8 } } },
    };
    const out = html("3-1-practice-interviewer-asking", other);
    expect(out).toContain("Walk me through a hard call.");
    expect(out).toContain("4 of 8");
    expect(out).toContain("width:50%");
  });

  it("starts Details open on attempt 1 and closed on attempt 2", () => {
    expect(html("3-4-result-attempt-1-details-open")).toContain("Filler words");
    expect(html("3-5-result-attempt-2")).not.toContain("Filler words");
  });

  it("does not crash with no attempts", () => {
    const empty: Store = { ...mockStore, screens: { ...mockStore.screens, practice: { ...mockStore.screens.practice, attempts: [] } } };
    for (const id of ["3-3-practice-thinking", "3-4-result-attempt-1-details-open", "3-5-result-attempt-2", "3-8-result-everything-worked"]) expect(html(id, empty).length).toBeGreaterThan(100);
  });

  it("the Mock follow-up shows the Mock label and no timer or notes", () => {
    const out = html("practice-mock-follow-up");
    expect(out).toContain("Mock");
    expect(out).toContain("Like the real thing: no notes until the end.");
    expect(out).not.toContain("Coach's note");
  });
});
