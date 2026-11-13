import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import type { Story } from "../data/types";
import { FinishSetupView } from "../screens/home/FinishSetup";
import { missingSteps, type SpeechPlan } from "../screens/first-run/setup";
import { draftToReview, storyFromReview } from "../screens/stories/parseDraft";
import { storyFilters, filterStories } from "../screens/stories/helpers";
import { pasteStart } from "../screens/stories/pasteStart";

describe("the paste box", () => {
  it("starts empty in the app and with the sample only in the browser preview", () => {
    expect(pasteStart(undefined, "Sample text", true)).toBe("");
    expect(pasteStart(undefined, "Sample text", false)).toBe("Sample text");
  });
  it("keeps what the person already typed, in either place", () => {
    expect(pasteStart("my own words", "Sample text", true)).toBe("my own words");
    expect(pasteStart("my own words", "Sample text", false)).toBe("my own words");
    // Typing then clearing the box is still the person's choice: it stays empty in the preview.
    expect(pasteStart("", "Sample text", false)).toBe("");
  });
});

describe("Finish setting up", () => {
  const ready: SpeechPlan = { kind: "ready", modelId: "w", name: "Whisper", fromOtherApp: false };
  const needs: SpeechPlan = { kind: "download", modelId: "w", name: "Whisper", sizeMb: 800, onlyVoiceDetection: false };

  it("lists nothing when the microphone, speech model and engine are all set", () => {
    expect(missingSteps("granted", ready, "key")).toEqual([]);
    expect(missingSteps("granted", ready, "local")).toEqual([]);
  });

  it("lists each missing step, linking to where it is done", () => {
    const all = missingSteps("undetermined", needs, "timing");
    expect(all.map((s) => [s.id, s.to])).toEqual([
      ["microphone", "1-4-microphone"],
      ["speech", "1-5-speech"],
      ["engine", "8-5-settings-ai"],
    ]);
    expect(missingSteps("denied", ready, "key").map((s) => s.id)).toEqual(["microphone"]);
    expect(missingSteps("restricted", ready, "key").map((s) => s.id)).toEqual(["microphone"]);
    expect(missingSteps("granted", needs, "key").map((s) => s.id)).toEqual(["speech"]);
    expect(missingSteps("granted", ready, "timing").map((s) => s.id)).toEqual(["engine"]);
  });

  it("does not nag about what it cannot tell yet", () => {
    expect(missingSteps(null, null, "key")).toEqual([]);
    expect(missingSteps("unknown", ready, "key")).toEqual([]);
  });

  it("says the speech size and renders as a card with a link per step", () => {
    const steps = missingSteps("granted", needs, "timing");
    expect(steps[0].line).toContain("800 MB");
    const html = renderToString(<FinishSetupView steps={steps} />);
    expect(html).toContain("Finish setting up");
    expect(html).toContain('href="#/1-5-speech"');
    expect(html).toContain('href="#/8-5-settings-ai"');
    expect(html).not.toContain("—");
    expect(renderToString(<FinishSetupView steps={[]} />)).toBe("");
  });
});

const story = (id: string, competencies: string[], over: Partial<Story> = {}): Story => ({ ...mockStore.stories[0], id, competencies, ...over });

describe("story competencies reach the saved story", () => {
  const parsed = story("st_new", ["deliverability", "ownership"], { proof_points: [], branches: [], best_for: ["fixing a metric"] });
  it("keeps the parsed ones when the review is saved, whatever the person changes", () => {
    const r = draftToReview(parsed, [], []);
    const saved = storyFromReview(parsed, { ...r, goodFor: ["something else"] }, r.numbers);
    expect(saved.competencies).toEqual(["deliverability", "ownership"]);
    expect(saved.best_for).toEqual(["something else"]);
  });
  it("is empty for a story typed from scratch", () => {
    const r = draftToReview(parsed, [], []);
    expect(storyFromReview(null, r, []).competencies).toEqual([]);
  });
});

describe("the story filter chips come from your own stories", () => {
  const stories = [
    story("a", ["Improving a metric", "experimentation"]),
    story("b", ["improving a metric", "leading people"]),
    story("c", ["leading people", "Improving a metric", "improving a metric"]),
    story("d", ["disagreement"]),
    story("e", ["influence"]),
    story("f", ["experimentation"]),
  ];
  it("is All, the four most common competencies, then Has gaps", () => {
    const f = storyFilters(stories);
    expect(f.map((x) => x.label)).toEqual(["All", "Improving a metric", "Experimentation", "Leading people", "Disagreement", "Has gaps"]);
    expect(f[0]).toEqual({ id: "all", label: "All" });
    expect(f[f.length - 1].gaps).toBe(true);
  });
  it("counts a story once per competency and ignores case", () => {
    const f = storyFilters([story("a", ["Data", "data", "DATA"]), story("b", ["ops"])]);
    expect(f.map((x) => x.label)).toEqual(["All", "Data", "Ops", "Has gaps"]);
  });
  it("matches the stories that carry it", () => {
    const f = storyFilters(stories);
    const chip = f.find((x) => x.label === "Leading people");
    expect(filterStories(stories, chip).map((s) => s.id)).toEqual(["b", "c"]);
    expect(filterStories(stories, f.find((x) => x.id === "all"))).toHaveLength(stories.length);
  });
  it("is just All and Has gaps when no story has competencies yet", () => {
    expect(storyFilters([story("a", [])]).map((x) => x.label)).toEqual(["All", "Has gaps"]);
    expect(storyFilters([]).map((x) => x.label)).toEqual(["All", "Has gaps"]);
  });
});
