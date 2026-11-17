import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { proofPointsFromRows } from "../data/actions";
import type { ProofPoint } from "../data/types";
import { checkAngleNumbers, numberList } from "../screens/stories/angles";
import { numberText } from "../screens/stories/helpers";
import Numbers from "../screens/stories/Numbers";

const pt = (over: Partial<ProofPoint>): ProofPoint => ({ label: "act", metric: "Activation", before: "31", after: "44", unit: "%", approximate: false, verified: false, ...over });
const rowOf = (p: ProofPoint, over = {}) => ({ id: p.label, label: p.metric, value: numberText(p), checked: p.verified, ...over });

describe("numbers can be edited once saved", () => {
  it("shows an input for the label and the value of every row, saved or new", () => {
    const html = renderToStaticMarkup(createElement(Numbers, { rows: [rowOf(pt({})), { id: "n1", label: "", value: "", checked: false, isNew: true }], setRows: () => {} }));
    expect((html.match(/aria-label="What the number is"/g) ?? []).length).toBe(2);
    expect((html.match(/aria-label="The number"/g) ?? []).length).toBe(2);
    expect(html).toContain('value="31% → 44%"');
  });

  it("round-trips an unchanged row exactly", () => {
    for (const p of [pt({}), pt({ before: "about 40", after: "about 80" }), pt({ before: "", after: "18" }), pt({ before: "3", after: "1", unit: "steps" }), pt({ before: "", after: "40,000", unit: "" }), pt({ approximate: true, verified: true })]) {
      expect(proofPointsFromRows([rowOf(p)], [p])).toEqual([p]);
    }
  });

  it("reads an edited '31% → 44%' back as a before and after in percent", () => {
    const p = pt({});
    const [out] = proofPointsFromRows([rowOf(p, { value: "28% → 52%" })], [p]);
    expect(out).toMatchObject({ label: "act", metric: "Activation", before: "28", after: "52", unit: "%" });
    expect(numberText(out)).toBe("28% → 52%");
  });

  it("keeps a unit like steps when only the numbers change, and keeps the tick", () => {
    const p = pt({ before: "3", after: "1", unit: "steps", verified: true });
    const [out] = proofPointsFromRows([rowOf(p, { value: "4 → 2" })], [p]);
    expect(out).toMatchObject({ before: "4", after: "2", unit: "steps", verified: true });
  });

  it("renaming alone keeps the fields", () => {
    const p = pt({ approximate: true });
    const [out] = proofPointsFromRows([rowOf(p, { label: "Seven-day activation" })], [p]);
    expect(out).toEqual({ ...p, metric: "Seven-day activation" });
  });

  it("a lone edited percent stays a percent", () => {
    const p = pt({ before: "", after: "18" });
    const [out] = proofPointsFromRows([rowOf(p, { value: "22%" })], [p]);
    expect(out).toMatchObject({ before: "", after: "22", unit: "%" });
  });

  it("angles and the number check follow an edit", () => {
    const p = pt({});
    const [out] = proofPointsFromRows([rowOf(p, { value: "28% → 52%" })], [p]);
    expect(numberList({ proof_points: [out] })[0].value).toBe("28% → 52%");
    expect(checkAngleNumbers("Activation went from 28% to 52%", [out]).ok).toBe(true);
    expect(checkAngleNumbers("Activation went from 31% to 44%", [out]).ok).toBe(false);
  });
});
