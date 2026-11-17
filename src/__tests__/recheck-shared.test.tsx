import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { RecheckPill } from "../screens/applications/RecheckButton";
import { changedLine, recheckState, resetRecheck, startRecheck, storiesChangedSince } from "../screens/applications/recheck";
import type { JdOutcome } from "../data/applicationCommands";

const outcome = { result: { source: "ai", changed: ["Gap 1 changed."], kept: [] } } as unknown as JdOutcome;

describe("one recheck shared by the header and the overview", () => {
  beforeEach(() => resetRecheck());

  it("is busy for every button until the reading comes back, then keeps the result", async () => {
    let finish: (o: JdOutcome) => void = () => {};
    const run = startRecheck("a1", () => new Promise<JdOutcome>((r) => (finish = r)));
    expect(recheckState("a1").busy).toBe(true);
    expect(recheckState("a2").busy).toBe(false);
    finish(outcome);
    await run;
    expect(recheckState("a1")).toMatchObject({ busy: false, error: "", last: outcome });
  });

  it("does not start a second recheck while one is running", async () => {
    let calls = 0;
    let finish: (o: JdOutcome) => void = () => {};
    const first = startRecheck("a1", () => {
      calls++;
      return new Promise<JdOutcome>((r) => (finish = r));
    });
    expect(await startRecheck("a1", async () => { calls++; return outcome; })).toBeUndefined();
    finish(outcome);
    await first;
    expect(calls).toBe(1);
  });

  it("keeps the plain error, and says nothing when the person pressed Stop", async () => {
    await startRecheck("a1", () => Promise.reject(new Error("Couldn't reach the engine.")));
    expect(recheckState("a1").error).toBe("Couldn't reach the engine.");
    await startRecheck("a1", () => Promise.reject("stopped"));
    expect(recheckState("a1")).toMatchObject({ busy: false, error: "" });
  });
});

describe("the header's Recheck pill", () => {
  it("is shaped like the status pill and says what it does", () => {
    const html = renderToString(<RecheckPill busy={false} onClick={() => {}} />);
    expect(html).toContain('class="e-pill"');
    expect(html).toContain("font-size:13px");
    expect(html).toContain("Recheck");
    expect(html).toContain('width="12"');
  });

  it("says Rechecking while busy and is off when there is no posting", () => {
    expect(renderToString(<RecheckPill busy onClick={() => {}} />)).toContain("Rechecking");
    const off = renderToString(<RecheckPill busy={false} disabled title="No posting" onClick={() => {}} />);
    expect(off).toContain("disabled");
    expect(off).toContain('title="No posting"');
  });
});

describe("stories changed since the posting was read", () => {
  const read = "2026-10-08T09:30:00Z";
  it("counts the stories changed after the reading", () => {
    const stories = [{ updated_at: "2026-10-09T08:00:00Z" }, { updated_at: "2026-10-01T08:00:00Z" }, { updated_at: "2026-10-12T08:00:00Z" }];
    expect(storiesChangedSince(stories, read)).toBe(2);
  });

  it("counts nothing when a time is missing or unreadable, rather than a wrong number", () => {
    expect(storiesChangedSince([{}, { updated_at: "later" }], read)).toBe(0);
    expect(storiesChangedSince([{ updated_at: "2026-10-09T08:00:00Z" }], undefined)).toBe(0);
    expect(storiesChangedSince([{ updated_at: "2026-10-09T08:00:00Z" }], "")).toBe(0);
    expect(storiesChangedSince([{ updated_at: "2026-10-09T08:00:00Z" }], "x")).toBe(0);
  });

  it("does not count a story saved at the moment of the reading", () => {
    expect(storiesChangedSince([{ updated_at: read }], read)).toBe(0);
  });

  it("says one story or many, and nothing for none", () => {
    expect(changedLine(1)).toBe("1 story changed since this was read");
    expect(changedLine(3)).toBe("3 stories changed since this was read");
    expect(changedLine(0)).toBe("");
  });
});
