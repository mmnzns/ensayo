import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import { hashParam } from "../data/selection";
import { StoreProvider } from "../data/store";
import { StoriesToAdd } from "../screens/applications/ApplicationOverview";
import { addStoryLink, questionFor, storiesToAdd, titleHint } from "../screens/stories/helpers";
import { afterSave, prefillFor, showSavedOffer } from "../screens/stories/addForJob";
import AddAStoryPaste from "../screens/stories/AddAStoryPaste";

const analysis = {
  beliefs: [
    { text: "You can own lifecycle end to end, with no ops team.", storyId: null, story: "", covered: false, why: "None of your stories shows this yet." },
    { text: "You move activation, not just send messages.", storyId: "st_onboarding", story: "x", covered: true },
    { text: "You'll run it week to week until the number moves.", storyId: "st_reactivation", story: "", covered: false },
  ],
  gaps: ["Hands-on SQL for cohort analysis", "Push notifications at scale"],
};
const stories = [{ id: "st_reactivation", title: "Reactivation program" }];
const app = { id: "app_kestrel", company: "Kestrel Pay" } as never;
const strip = (h: string) => h.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
const render = (a: typeof analysis) => renderToStaticMarkup(createElement(StoreProvider, { store: mockStore, children: createElement(StoriesToAdd, { app, analysis: a as never, stories }) }));

describe("stories to add for a job", () => {
  it("lists uncovered beliefs first, then gaps, each in the reading's order", () => {
    expect(storiesToAdd(analysis, stories).map((i) => i.proves)).toEqual([
      "You can own lifecycle end to end, with no ops team.",
      "You'll run it week to week until the number moves.",
      "Hands-on SQL for cohort analysis",
      "Push notifications at scale",
    ]);
  });

  it("builds the question from the reading's words and invents nothing", () => {
    expect(questionFor("belief", "You can own lifecycle end to end, with no ops team.")).toBe("Tell me about a time you showed that you can own lifecycle end to end, with no ops team.");
    expect(questionFor("belief", "They can trust your numbers.")).toBe("Tell me about a time that shows this: they can trust your numbers.");
    expect(questionFor("gap", "Hands-on SQL for cohort analysis")).toBe("Tell me about a time you worked on hands-on SQL for cohort analysis.");
    expect(questionFor("gap", "SQL at scale")).toBe("Tell me about a time you worked on SQL at scale.");
  });

  it("shortens a belief to a title hint", () => {
    expect(titleHint("You can own lifecycle end to end, with no ops team.")).toBe("Own lifecycle end to end");
    expect(titleHint("You'll run it week to week until the number moves.")).toBe("Run it week to week");
    expect(titleHint("Push notifications at scale")).toBe("Push notifications at scale");
  });

  it("points at a story the reading already names, and only then", () => {
    const items = storiesToAdd(analysis, stories);
    expect(items[0].related).toBeUndefined();
    expect(items[1].related).toEqual({ id: "st_reactivation", title: "Reactivation program" });
    const text = strip(render(analysis));
    expect(text).toContain("Your story Reactivation program might cover this with a new angle.");
    expect(render(analysis)).toContain("5-5-story-angles?story=st_reactivation");
    expect(text.match(/Add this story/g)).toHaveLength(4);
    expect(text).not.toContain("—");
  });

  it("says everything is covered when nothing is missing", () => {
    const text = strip(render({ beliefs: analysis.beliefs.slice(1, 2), gaps: [] }));
    expect(text).toContain("Your stories cover everything this job asks for.");
    expect(text).not.toContain("Add this story");
  });
});

describe("Add a story from an application", () => {
  it("the link carries the application, company and hint, and the screen reads them back", () => {
    const link = addStoryLink({ id: "app_kestrel", company: "Kestrel Pay" }, "You can own lifecycle end to end, with no ops team.");
    expect(link.startsWith("5-2-add-a-story-paste?")).toBe(true);
    const hash = `#/${link}`;
    const params = { app: hashParam(hash, "app"), company: hashParam(hash, "company"), hint: hashParam(hash, "hint") };
    expect(params).toEqual({ app: "app_kestrel", company: "Kestrel Pay", hint: "Own lifecycle end to end" });
    expect(prefillFor(params, "")).toEqual({ company: "Kestrel Pay", titleHint: "Own lifecycle end to end" });
    expect(prefillFor(params, "Brightwave").company).toBe("Brightwave");
  });

  it("with no link params nothing is prefilled", () => {
    expect(prefillFor({}, "")).toEqual({ company: "", titleHint: undefined });
    expect(prefillFor({ company: "Stray", hint: "Stray" }, "Typed")).toEqual({ company: "Typed", titleHint: undefined });
    const html = renderToStaticMarkup(createElement(StoreProvider, { store: mockStore, children: createElement(AddAStoryPaste) }));
    expect(html).toContain('placeholder="e.g. Win-back series"');
  });

  it("saving goes back to the application with the Recheck offer, only for a plain Save", () => {
    expect(afterSave("app_kestrel", "5-1-stories")).toBe("6-3-application-overview?app=app_kestrel&saved=1");
    expect(afterSave("app_kestrel", "3-1-practice-interviewer-asking")).toBe("3-1-practice-interviewer-asking");
    expect(afterSave(undefined, "5-1-stories")).toBe("5-1-stories");
  });

  it("the overview offers Recheck after a save until a recheck has run", () => {
    expect(showSavedOffer("1", false, true)).toBe(true);
    expect(showSavedOffer("1", true, true)).toBe(false);
    expect(showSavedOffer("1", false, false)).toBe(false);
    expect(showSavedOffer(undefined, false, true)).toBe(false);
  });
});
