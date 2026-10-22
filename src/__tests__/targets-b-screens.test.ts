import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import { StoreProvider, type Store } from "../data/store";
import { registry } from "../screens/registry";

const render = (id: string, store: Store = mockStore) => renderToStaticMarkup(createElement(StoreProvider, { store, children: createElement(registry[id]) }));
const strip = (html: string) =>
  html
    .replace(/<style>[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

const COPPER = mockStore.applications.find((a) => a.id === "app_copperleaf")!;
const only = (store: Store, id: string, targetId = "tg_b2c"): Store => ({
  ...store,
  screens: { ...store.screens, applications: { ...store.screens.applications, featuredId: id } },
  applications: store.applications.map((a) => (a.id === id ? { ...a, targetId } : a)),
});

describe("the application list and targets", () => {
  it("offers the target filter, shows each row's target and flags a posting that fits another target", () => {
    const html = render("6-1-applications");
    const text = strip(html);
    expect(html).toContain('aria-label="Target"');
    expect(text).toContain("All targets");
    expect(text).toContain("B2B marketing ops");
    expect(text).toContain("Check the target");
  });
  it("shows no target filter or markers with one target", () => {
    const one: Store = { ...mockStore, targets: [mockStore.targets[0]] };
    const html = render("6-1-applications", one);
    expect(html).not.toContain('aria-label="Target"');
    // The sidebar names the active target; the page itself should not.
    expect(strip(html).split("Everything you've applied to")[1]).not.toContain("B2C lifecycle");
  });
});

describe("new application and edit details", () => {
  it("picks a target, says it is a suggestion, and starts the stages from the target", () => {
    const text = strip(render("6-2-new-application"));
    expect(text).toContain("Target B2C lifecycle B2B marketing ops");
    expect(text).toContain("Suggested from the role you typed. Once Ensayo reads the posting, it tells you if another target fits better.");
  });
  it("starts the stages from the target in the app, with no sample data", () => {
    const blank = { ...mockStore, screens: { ...mockStore.screens, applications: { ...mockStore.screens.applications, newApplication: { ...mockStore.screens.applications.newApplication, company: "", role: "", postingText: "", stages: [] } } } };
    expect(strip(render("6-2-new-application", blank))).toContain("Started from B2C lifecycle's usual stages.");
  });
  it("edit details has the target picker", () => {
    const text = strip(render("6-4-application-edit-details"));
    expect(text).toContain("Target B2C lifecycle B2B marketing ops");
  });
});

describe("the application overview", () => {
  it("shows the target in the header and the fit banner with its three ways out", () => {
    const store = only(mockStore, "app_copperleaf");
    const html = render("6-3-application-overview", store);
    const text = strip(html);
    expect(text).toContain("target: B2C lifecycle");
    expect(text).toContain("This posting is B2B. It's filed under B2C lifecycle.");
    expect(text).toContain("Move to B2B marketing ops");
    expect(text).toContain("Make a new target from this posting");
    expect(text).toContain("Keep B2C lifecycle");
    expect(html).toContain(`href="#/6-10-new-target-from-posting?app=${COPPER.id}"`);
  });
  it("shows no banner once the application is under the target that fits", () => {
    const text = strip(render("6-3-application-overview", only(mockStore, "app_copperleaf", "tg_b2b")));
    expect(text).not.toContain("This posting is");
    expect(text).toContain("target: B2B marketing ops");
  });
});

describe("a new target from a posting", () => {
  it("shows the prefilled target, the copied pitch and the warning that Ensayo will not write it", () => {
    const store = only(mockStore, "app_copperleaf");
    const text = strip(render("6-10-new-target-from-posting", store));
    expect(text).toContain("New target from the Copperleaf posting");
    expect(text).toContain("Target name");
    expect(text).toContain("Usual stages");
    expect(text).toContain("copied from B2B marketing ops");
    expect(text).toContain("Ensayo won't write it for you");
    expect(text).toContain("Create and move Copperleaf");
  });
});

describe("story angles", () => {
  it("has the two tabs, one card per target and the live number check", () => {
    const html = render("5-5-story-angles");
    const text = strip(html);
    expect(text).toContain("Story Angles · 2");
    expect(text).toContain("B2C lifecycle");
    expect(text).toContain("B2B marketing ops");
    expect(text).toContain("Numbers match the story");
    expect(text).toContain("Be ready to go deeper on");
    expect(text).toContain("Numbers · shared by every angle");
    expect(text).toContain("It never changes the numbers.");
  });
  it("says a target has no angle yet", () => {
    const stories = mockStore.stories.map((s, i) => (i === 0 ? { ...s, angles: [s.angles![0]] } : s));
    const text = strip(render("5-5-story-angles", { ...mockStore, stories }));
    expect(text).toContain("No angle yet");
    expect(text).toContain("Targets without an angle use the story's own headline.");
    expect(text).toContain("Angles · 1");
  });
  it("blocks Save and names the number when an opening sentence has one the story does not", () => {
    const stories = mockStore.stories.map((s, i) => (i === 0 ? { ...s, angles: [{ ...s.angles![0], headline: "Activation went from 31 to 52 percent." }, s.angles![1]] } : s));
    const html = render("5-5-story-angles", { ...mockStore, stories });
    expect(strip(html)).toContain("The opening sentence for B2C lifecycle says 52%, which is not one of this story's numbers.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save angles/);
  });
  it("the story screen has the same tabs", () => {
    expect(strip(render("5-4-story"))).toContain("Story Angles · 2");
  });
});

describe("progress and sessions by target", () => {
  it("progress has the target filter, a card per target, and habits named as across all targets", () => {
    const text = strip(render("7-1-progress-habits"));
    expect(text).toContain("All targets");
    expect(text).toContain("Ready for each target?");
    expect(text).toContain("Practicing now");
    expect(text).toContain("Your habits · across all targets");
    expect(text).toContain("How you deliver goes with you to every job.");
    expect(text).toMatch(/Practice the pitch/);
  });
  it("sessions has the target filter and a target on each row", () => {
    const html = render("7-2-progress-sessions");
    const text = strip(html);
    expect(html).toContain('aria-label="Target"');
    expect(text).toContain("All targets");
    expect(text).toContain("Hiring manager · Kestrel Pay B2C lifecycle");
  });
});
