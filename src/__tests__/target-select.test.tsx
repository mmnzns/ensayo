import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TargetSelect, { TargetOptions } from "../components/TargetSelect";
import { blankTarget } from "../data/targetState";
import type { Target } from "../data/types";
import { NEW_TARGET_LABEL, newTargetProblem, stepIndex, targetChoices, targetFromName } from "../screens/applications/targetPick";

const mk = (id: string, name: string, extra: Partial<Target> = {}): Target => ({ ...blankTarget([]), id, name, role: name, ...extra });
const targets = [mk("a", "B2C lifecycle", { color: "green" }), mk("b", "B2B growth", { color: "slate" }), mk("c", "Old one", { archived: true })];

describe("the target dropdown list", () => {
  it("lists the live targets with the active one first, and an archived one only when it is kept", () => {
    expect(targetChoices(targets, "b").map((t) => t.id)).toEqual(["b", "a"]);
    expect(targetChoices(targets, "b", "c").map((t) => t.id)).toEqual(["b", "a", "c"]);
  });

  it("moves the highlight and stops at the ends", () => {
    expect(stepIndex(0, "ArrowDown", 3)).toBe(1);
    expect(stepIndex(2, "ArrowDown", 3)).toBe(2);
    expect(stepIndex(0, "ArrowUp", 3)).toBe(0);
    expect(stepIndex(2, "ArrowUp", 3)).toBe(1);
    expect(stepIndex(1, "Home", 3)).toBe(0);
    expect(stepIndex(0, "End", 3)).toBe(2);
    expect(stepIndex(1, "a", 3)).toBe(1);
  });
});

describe("the open list", () => {
  const html = renderToString(<TargetOptions id="t" list={targetChoices(targets, "b")} value="a" active={1} onPick={() => {}} onNew={() => {}} />);

  it("is a listbox with one option per target, each with a colour dot, and New target… last", () => {
    expect(html).toContain('role="listbox"');
    expect((html.match(/role="option"/g) ?? []).length).toBe(3);
    expect(html.indexOf("B2B growth")).toBeLessThan(html.indexOf("B2C lifecycle"));
    expect(html.indexOf("B2C lifecycle")).toBeLessThan(html.indexOf(NEW_TARGET_LABEL));
    expect((html.match(/border-radius:3px/g) ?? []).length).toBe(2);
    expect(NEW_TARGET_LABEL).toBe("New target…");
  });

  it("marks the chosen target and has no em dash", () => {
    expect(html).toMatch(/id="t-1"[^>]*aria-selected="true"/);
    expect(html).not.toContain("—");
  });
});

describe("the closed dropdown", () => {
  const html = renderToString(<TargetSelect targets={targets} activeId="b" value="a" onChange={() => {}} onCreate={async () => "x"} />);
  it("shows the chosen target with its dot, as a collapsed combobox", () => {
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain("B2C lifecycle");
    expect(html).toContain("border-radius:3px");
    expect(html).not.toContain('role="listbox"');
    expect(html).toContain("e-input");
  });
  it("says so when nothing is picked", () => {
    expect(renderToString(<TargetSelect targets={targets} activeId="b" value="" onChange={() => {}} onCreate={async () => "x"} />)).toContain("Pick a target");
  });
});

describe("making a target in place", () => {
  it("asks for a name and refuses a repeat", () => {
    expect(newTargetProblem("  ", targets)).toBe("Give the target a name.");
    expect(newTargetProblem("b2b GROWTH", targets)).toBe("You already have a target with that name.");
    expect(newTargetProblem("Old one", targets)).toBe("");
    expect(newTargetProblem("Product marketing", targets)).toBe("");
  });

  it("builds the target from the name and the role typed on the application", () => {
    const t = targetFromName(" Platform PMM ", "Product Marketing Manager", targets);
    expect(t.id).toBe("");
    expect(t.name).toBe("Platform PMM");
    expect(t.role).toBe("Product Marketing Manager");
    expect(t.roleFamily).toBe("product_marketing");
    expect(t.archived).toBe(false);
    expect(t.defaultProcess.length).toBeGreaterThan(0);
  });

  it("falls back to the name when no role is typed yet", () => {
    expect(targetFromName("Growth", "  ", targets).role).toBe("Growth");
  });
});
