import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import type { Application, Target, TargetFit } from "../data/types";
import { asksToRebuild, filterByTarget, filterChoices, fitClass, fitNote, fitRows, sellsToFrom, stagesFor, stagesLine, suggestTarget } from "../screens/applications/targetPick";

const [b2c, b2b] = mockStore.targets;
const targets: Target[] = [b2c, b2b];
const app = (over: Partial<Application> = {}): Application => ({ ...mockStore.applications[0], targetId: "tg_b2c", targetFit: null, ...over });

const b2bFit: TargetFit = {
  sellsTo: "b2b",
  roleFamily: "marketing_ops",
  seniority: "senior",
  bestTargetId: "tg_b2b",
  mismatchNotes: ["Ledgerline sells to finance teams at mid-size companies, and the role is marketing ops."],
  perTarget: [
    { targetId: "tg_b2c", fit: "weak", why: "Different buyer and role." },
    { targetId: "tg_b2b", fit: "strong", why: "Same buyer, role and seniority." },
  ],
};

describe("which target a new application starts under", () => {
  it("is the active target when the role and posting say nothing", () => {
    expect(suggestTarget("", "", targets, "tg_b2c")).toBe("tg_b2c");
    expect(suggestTarget("Analyst", "", targets, "tg_b2b")).toBe("tg_b2b");
  });
  it("follows the role typed", () => {
    expect(suggestTarget("Marketing Operations Manager", "", targets, "tg_b2c")).toBe("tg_b2b");
    expect(suggestTarget("Senior Lifecycle Marketing Manager", "", targets, "tg_b2b")).toBe("tg_b2c");
  });
  it("follows who the posting says the company sells to", () => {
    expect(suggestTarget("Marketing Manager", "We sell SaaS to finance teams.", targets, "tg_b2c")).toBe("tg_b2b");
    expect(suggestTarget("Marketing Manager", "Our app has 2 million subscribers.", targets, "tg_b2b")).toBe("tg_b2c");
  });
  it("skips archived targets and says nothing when there are none", () => {
    expect(suggestTarget("Marketing Operations Manager", "", [b2c, { ...b2b, archived: true }], "tg_b2c")).toBe("tg_b2c");
    expect(suggestTarget("x", "", [], null)).toBeNull();
  });
  it("reads b2b and b2c words but not a bare bank account", () => {
    expect(sellsToFrom("B2B fintech SaaS")).toBe("b2b");
    expect(sellsToFrom("a consumer app")).toBe("b2c");
    expect(sellsToFrom("open a bank account in minutes")).toBeNull();
    expect(sellsToFrom("consumers and enterprise buyers")).toBeNull();
  });
});

describe("stages", () => {
  it("start from the target's usual stages, or the usual four", () => {
    expect(stagesFor({ defaultProcess: ["recruiter", "panel"] })).toEqual(["recruiter", "panel"]);
    expect(stagesFor({ defaultProcess: [] })).toEqual(["recruiter", "hiring_manager", "technical", "panel"]);
    expect(stagesFor(undefined)).toHaveLength(4);
  });
  it("say where they started from until the person changes them", () => {
    expect(stagesLine(b2c, false)).toBe("Started from B2C lifecycle's usual stages. Use the arrows to reorder. Add dates as you get them.");
    expect(stagesLine(b2c, true)).toBe("In the order you'll meet them. Use the arrows to reorder. Add dates as you get them.");
  });
});

describe("the list by target", () => {
  const apps = [app({ id: "1", targetId: "tg_b2c" }), app({ id: "2", targetId: "tg_b2b" }), app({ id: "3", targetId: undefined })];
  it("shows everything, or one target's applications, with a missing target meaning the first", () => {
    expect(filterByTarget(apps, targets, "all")).toHaveLength(3);
    expect(filterByTarget(apps, targets, "tg_b2c").map((a) => a.id)).toEqual(["1", "3"]);
    expect(filterByTarget(apps, targets, "tg_b2b").map((a) => a.id)).toEqual(["2"]);
  });
  it("offers an archived target only while an application is filed under it", () => {
    const archived = [b2c, { ...b2b, archived: true }];
    expect(filterChoices([apps[0]], archived).map((t) => t.id)).toEqual(["tg_b2c"]);
    expect(filterChoices([apps[1]], archived).map((t) => t.id)).toEqual(["tg_b2c", "tg_b2b"]);
  });
});

