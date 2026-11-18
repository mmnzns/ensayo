import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ComponentType } from "react";
import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import { StoreProvider } from "../data/store";
import ResultPill from "../screens/stories/ResultPill";
import Stories from "../screens/stories/Stories";
import StoriesEmpty from "../screens/stories/StoriesEmpty";
import AddManyStories from "../screens/stories/AddManyStories";

describe("the result pill", () => {
  it("puts a Result label in front of a before and after", () => {
    const html = renderToStaticMarkup(createElement(ResultPill, { headline: "$60 → $22" }));
    expect(html).toMatch(/Result<\/span><span class="e-pill"/);
    expect(html).toContain("$60 → $22");
  });
  it("leaves a plain headline as it was, with no label", () => {
    const html = renderToStaticMarkup(createElement(ResultPill, { headline: "Led five engineers" }));
    expect(html).not.toContain("Result");
  });
  it("renders nothing for no headline", () => {
    expect(renderToStaticMarkup(createElement(ResultPill, { headline: "" }))).toBe("");
  });
});

describe("the bulk entry points", () => {
  const wrap = (c: ComponentType) => renderToStaticMarkup(createElement(StoreProvider, { store: mockStore, children: createElement(c) }));
  it("shows Add many at once on the list and the empty state", () => {
    expect(wrap(Stories)).toContain("Add many at once");
    expect(wrap(StoriesEmpty)).toContain("Add many at once");
    expect(wrap(Stories)).toContain("#/5-6-add-many-stories");
  });
  it("opens on the paste box with nothing read or saved", () => {
    const html = wrap(AddManyStories);
    expect(html).toContain("Add many stories");
    expect(html).toContain("Find the stories");
    expect(html).not.toContain("Save all checked");
    expect(html).not.toMatch(/—/);
  });
});
