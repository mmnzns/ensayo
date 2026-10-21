import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import { StoreProvider } from "../data/store";
import { allScreens, registry, stubIds } from "../screens/registry";

const ids = allScreens.map((s) => s.id);
const known = new Set([...ids, "m0"]);
const EXTERNAL = /^(https?:|mailto:)/;

function render(id: string): string {
  const Screen = registry[id];
  return renderToStaticMarkup(createElement(StoreProvider, { store: mockStore, children: createElement(Screen) }));
}

describe("every screen renders", () => {
  it("has no unbuilt stubs", () => {
    expect(stubIds).toEqual([]);
  });

  it.each(ids)("%s renders cleanly", (id) => {
    const html = render(id);
    expect(html.length).toBeGreaterThan(200);
    for (const bad of ["undefined", "NaN", "[object Object]", "fonts.googleapis.com"]) expect(html, bad).not.toContain(bad);
  });

  it("every link goes to a real screen or out to the browser or email", () => {
    for (const id of ids) {
      for (const m of render(id).matchAll(/href="([^"]*)"/g)) {
        const href = m[1];
        if (EXTERNAL.test(href)) continue;
        expect(href.startsWith("#/"), `${id} has a link that is not a screen: ${href}`).toBe(true);
        expect(known.has(href.slice(2)), `${id} links to an unknown screen: ${href}`).toBe(true);
      }
    }
  });

  it("external links open outside the app", () => {
    for (const id of ids) {
      for (const m of render(id).matchAll(/<a [^>]*href="(https?:[^"]*)"[^>]*>/g)) {
        expect(m[0], `${id}: ${m[1]}`).toContain('target="_blank"');
      }
    }
  });
});
