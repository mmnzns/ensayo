import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Working from "../screens/applications/Working";
import { readStory } from "../screens/stories/readStory";
import { elapsedLabel, elapsedSeconds, LONG_WAIT_TEXT, showStop, takingLonger, thinkingRows } from "../screens/practice/thinkingProgress";
import { canStop, isStopped, stopLocalAi } from "../ui/aiStop";
import type { ParsedDraft } from "../screens/stories/selection";

describe("the thinking screen rows", () => {
  it("tick on the event, not on mount", () => {
    expect(thinkingRows(true, null)).toEqual({ text: false, timing: false, judging: true });
    expect(thinkingRows(true, 120)).toEqual({ text: true, timing: true, judging: true });
    expect(thinkingRows(true, 0).text).toBe(true);
    // The browser preview has no backend to wait for.
    expect(thinkingRows(false, null).text).toBe(true);
  });

  it("counts the elapsed time and says when it is taking longer than usual after 30 s", () => {
    expect(elapsedSeconds(null, 5000)).toBe(0);
    expect(elapsedSeconds(1000, 13_900)).toBe(12);
    expect(elapsedSeconds(9000, 1000)).toBe(0);
    expect(elapsedLabel(12)).toBe("12 s");
    expect(elapsedLabel(84)).toBe("1:24");
    expect(takingLonger(29)).toBe(false);
    expect(takingLonger(30)).toBe(true);
    expect(LONG_WAIT_TEXT).toBe("Taking longer than usual.");
  });
});

describe("Stop", () => {
  it("shows for the built-in local AI only, while the AI part runs", () => {
    expect(canStop("local")).toBe(true);
    expect(canStop("key")).toBe(false);
    expect(canStop("timing")).toBe(false);
    expect(showStop("local", true, true, 50)).toBe(true);
    expect(showStop("key", true, true, 50)).toBe(false);
    expect(showStop("timing", true, true, 50)).toBe(false);
    expect(showStop("local", true, true, null)).toBe(false);
    expect(showStop("local", true, false, 50)).toBe(false);
    expect(showStop("local", false, true, 50)).toBe(false);
  });

  it("calls cancel_local_ai, and stays quiet when there is nothing to stop", async () => {
    const calls: string[] = [];
    await stopLocalAi(async (c) => void calls.push(c));
    expect(calls).toEqual(["cancel_local_ai"]);
    await expect(stopLocalAi(async () => Promise.reject(new Error("x")))).resolves.toBeUndefined();
  });

  it("is on the Working component for local AI only", () => {
    const stop = () => {};
    expect(renderToString(<Working steps={["story"]} current="story" kind="local" onStop={stop} />)).toContain(">Stop<");
    expect(renderToString(<Working steps={["story"]} current="story" kind="key" onStop={stop} />)).not.toContain(">Stop<");
    expect(renderToString(<Working steps={["story"]} current="story" kind="local" />)).not.toContain(">Stop<");
    const html = renderToString(<Working steps={["debrief"]} current="debrief" kind="local" onStop={stop} />);
    expect(html).toContain("Reading how your questions landed");
    expect(html).not.toContain("—");
  });

  it("knows the stopped error by its exact word", () => {
    expect(isStopped("stopped")).toBe(true);
    expect(isStopped(new Error("stopped"))).toBe(true);
    expect(isStopped("Error: stopped")).toBe(true);
    expect(isStopped("You stopped the AI.")).toBe(false);
    expect(isStopped(undefined)).toBe(false);
  });
});

describe("reading a story", () => {
  const draft = { headline: "h" } as unknown as ParsedDraft;
  const make = (parse: () => Promise<ParsedDraft>, alive = () => true) => {
    const log: string[] = [];
    return { log, deps: { alive, parse, setDraft: () => void log.push("draft"), setFailure: () => void log.push("failure"), goTo: (s: string) => void log.push(`go:${s}`) } };
  };

  it("goes to the review when it finishes", async () => {
    const t = make(async () => draft);
    expect(await readStory("a", "", t.deps)).toBe("reviewed");
    expect(t.log).toEqual(["draft", "go:5-3-add-a-story-review"]);
  });

  it("a stopped read changes nothing and shows no banner", async () => {
    const t = make(async () => Promise.reject("stopped"));
    expect(await readStory("a", "", t.deps)).toBe("stopped");
    expect(t.log).toEqual([]);
  });

  it("another failure goes to the error page", async () => {
    const t = make(async () => Promise.reject("The AI said no"));
    expect(await readStory("a", "", t.deps)).toBe("failed");
    expect(t.log).toEqual(["failure", "go:stories-parse-error"]);
  });

  it("a result that comes back after leaving the screen does not navigate", async () => {
    let here = true;
    const t = make(async () => draft, () => here);
    here = false;
    expect(await readStory("a", "", t.deps)).toBe("gone");
    const f = make(async () => Promise.reject("boom"), () => false);
    expect(await readStory("a", "", f.deps)).toBe("gone");
    expect(t.log).toEqual([]);
    expect(f.log).toEqual([]);
  });
});
