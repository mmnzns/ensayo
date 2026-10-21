import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import { StoreProvider } from "../data/store";
import { allScreens, registry } from "../screens/registry";

const render = (id: string) => renderToStaticMarkup(createElement(StoreProvider, { store: mockStore, children: createElement(registry[id]) }));
const links = (html: string) => [...html.matchAll(/href="#\/([^"]*)"/g)].map((m) => m[1]);

describe("first run flow", () => {
  it("every link on these screens goes to a real screen", () => {
    const known = new Set(allScreens.map((s) => s.id));
    for (const id of [...Array.from({ length: 7 }, (_, i) => allScreens[i].id), "first-run-loop"]) {
      for (const m of render(id).matchAll(/href="([^"]*)"/g)) {
        expect(m[1].startsWith("#/"), `${id}: ${m[1]}`).toBe(true);
        expect(known.has(m[1].slice(2)), `${id}: ${m[1]}`).toBe(true);
      }
    }
  });

  it("registers the loop card as an extra screen", () => {
    const e = allScreens.find((s) => s.id === "first-run-loop");
    expect(e).toMatchObject({ group: "first-run", shell: "focus", name: "ThatsTheLoop", designed: false });
  });

  it("chains Welcome to the first story and on to practice", () => {
    expect(links(render("1-1-welcome"))).toContain("1-2-about-you");
    expect(links(render("1-2-about-you"))).toEqual(expect.arrayContaining(["1-1-welcome", "1-3-what-to-work-on"]));
    expect(links(render("1-6-feedback-engine"))).toEqual(expect.arrayContaining(["1-5-speech", "1-7-your-first-story"]));
    expect(links(render("1-7-your-first-story"))).toEqual(expect.arrayContaining(["5-3-add-a-story-review", "3-1-practice-interviewer-asking", "2-1-home"]));
  });

  it("does not let the microphone step be skipped", () => {
    expect(render("1-4-microphone")).not.toContain(">Skip<");
    for (const id of ["1-2-about-you", "1-3-what-to-work-on", "1-5-speech", "1-6-feedback-engine", "1-7-your-first-story"]) expect(render(id)).toContain(">Skip<");
  });

  it("prefills from the profile and habits", () => {
    expect(render("1-2-about-you")).toContain(mockStore.profile.targetRole);
    const html = render("1-3-what-to-work-on");
    expect(html).toContain("2 of 2 picked");
    for (const h of mockStore.habits.filter((x) => x.chip)) expect(html).toContain(h.blurb!.replace(/"/g, "&quot;").replace(/'/g, "&#x27;"));
  });

  it("ends the loop card on Home with a quiet way to practice again", () => {
    const html = render("first-run-loop");
    expect(links(html)).toEqual(expect.arrayContaining(["2-1-home", "3-1-practice-interviewer-asking"]));
    expect(html).toContain("Go to Home");
    expect(html).not.toContain("!");
    expect(html).not.toContain("—");
  });
});
