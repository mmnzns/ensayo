import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import { StoreProvider } from "../data/store";
import AddAStoryReview from "../screens/stories/AddAStoryReview";
import { setBlankReview } from "../screens/stories/selection";

describe("the add a story review step", () => {
  it("holds every sentence in a text box and keeps only short things on one line", () => {
    setBlankReview(true);
    const html = renderToStaticMarkup(createElement(StoreProvider, { store: mockStore, children: createElement(AddAStoryReview) }));
    setBlankReview(false);
    expect(html).toMatch(/<textarea id="ow" class="e-input" rows="2"/);
    for (const id of ["h", "ctx", "ap", "ac", "r"]) expect(html, id).toMatch(new RegExp(`<textarea id="${id}"`));
    expect(html).not.toMatch(/<input id="ow"/);
    // Title and company are names, so they stay on one line.
    expect(html).toMatch(/<input id="t"/);
    expect(html).toMatch(/<input id="c"/);
  });
});
