import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import { StoreProvider } from "../data/store";
import { registry } from "../screens/registry";

const render = (id: string, store = mockStore) => renderToStaticMarkup(createElement(StoreProvider, { store, children: createElement(registry[id]) }));
const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ");

describe("the Practicing for switcher", () => {
  it("shows the active target in the sidebar of every app screen, and Settings goes to You", () => {
    for (const id of ["2-1-home", "5-1-stories", "6-1-applications", "7-1-progress-habits", "8-2-settings-practice", "9-1-feedback"]) {
      const html = render(id);
      expect(text(html), id).toContain("Practicing for B2C lifecycle");
      expect(html, id).toContain('href="#/8-1-settings-you"');
    }
  });
  it("is hidden before any target exists (setup)", () => {
    const html = render("8-2-settings-practice", { ...mockStore, targets: [], activeTarget: undefined });
    expect(html).not.toContain("Practicing for");
  });
});

describe("Settings sections", () => {
  it("list You and Targets where Profile was", () => {
    const html = render("8-2-settings-practice");
    expect(html).toContain('href="#/8-1-settings-you"');
    expect(html).toContain('href="#/8-2-settings-targets"');
    expect(text(html)).not.toContain("Profile");
  });
  it("keep the old Profile route as You", () => {
    expect(text(render("8-1-settings-profile"))).toContain("Goes with you to every target.");
    expect(text(render("8-1-settings-you"))).toContain("Focus habits");
  });
});

describe("Settings, Targets", () => {
  const html = text(render("8-2-settings-targets"));
  it("lists each target with its readiness and the ways to act on it", () => {
    for (const s of ["B2C lifecycle", "B2B marketing ops", "Practicing now", "Practice for this", "+ Add a target", "Duplicate", "Pitch not practiced yet", "Lead stories verified"]) expect(html).toContain(s);
  });
  it("shows an archived target with Restore and what it keeps", () => {
    const store = { ...mockStore, targets: [...mockStore.targets, { ...mockStore.targets[0], id: "tg_old", name: "Agency lifecycle", archived: true }] };
    const out = text(render("8-2-settings-targets", store));
    expect(out).toContain("Agency lifecycle");
    expect(out).toContain("Restore");
  });
});

describe("the target editor", () => {
  it("opens blank for a new target with every field of the contract", () => {
    const html = text(render("8-3-target-editor"));
    for (const s of ["New target", "Target name", "Role you're going for", "Kind of role", "Seniority", "Industry", "Sells to", "Company stage", "Your pitch, in one sentence", "What you lead with", "Stories for this target", "Usual interview stages", "Base resume", "Pay you're aiming for", "Save target"]) expect(html).toContain(s);
    expect(html).not.toContain("Archive this target");
  });
});

describe("the upgrade note", () => {
  it("says what happened and offers the two ways on", () => {
    const html = text(render("1-8-upgrade-note"));
    for (const s of ["Practice for more than one kind of job", "Your profile is now your first target", "Stays with you", "Belongs to each target", "Name your first target", "Add another target", "Got it"]) expect(html).toContain(s);
  });
});

describe("the words on the new screens", () => {
  it("have no exclamation marks, em dashes or words the user should never see", () => {
    for (const id of ["8-1-settings-you", "8-2-settings-targets", "8-3-target-editor", "1-8-upgrade-note", "2-3-start-a-session"]) {
      const out = text(render(id));
      expect(out, id).not.toMatch(/!|—/);
      expect(out, id).not.toMatch(/\b(STAR|CAAR|rubric|criterion|criteria|score|fail)\b/i);
    }
  });
  it("name the target and where the application is filed on Start a session", () => {
    const out = text(render("2-3-start-a-session"));
    expect(out).toContain("Practicing for B2C lifecycle");
    expect(out).toContain("filed under B2C lifecycle");
  });
});
