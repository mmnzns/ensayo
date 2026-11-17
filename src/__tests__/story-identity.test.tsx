import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import { StoreProvider } from "../data/store";
import { saveStory } from "../data/actions";
import { routes } from "../screens/stories";
import { identityOf, withIdentity } from "../screens/stories/storyEdit";

const story = { ...mockStore.stories[0], year: "2023", angles: [{ target_id: "tg_b2c", headline: "x" }] } as unknown as (typeof mockStore.stories)[number];

describe("a story's title, company and year", () => {
  it("shows them as fields at the top of the story page, filled in", () => {
    const html = renderToStaticMarkup(createElement(StoreProvider, { store: mockStore, children: createElement(routes["5-4-story"]) }));
    expect(html).toContain('id="ti"');
    expect(html).toContain('id="co"');
    expect(html).toContain('id="yr"');
    expect(html).toContain(`value="${mockStore.stories[0].title}"`);
  });

  it("starts from what the story has", () => {
    expect(identityOf(story)).toEqual({ title: story.title, company: story.employer, year: "2023" });
    expect(identityOf({ ...story, year: undefined }).year).toBe("");
  });

  it("renaming keeps the id and everything that points at it", () => {
    const out = withIdentity(story, { title: "  A new name ", company: " Acme ", year: " 2021 " });
    expect(out).toMatchObject({ id: story.id, title: "A new name", employer: "Acme", year: "2021" });
    expect(out.angles).toEqual(story.angles);
    expect(out.proof_points).toEqual(story.proof_points);
    expect(out.branches).toEqual(story.branches);
    expect(out.usage).toEqual(story.usage);
  });

  it("an emptied year means no year", () => {
    expect("year" in withIdentity(story, { title: "T", company: "C", year: "  " })).toBe(false);
  });

  it("saving the renamed story replaces the same story, not a copy", () => {
    const state = { profile: null, stories: mockStore.stories, methods: mockStore.methods };
    const next = saveStory(state, withIdentity(mockStore.stories[0], { title: "Renamed", company: "Acme", year: "" }));
    expect(next.stories).toHaveLength(mockStore.stories.length);
    expect(next.stories[0].title).toBe("Renamed");
    expect(next.methods).toEqual(state.methods);
  });
});
