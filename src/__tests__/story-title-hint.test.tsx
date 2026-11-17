import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import { StoreProvider } from "../data/store";
import AddAStoryPaste from "../screens/stories/AddAStoryPaste";
import { readStory } from "../screens/stories/readStory";
import type { ParsedDraft } from "../screens/stories/selection";

const draft = { story: { id: "st_1", title: "The AI's title", employer: "Acme" }, missing: [], dropped: [] } as unknown as ParsedDraft;
const run = async (titleHint?: string) => {
  let got: ParsedDraft | null = null;
  await readStory("text", "", { alive: () => true, parse: async () => draft, setDraft: (d) => void (got = d), setFailure: () => {}, goTo: () => {} }, titleHint);
  return got as unknown as ParsedDraft;
};

describe("a title given before the read", () => {
  it("is kept as the title of the draft", async () => {
    const d = await run("  Win-back series ");
    expect(d.story.title).toBe("Win-back series");
    expect(d.story.employer).toBe("Acme");
  });

  it("leaves the suggested title alone when blank", async () => {
    expect((await run("")).story.title).toBe("The AI's title");
    expect((await run("   ")).story.title).toBe("The AI's title");
    expect((await run()).story.title).toBe("The AI's title");
  });

  it("is asked for on the paste screen, in plain words", () => {
    const html = renderToStaticMarkup(createElement(StoreProvider, { store: mockStore, children: createElement(AddAStoryPaste) }));
    expect(html).toContain("Title (optional)");
    expect(html).toContain("Ensayo suggests one if you leave it blank");
    expect(html).not.toContain("—");
  });
});
