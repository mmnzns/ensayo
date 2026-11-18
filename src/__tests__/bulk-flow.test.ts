import { describe, expect, it, vi } from "vitest";
import { emptyStory } from "../data/actions";
import type { Story } from "../data/types";
import { canSave, itemStory, newItem, progressLine, reviewOf, runReads, saveItems, savable, savedLine, unsavedCount, withBlank, withFailure, withRead, type BulkItem } from "../screens/stories/bulkFlow";
import { piecesFromPaste } from "../screens/stories/bulkSplit";
import type { ParsedDraft } from "../screens/stories/selection";

const draftFor = (title: string, extra: Partial<Story> = {}): ParsedDraft => ({ story: { ...emptyStory(), title, employer: "Acme", context: `${title} context`, ...extra }, missing: [], dropped: [] });
const fresh = (text: string) => piecesFromPaste(text).map(newItem);
const THREE = "# Alpha\nfirst body\n# Beta\nsecond body\n# Gamma\nthird body";

function deps(parse: (raw: string) => Promise<ParsedDraft>, over: Partial<Parameters<typeof runReads>[1]> = {}) {
  const log: string[] = [];
  const got: Record<string, ParsedDraft> = {};
  const failed: Record<string, string> = {};
  return {
    log,
    got,
    failed,
    d: {
      parse,
      stopRequested: () => false,
      alive: () => true,
      onStart: (id: string) => log.push(`start:${id}`),
      onRead: (id: string, dr: ParsedDraft) => {
        got[id] = dr;
        log.push(`read:${id}`);
      },
      onFail: (id: string, m: string) => {
        failed[id] = m;
        log.push(`fail:${id}`);
      },
      ...over,
    },
  };
}

