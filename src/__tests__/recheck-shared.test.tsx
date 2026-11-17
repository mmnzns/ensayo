import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { RecheckPill } from "../screens/applications/RecheckButton";
import { recheckState, resetRecheck, startRecheck } from "../screens/applications/recheck";
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
