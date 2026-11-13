import { describe, expect, it, vi } from "vitest";
import { hasUnsavedText, escOnSheet, draftOf, EMPTY_DRAFT } from "../screens/applications/afterInterview";
import { atStake, endBody, escDecision, END_CONFIRM, END_KEEP, END_TITLE } from "../screens/practice/endSession";
import { keyBelongsToTarget, runKey, type KeyHandlers, type KeyTarget } from "../screens/practice/useKeys";

const el = (tagName: string, attrs: Record<string, string> = {}, over: Partial<KeyTarget> = {}): KeyTarget => ({ tagName, getAttribute: (n) => attrs[n] ?? null, ...over });
const press = (key: string, target: KeyTarget | null, handlers: KeyHandlers) => {
  const preventDefault = vi.fn();
  const ran = runKey({ key, repeat: false, metaKey: false, ctrlKey: false, altKey: false, preventDefault, target }, handlers);
  return { ran, prevented: preventDefault.mock.calls.length > 0 };
};

describe("practice keys and the focused element", () => {
  it("ignores Space and Enter on a button, a link with an href and a role=button element", () => {
    for (const t of [el("BUTTON"), el("A", { href: "#x" }), el("DIV", { role: "button" })]) {
      for (const key of [" ", "Enter"]) {
        const h = { space: vi.fn(), enter: vi.fn() };
        expect(press(key, t, h)).toEqual({ ran: false, prevented: false });
        expect(h.space).not.toHaveBeenCalled();
        expect(h.enter).not.toHaveBeenCalled();
      }
    }
  });

  it("still runs Space and Enter on the page, and on a link with no href", () => {
    const h = { space: vi.fn(), enter: vi.fn() };
    expect(press(" ", el("BODY"), h).ran).toBe(true);
    expect(press("Enter", el("A"), h).ran).toBe(true);
    expect(h.space).toHaveBeenCalledTimes(1);
    expect(h.enter).toHaveBeenCalledTimes(1);
  });

  it("still lets Esc through from a focused button, and ignores every key in a field", () => {
    const h = { esc: vi.fn(), n: vi.fn() };
    expect(press("Escape", el("BUTTON"), h).ran).toBe(true);
    expect(keyBelongsToTarget(el("TEXTAREA"), "esc")).toBe(true);
    expect(keyBelongsToTarget(el("DIV", {}, { isContentEditable: true }), "n")).toBe(true);
    expect(press("n", el("INPUT"), h).ran).toBe(false);
  });
});

describe("Esc in a session", () => {
  it("asks while an answer is recorded or scored, with the wording of the design", () => {
    expect(atStake("recording", true)).toBe("recording");
    expect(atStake("thinking", true)).toBe("scoring");
    expect(escDecision("recording")).toBe("ask");
    expect(escDecision("scoring")).toBe("ask");
    expect([END_TITLE, END_CONFIRM, END_KEEP]).toEqual(["End the session?", "End session", "Keep going"]);
    expect(endBody("recording")).toBe("This answer will be lost.");
    expect(endBody("scoring")).toBe("The answer being scored will be lost.");
  });

  it("ends at once when nothing is at stake: a preview, or a scoring that already failed", () => {
    expect(atStake("recording", false)).toBeNull();
    expect(atStake("thinking", true, true)).toBeNull();
    expect(escDecision(null)).toBe("end");
  });
});

describe("Esc on After the interview", () => {
  const note = { rating: 3, asked: ["Q one"], worked: "w", differently: "d", spokeTo: "s", nextStep: "n" } as never;

  it("does nothing inside a field", () => {
    expect(escOnSheet(true, true)).toBe("nothing");
    expect(escOnSheet(true, false)).toBe("nothing");
  });

  it("leaves at once with nothing unsaved, and asks first with unsaved text", () => {
    expect(escOnSheet(false, false)).toBe("leave");
    expect(escOnSheet(false, true)).toBe("ask");
  });

  it("counts text as unsaved only when it differs from the saved note, ignoring spaces at the ends", () => {
    expect(hasUnsavedText(EMPTY_DRAFT, undefined)).toBe(false);
    expect(hasUnsavedText({ ...EMPTY_DRAFT, worked: "  " }, undefined)).toBe(false);
    expect(hasUnsavedText({ ...EMPTY_DRAFT, worked: "I led" }, undefined)).toBe(true);
    expect(hasUnsavedText(draftOf(note), note)).toBe(false);
    expect(hasUnsavedText({ ...draftOf(note), worked: "w " }, note)).toBe(false);
    expect(hasUnsavedText({ ...draftOf(note), rating: 4 }, note)).toBe(true);
  });
});
