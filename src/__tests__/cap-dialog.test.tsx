import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import CapDialog, { CAP_TITLE, CapDialogView, capBody, capHeld, capQuestion, capSmall, clearCapQuestion, keepGoing, noteCapReached, timingOnly, type CapReached } from "../ui/capDialog";
import { CAP_NOTICE_MARK } from "../practice/live";

afterEach(clearCapQuestion);

const cap: CapReached = { key: "ses_a", spent: 1.04, cap: 1, limit: 1 };
const no = () => {};

describe("the spending limit question", () => {
  it("shows the amounts with two decimals", () => {
    expect(CAP_TITLE).toBe("You've reached this session's spending limit");
    expect(capBody(cap)).toBe("This session has used about $1.04 of AI feedback. Your limit is $1.00 a session. Keep using AI feedback?");
    expect(capSmall({ ...cap, cap: 0.25 })).toBe("Keep going allows another $0.25. Amounts are estimates. Change the limit in Settings › AI.");
    const html = renderToString(<CapDialogView cap={{ ...cap, spent: 2.5 }} held={false} onKeep={no} onTiming={no} onClose={no} />);
    expect(html).toContain("$2.50");
    expect(html).toContain("Keep going");
    expect(html).toContain("Timing only");
    expect(html).not.toContain("—");
  });

  it("waits while recording, while the AI is working and while the interviewer speaks", () => {
    expect(capHeld("recording", false)).toBe(true);
    expect(capHeld("thinking", false)).toBe(true);
    expect(capHeld("result", true)).toBe(true);
    expect(capHeld("result", false)).toBe(false);
    expect(capHeld("idle", false)).toBe(false);
    expect(renderToString(<CapDialogView cap={cap} held={true} onKeep={no} onTiming={no} onClose={no} />)).toBe("");
    expect(renderToString(<CapDialogView cap={null} held={false} onKeep={no} onTiming={no} onClose={no} />)).toBe("");
  });

  it("holds an event until it can be shown, and shows it when nothing is going on", () => {
    expect(renderToString(<CapDialog />)).toBe("");
    noteCapReached(cap);
    expect(capQuestion()).toEqual(cap);
    // The live loop is idle in a test, so nothing holds the question back.
    expect(renderToString(<CapDialog />)).toContain("You&#x27;ve reached this session&#x27;s spending limit");
  });

  it("Keep going allows more, then rescores the rep that was refused", async () => {
    const calls: string[] = [];
    const deps = { invoke: async (c: string, a: { key: string }) => void calls.push(`${c}:${a.key}`), rescore: async (k: string) => void calls.push(`rescore:${k}`) };
    noteCapReached(cap);
    await keepGoing(cap, deps);
    expect(calls).toEqual(["continue_past_cap:ses_a", "rescore:ses_a"]);
    expect(capQuestion()).toBeNull();
  });

  it("Keep going does not rescore when the backend could not allow more", async () => {
    const calls: string[] = [];
    await keepGoing(cap, { invoke: async () => Promise.reject(new Error("x")), rescore: async () => void calls.push("rescore") });
    expect(calls).toEqual([]);
  });

  it("Timing only declines the rest of the session and does not rescore", async () => {
    const calls: string[] = [];
    noteCapReached(cap);
    await timingOnly(cap, { invoke: async (c, a) => void calls.push(`${c}:${a.key}`), rescore: async () => void calls.push("rescore") });
    expect(calls).toEqual(["decline_past_cap:ses_a"]);
    expect(capQuestion()).toBeNull();
  });

  it("recognises the backend's refusal wording", () => {
    expect("This session has spent about $1.02 of its $1.00 limit, and the next AI step would go over it. Change the limit in Settings › AI.").toContain(CAP_NOTICE_MARK);
  });
});