describe("the fit banner", () => {
  it("names the buyer and where the application is filed, and offers the better target", () => {
    const n = fitNote(app({ targetFit: b2bFit }), targets);
    expect(n?.headline).toBe("This posting is B2B. It's filed under B2C lifecycle.");
    expect(n?.body).toBe("Ledgerline sells to finance teams at mid-size companies, and the role is marketing ops. Your B2B marketing ops target fits better: its pitch, questions and lead stories match this job.");
    expect(n?.suggested?.id).toBe("tg_b2b");
  });
  it("is quiet before the posting is read and when the filed target fits", () => {
    expect(fitNote(app(), targets)).toBeNull();
    expect(fitNote(app({ targetId: "tg_b2b", targetFit: b2bFit }), targets)).toBeNull();
  });
  it("talks about the role when the buyer is the same", () => {
    const fit: TargetFit = { ...b2bFit, sellsTo: "b2c", roleFamily: "growth", bestTargetId: null, mismatchNotes: [], perTarget: [{ targetId: "tg_b2c", fit: "weak", why: "" }, { targetId: "tg_b2b", fit: "weak", why: "" }] };
    const n = fitNote(app({ targetFit: fit }), targets);
    expect(n?.headline).toBe("This posting is a growth role. It's filed under B2C lifecycle.");
    expect(n?.suggested).toBeNull();
    expect(n?.body).toContain("make a new one");
  });
});

describe("how each target reads the posting", () => {
  it("lists the live targets in their own order, with the fit and why", () => {
    const rows = fitRows(b2bFit, targets);
    expect(rows.map((r) => [r.target.name, r.fit])).toEqual([["B2C lifecycle", "weak"], ["B2B marketing ops", "strong"]]);
    expect(fitRows(b2bFit, [b2c, { ...b2b, archived: true }])).toHaveLength(1);
    expect(fitRows(null, targets)).toEqual([]);
  });
  it("use the design's badge classes", () => {
    expect(fitClass("strong")).toBe("e-badge e-badge-ok");
    expect(fitClass("weak")).toBe("e-badge");
  });
});

describe("changing an application's target", () => {
  it("asks about the question set only when the target changes and a set exists", () => {
    const withReading = app({ analysis: mockStore.applications[0].analysis });
    expect(asksToRebuild(withReading, 0, "tg_b2b", targets)).toBe(true);
    expect(asksToRebuild(app({ analysis: null }), 4, "tg_b2b", targets)).toBe(true);
    expect(asksToRebuild(withReading, 5, "tg_b2c", targets)).toBe(false);
    expect(asksToRebuild(app({ analysis: null }), 0, "tg_b2b", targets)).toBe(false);
  });
});

import { isKept, keepTarget } from "../screens/applications/fitKept";

describe("Keep the target", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  it("remembers the choice per application and target", () => {
    const s = memory();
    expect(isKept("a1", "tg_b2c", s)).toBe(false);
    keepTarget("a1", "tg_b2c", s);
    keepTarget("a1", "tg_b2c", s);
    expect(isKept("a1", "tg_b2c", s)).toBe(true);
    expect(isKept("a1", "tg_b2b", s)).toBe(false);
    expect(isKept("a2", "tg_b2c", s)).toBe(false);
  });
  it("copes with no storage and with junk in it", () => {
    expect(isKept("a1", "t", undefined)).toBe(false);
    expect(() => keepTarget("a1", "t", undefined)).not.toThrow();
    expect(isKept("a1", "t", { getItem: () => "not json" })).toBe(false);
  });
});

import { blankTarget } from "../data/targetState";
import { closestTarget, draftFromPosting, pitchNeedsWork } from "../screens/applications/targetPick";

describe("a new target from a posting", () => {
  const filed = app({ role: "Marketing Operations Manager", targetFit: b2bFit, startup: false });
  it("finds the closest target", () => {
    expect(closestTarget(filed, targets)?.id).toBe("tg_b2b");
    expect(closestTarget(app({ targetFit: { ...b2bFit, bestTargetId: null, perTarget: [{ targetId: "tg_b2c", fit: "ok", why: "" }, { targetId: "tg_b2b", fit: "weak", why: "" }] } }), targets)?.id).toBe("tg_b2c");
    expect(closestTarget(app({ targetFit: null }), targets)?.id).toBe("tg_b2c");
  });
  it("fills the target from the reading and copies the closest target's pitch, never writing one", () => {
    const { target, pitchCopied } = draftFromPosting(filed, targets, blankTarget(targets));
    expect(target).toMatchObject({ id: "", name: "B2B marketing ops", role: "Marketing Operations Manager", roleFamily: "marketing_ops", sellsTo: "b2b", seniority: "senior", leadWith: [], pinnedStoryIds: [], archived: false });
    expect(target.pitch).toBe(b2b.pitch);
    expect(target.defaultProcess).toEqual(b2b.defaultProcess);
    expect(pitchCopied).toBe(true);
  });
  it("marks a startup posting as a startup", () => {
    expect(draftFromPosting({ ...filed, startup: true }, targets, blankTarget(targets)).target.companyStage).toBe("startup");
  });
  it("asks for a pitch when it is still the copied one or empty", () => {
    expect(pitchNeedsWork("  I fix pipelines. ", "I fix pipelines.")).toBe(true);
    expect(pitchNeedsWork("", "x")).toBe(true);
    expect(pitchNeedsWork("My own words.", "I fix pipelines.")).toBe(false);
  });
});