describe("reading many, one at a time", () => {
  it("reads in order, one after another, never all at once", async () => {
    const items = fresh(THREE);
    let live = 0;
    let peak = 0;
    const t = deps(async (raw) => {
      live++;
      peak = Math.max(peak, live);
      await Promise.resolve();
      live--;
      return draftFor(raw.split("\n")[0].replace("# ", ""));
    });
    expect(await runReads(items, t.d)).toBe("finished");
    expect(peak).toBe(1);
    expect(t.log).toEqual(items.flatMap((i) => [`start:${i.id}`, `read:${i.id}`]));
    expect(Object.values(t.got).map((d) => d.story.title)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("a failed read keeps its message and the rest carry on", async () => {
    const items = fresh(THREE);
    const t = deps(async (raw) => {
      if (raw.includes("second")) throw new Error("The provider is busy.");
      return draftFor("ok");
    });
    expect(await runReads(items, t.d)).toBe("finished");
    expect(t.log.map((l) => l.split(":")[0])).toEqual(["start", "read", "start", "fail", "start", "read"]);
    expect(t.failed[items[1].id]).toContain("The provider is busy.");
  });

  it("Stop ends the run after the current one, leaving the rest waiting", async () => {
    const items = fresh(THREE);
    let stop = false;
    const t = deps(
      async () => {
        stop = true;
        return draftFor("x");
      },
      { stopRequested: () => stop },
    );
    expect(await runReads(items, t.d)).toBe("stopped");
    expect(t.log).toEqual([`start:${items[0].id}`, `read:${items[0].id}`]);
  });

  it("a read that ends after the person left goes nowhere", async () => {
    const items = fresh(THREE);
    let alive = true;
    const t = deps(
      async () => {
        alive = false;
        return draftFor("late");
      },
      { alive: () => alive },
    );
    expect(await runReads(items, t.d)).toBe("gone");
    expect(Object.keys(t.got)).toHaveLength(0);
  });

  it("says where it is", () => {
    expect(progressLine(2, 12)).toBe("Reading 3 of 12");
    expect(progressLine(12, 12)).toBe("Reading 12 of 12");
  });
});

describe("the drafts and what gets saved", () => {
  const bank = [{ ...emptyStory(), title: "Alpha" }];
  const read = (items: BulkItem[], saved: Story[] = []) => items.map((i) => withRead(i, draftFor(i.text.split("\n")[0].replace("# ", "")), saved));

  it("flags a likely duplicate and leaves it unchecked; the others start checked", () => {
    const items = read(fresh(THREE), bank);
    expect(items.map((i) => i.checked)).toEqual([false, true, true]);
    expect(items[0].duplicateOf).toBe("Alpha");
    expect(items[1].duplicateOf).toBeUndefined();
  });

  it("Save all checked saves only the checked ones", async () => {
    const items = read(fresh(THREE), bank);
    items[2] = { ...items[2], checked: false };
    const save = vi.fn(async (s: Story) => s);
    const results: Record<string, boolean> = {};
    const n = await saveItems(savable(items), save, (id, ok) => (results[id] = ok));
    expect(n).toBe(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].title).toBe("Beta");
    expect(results).toEqual({ [items[1].id]: true });
  });

  it("saves nothing when nothing is checked, and nothing was saved by reading", async () => {
    const save = vi.fn(async (s: Story) => s);
    const t = deps(async () => draftFor("x"));
    const items = fresh(THREE);
    await runReads(items, t.d);
    expect(save).not.toHaveBeenCalled();
    const read2 = read(items).map((i) => ({ ...i, checked: false }));
    expect(savable(read2)).toEqual([]);
    expect(await saveItems(savable(read2), save, () => {})).toBe(0);
    expect(save).not.toHaveBeenCalled();
  });

  it("a save that fails is reported and the rest still save", async () => {
    const items = read(fresh(THREE));
    const save = vi.fn(async (s: Story) => {
      if (s.title === "Beta") throw new Error("disk");
      return s;
    });
    const results: boolean[] = [];
    const n = await saveItems(savable(items), save, (_, ok) => results.push(ok));
    expect(n).toBe(2);
    expect(results).toEqual([true, false, true]);
    expect(savedLine(2, 1)).toContain("1 could not be saved");
    expect(savedLine(1, 0)).toBe("Saved 1 story.");
  });

  it("never saves a skipped, saved, failed or still waiting item, even if checked", () => {
    const [a, b, c] = read(fresh(THREE));
    const items = [
      { ...a, outcome: "skipped" as const },
      { ...b, outcome: "saved" as const },
      { ...withFailure(newItem(piecesFromPaste("# D\nx")[0]), "no"), checked: true },
      { ...newItem(piecesFromPaste("# E\nx")[0]), checked: true },
      c,
    ];
    expect(savable(items).map((i) => i.id)).toEqual([c.id]);
    expect(canSave(items[2])).toBe(false);
  });

  it("the story saved is the draft with the person's edits laid over it", () => {
    const [a] = read(fresh("# Alpha\nbody"));
    const edited: BulkItem = { ...a, fields: { ...reviewOf(a).fields, title: "My title", approach: "I decided" } };
    const s = itemStory(edited);
    expect(s.title).toBe("My title");
    expect(s.approach).toBe("I decided");
    expect(s.employer).toBe("Acme");
    expect(s.verified).toBe(false);
  });

  it("Start blank gives empty fields with a title from the first line, and counts as unsaved until dealt with", () => {
    const failed = withFailure(fresh("## Win back\nbody")[0], "no");
    const blank = withBlank(failed, []);
    expect(reviewOf(blank).fields.title).toBe("Win back");
    expect(reviewOf(blank).fields.context).toBe("");
    expect(canSave(blank)).toBe(true);
    expect(blank.checked).toBe(false);
    expect(unsavedCount([blank])).toBe(1);
    expect(unsavedCount([{ ...blank, outcome: "skipped" }])).toBe(0);
  });

  it("counts unsaved drafts for the leave question", () => {
    const items = read(fresh(THREE));
    expect(unsavedCount(items)).toBe(3);
    expect(unsavedCount([{ ...items[0], outcome: "saved" }, { ...items[1], outcome: "skipped" }, items[2]])).toBe(1);
    expect(unsavedCount([withFailure(items[0], "x")])).toBe(0);
  });
});
