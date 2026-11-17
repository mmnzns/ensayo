import { describe, expect, it } from "vitest";
import { cardHeadline, proofPointsFromRows } from "../data/actions";
import type { ProofPoint } from "../data/types";
import { numberList } from "../screens/stories/angles";
import { numberText } from "../screens/stories/helpers";
import { stripPercent, withPercent } from "../screens/stories/percent";

const pt = (over: Partial<ProofPoint>): ProofPoint => ({ label: "x", metric: "Rate", before: "31", after: "44", unit: "%", approximate: false, verified: false, ...over });

describe("one percent sign", () => {
  it("adds the sign only when it is missing", () => {
    expect(withPercent("40")).toBe("40%");
    expect(withPercent("about 40%")).toBe("about 40%");
    expect(withPercent(" 40% ")).toBe("40%");
    expect(stripPercent("about 40%")).toBe("about 40");
    expect(stripPercent("40")).toBe("40");
  });

  it("shows a saved 'about 40%' to 'about 80%' once", () => {
    const p = pt({ before: "about 40%", after: "about 80%" });
    expect(numberText(p)).toBe("about 40% → about 80%");
    expect(numberList({ proof_points: [p] })[0].value).toBe("about 40% → about 80%");
    expect(cardHeadline([p], "")).toBe("Rate about 40% → about 80%");
  });

  it("still shows plain stored values as before", () => {
    expect(numberText(pt({}))).toBe("31% → 44%");
    expect(numberText(pt({ before: "", after: "18" }))).toBe("18%");
    expect(numberText(pt({ before: "3", after: "1", unit: "" }))).toBe("3 → 1");
  });

  it("strips a stored sign on save", () => {
    const p = pt({ label: "r", before: "about 40%", after: "about 80%" });
    const [out] = proofPointsFromRows([{ id: "r", label: "Rate", value: "about 40% → about 80%", checked: true }], [p]);
    expect(out.before).toBe("about 40");
    expect(out.after).toBe("about 80");
    expect(out.unit).toBe("%");
    expect(out.verified).toBe(true);
  });
});
