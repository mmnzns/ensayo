import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import type { Claim } from "../data/types";
import { ADD_KINDS, groupClaims, numberIn } from "../screens/applications/claimsLog";

const claim = (id: string, subject: string, status: Claim["status"], over: Partial<Claim> = {}): Claim => ({ id, type: "notice", subject, value: id, quote: id, stage: "stg_1", stage_label: "Recruiter", status, ...over });

describe("the claims log", () => {
  it("groups lines by subject in the order each first appears", () => {
    const groups = groupClaims([claim("a", "Notice period", "consistent"), claim("b", "Pay range", "said_once"), claim("c", "Notice period", "consistent")]);
    expect(groups.map((g) => [g.subject, g.claims.map((c) => c.id)])).toEqual([["Notice period", ["a", "c"]], ["Pay range", ["b"]]]);
  });

  it("says a conflict that still stands, and names the line that disagrees", () => {
    const [g] = groupClaims([claim("a", "Reactivation", "consistent"), claim("b", "Reactivation", "differs")]);
    expect(g.status).toBe("differs");
    expect(g.differs?.id).toBe("b");
  });

  it("strikes the lines a newer answer replaced, from the app's own flag", () => {
    const [g] = groupClaims([claim("a", "Notice period", "consistent", { superseded: true }), claim("b", "Notice period", "updated", { superseded: false })]);
    expect([...g.struck]).toEqual(["a"]);
    expect(g.status).toBe("updated");
  });

  it("strikes the lines before the updated one in the sample data, which has no flag", () => {
    const [g] = groupClaims([claim("a", "Notice period", "consistent"), claim("b", "Notice period", "updated")]);
    expect([...g.struck]).toEqual(["a"]);
  });

  it("does not let a replaced line that differed keep the group flagged", () => {
    const [g] = groupClaims([claim("a", "Number", "differs", { superseded: true }), claim("b", "Number", "updated", { superseded: false })]);
    expect(g.status).toBe("updated");
    expect(g.differs).toBeUndefined();
  });

  it("a group of one stands as that line does; several that agree are consistent", () => {
    expect(groupClaims([claim("a", "Pay range", "said_once")])[0].status).toBe("said_once");
    expect(groupClaims([claim("a", "X", "consistent"), claim("b", "X", "consistent")])[0].status).toBe("consistent");
  });

  it("works on the sample data", () => {
    const groups = groupClaims(mockStore.applications[0].claims);
    expect(groups.length).toBeGreaterThan(3);
    expect(groups.find((g) => g.subject === "Reactivation result")?.status).toBe("differs");
  });

  it("finds the first number in a line", () => {
    expect(numberIn("About 5 percent")).toBe("5");
    expect(numberIn("Four weeks")).toBeUndefined();
    expect(numberIn("4.8 percent")).toBe("4.8");
  });

  it("offers only kinds of line the backend knows", () => {
    const known = ["reason_for_leaving", "why_this_company", "compensation", "availability", "role_title", "tenure", "proof_number"];
    for (const k of ADD_KINDS) expect(known).toContain(k.id);
  });
});
