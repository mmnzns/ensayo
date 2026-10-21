import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import { StoreProvider } from "../data/store";
import { allScreens, registry } from "../screens/registry";

const states = allScreens.filter((s) => s.group === "states");

function render(id: string): string {
  return renderToStaticMarkup(createElement(StoreProvider, { store: mockStore, children: createElement(registry[id]) }));
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

describe("states group", () => {
  it("registers all 16 screens as undesigned focus routes with the states- prefix", () => {
    expect(states.length).toBe(16);
    for (const s of states) {
      expect(s.id.startsWith("states-"), s.id).toBe(true);
      expect(s.shell).toBe("focus");
      expect(s.designed).toBe(false);
      expect(s.name).toMatch(/^[A-Z][A-Za-z]+$/);
    }
  });

  it.each(states.map((s) => s.id))("%s follows the copy rules", (id) => {
    const t = text(render(id));
    expect(t, "exclamation").not.toContain("!");
    expect(t, "em dash").not.toContain("—");
    expect(t, "banned word").not.toMatch(/\b(rubric|criteri(on|a)|scores?|scored|fail(s|ed|ure)?|STAR|CAAR|CAR|PREP)\b/i);
  });

  it("dialogs are modal dialogs with a title", () => {
    for (const s of states.filter((x) => registry[x.id] && render(x.id).includes('role="dialog"'))) {
      const html = render(s.id);
      expect(html, s.id).toContain('aria-modal="true"');
      expect(html, s.id).toContain("aria-labelledby=");
      expect(html, s.id).toContain("Preview");
    }
    expect(states.filter((s) => render(s.id).includes('role="dialog"')).length).toBe(10);
  });

  it("closed reason: four radios, Save disabled until one is picked", () => {
    const html = render("states-closed-reason");
    expect((html.match(/type="radio"/g) ?? []).length).toBe(4);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Save<\/button>/);
  });

  it("delete application says where the practice goes and offers to delete it too", () => {
    const t = text(render("states-delete-application"));
    expect(t).toContain("Practice without an application");
    expect(t).toContain("Delete its practice too");
  });

  it("delete all data asks for DELETE and lists what goes", () => {
    const html = render("states-delete-all-data");
    const t = text(html);
    for (const w of ["Type DELETE to confirm", "models", "data folder", "settings", "Logs", "keys"]) expect(t.toLowerCase()).toContain(w.toLowerCase());
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Delete all Ensayo data<\/button>/);
  });

  it("night-before warning, scanned pdf, conflict, folder and lock dialogs have their buttons", () => {
    expect(text(render("states-night-before-lock-warning"))).toContain("Keep it locked");
    expect(text(render("states-night-before-lock-warning"))).toContain("Unlock and change");
    expect(text(render("states-scanned-pdf"))).toContain("Use this text");
    expect(text(render("states-scanned-pdf"))).toContain("Cancel");
    const conflict = text(render("states-sync-conflict"));
    expect((conflict.match(/Keep this one/g) ?? []).length).toBe(2);
    expect(conflict).toContain("never merges silently");
    expect(text(render("states-data-folder-missing"))).toContain("Use a local folder for now");
    expect(text(render("states-other-machine-open"))).toContain("Open anyway");
  });

  it("error pages link to the right settings screen", () => {
    expect(render("states-error-mic-denied")).toContain('href="#/8-7-settings-check-setup"');
    expect(render("states-error-no-speech-model")).toContain('href="#/8-4-settings-speech"');
    expect(render("states-error-key-rejected")).toContain('href="#/8-5-settings-ai"');
    expect(text(render("states-didnt-catch-that"))).toContain("Record again");
    expect(text(render("states-generic-error"))).toContain("Copy details");
  });
});
