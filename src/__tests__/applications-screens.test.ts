import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import { StoreProvider, type Store } from "../data/store";
import { registry } from "../screens/registry";

const IDS = [
  "6-1-applications",
  "6-2-new-application",
  "6-3-application-overview",
  "6-4-application-edit-details",
  "6-5-application-the-resume-you-sent",
  "6-6-application-stages-and-night-before",
  "6-7-cue-sheet",
  "6-8-application-what-you-ve-said",
  "applications-questions",
];

const render = (id: string, store: Store) => renderToStaticMarkup(createElement(StoreProvider, { store, children: createElement(registry[id]) }));
const strip = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

describe("applications screens", () => {
  it.each(IDS)("%s renders with no applications at all", (id) => {
    const empty: Store = { ...mockStore, applications: [] };
    const html = render(id, empty);
    expect(html.length).toBeGreaterThan(100);
    for (const bad of ["undefined", "NaN", "[object Object]"]) expect(html).not.toContain(bad);
  });

  it("the list follows the store: names, counts and the next-up card", () => {
    const apps = mockStore.applications.filter((a) => a.id !== "app_northpine");
    const text = strip(render("6-1-applications", { ...mockStore, applications: apps }));
    expect(text).toContain("Active · 4");
    expect(text).not.toContain("Northpine");
    expect(text).toContain("Kestrel Pay · Hiring manager");
    expect(text).toContain("In 2 days");
    expect(text).toContain("Applied Oct 6");
  });

  it("detail screens show the featured application, so a renamed one shows the new name", () => {
    const apps = mockStore.applications.map((a) => (a.id === "app_kestrel" ? { ...a, company: "Heronpay" } : a));
    for (const id of ["6-3-application-overview", "6-5-application-the-resume-you-sent", "6-6-application-stages-and-night-before", "6-8-application-what-you-ve-said", "applications-questions"]) {
      const text = strip(render(id, { ...mockStore, applications: apps }));
      expect(text, id).toContain("Heronpay");
      // The claims log keeps "Why Kestrel Pay" as a subject in the sample data; everything else follows the store.
      expect(text.replace("Why Kestrel Pay", ""), id).not.toContain("Kestrel Pay");
    }
  });

  it("the questions screen has 8 to 12 sample questions with plain-word types", () => {
    const qs = mockStore.screens.applications.byApp.app_kestrel.questions;
    expect(qs.length).toBeGreaterThanOrEqual(8);
    expect(qs.length).toBeLessThanOrEqual(12);
    const labels = mockStore.screens.applications.questionTypes.map((t) => t.label);
    expect(labels).toEqual(["Behavioral", "Tell me about yourself", "Technical", "Factual", "Future looking", "Gap", "Motivation"]);
  });

  it("copy follows the house rules: no em dashes, no framework names", () => {
    for (const id of IDS) {
      const text = strip(render(id, mockStore));
      expect(text, id).not.toMatch(/—|\bSTAR\b|\bCAAR\b|\bPREP\b/);
      expect(text, id).not.toMatch(/rubric|criterion/i);
    }
  });
});
