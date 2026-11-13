import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import { StoreProvider, type Store } from "../data/store";
import type { SessionDetail } from "../practice/api";
import { costLine, engineNameFor, formatCost, sessionCostUsd, sessionModelName } from "../practice/cost";
import { debriefOfSession } from "../practice/debrief";
import { drillView, sessionList, type RepSummary } from "../practice/habits";
import type { FullRep } from "../practice/types";
import { routes as resultsRoutes } from "../screens/results";
import { drillCostText } from "../screens/results/SessionResultsDrill";
import { mockCostText } from "../screens/results/SessionResultsMockDebrief";
import { routes as settingsRoutes } from "../screens/settings";

const paid = { kind: "key" as const, label: "Claude Sonnet 5.5" };
const local = { kind: "local" as const, label: "Built-in model" };
const timing = { kind: "timing" as const, label: "Timing only" };

describe("the cost wording", () => {
  it("says less than a cent under a tenth of a cent, one decimal under a cent, whole cents, then dollars", () => {
    expect(formatCost(0.0004)).toBe("less than a cent");
    expect(formatCost(0.00099)).toBe("less than a cent");
    expect(formatCost(0.001)).toBe("about 0.1 cents");
    expect(formatCost(0.004)).toBe("about 0.4 cents");
    expect(formatCost(0.0094)).toBe("about 0.9 cents");
    expect(formatCost(0.0098)).toBe("about 1 cent");
    expect(formatCost(0.01)).toBe("about 1 cent");
    expect(formatCost(0.06)).toBe("about 6 cents");
    expect(formatCost(0.456)).toBe("about 46 cents");
    expect(formatCost(0.996)).toBe("about $1.00");
    expect(formatCost(1.2)).toBe("about $1.20");
    expect(formatCost(12.345)).toBe("about $12.35");
  });

  it("names the engine where it is known and shows nothing for a session that cost nothing", () => {
    expect(costLine(0.06, "Claude Sonnet 5.5")).toBe("about 6 cents with Claude Sonnet 5.5");
    expect(costLine(0.004)).toBe("about 0.4 cents");
    expect(costLine(0)).toBeNull();
    expect(costLine(Number.NaN)).toBeNull();
    expect(costLine(-1)).toBeNull();
    expect(`${formatCost(0.004)} ${costLine(0.0004)}`).not.toContain("—");
  });

  it("names the model that judged, else a paid engine set up now, never a local or missing one", () => {
    expect(engineNameFor("Claude Haiku 5.0", paid)).toBe("Claude Haiku 5.0");
    expect(engineNameFor(null, paid)).toBe("Claude Sonnet 5.5");
    expect(engineNameFor(null, local)).toBeNull();
    expect(engineNameFor(null, timing)).toBeNull();
  });
});

describe("where a session's cost comes from", () => {
  it("is the last running total, not the sum, because each answer records the session's total so far", () => {
    expect(sessionCostUsd([{ n: 1, ai_cost_usd: 0.01 }, { n: 2, ai_cost_usd: 0.025 }, { n: 3, ai_cost_usd: 0.04 }])).toBeCloseTo(0.04, 9);
    expect(sessionCostUsd([{ n: 3, ai_cost_usd: 0.04 }, { n: 1, ai_cost_usd: 0.01 }, { n: 2, ai_cost_usd: 0.025 }])).toBeCloseTo(0.04, 9);
  });

  it("keeps the earlier total when the app was closed and the session continued with a fresh total", () => {
    expect(sessionCostUsd([{ n: 1, ai_cost_usd: 0.02 }, { n: 2, ai_cost_usd: 0.04 }, { n: 3, ai_cost_usd: 0.01 }, { n: 4, ai_cost_usd: 0.03 }])).toBeCloseTo(0.07, 9);
  });

  it("is zero for timing only (no AI recorded) and for local AI (a total of zero)", () => {
    expect(sessionCostUsd([{ n: 1, ai_cost_usd: null }, { n: 2 }])).toBe(0);
    expect(sessionCostUsd([{ n: 1, ai_cost_usd: 0 }, { n: 2, ai_cost_usd: 0 }])).toBe(0);
    expect(sessionCostUsd([])).toBe(0);
  });

  it("reads the model from the last judged answer", () => {
    expect(sessionModelName([{ n: 1, ai_model: "claude-sonnet-5-5" }, { n: 2, ai_model: null }])).toBe("Claude Sonnet 5.5");
    expect(sessionModelName([{ n: 1, ai_model: null }])).toBeNull();
    expect(sessionModelName([{ n: 1, ai_model: "llama3.2" }])).toBeNull();
  });
});

function summary(n: number, cost: number | null, over: Partial<RepSummary> = {}): RepSummary {
  return {
    session_id: "s1",
    mode: "drill",
    stage: "hiring_manager",
    application_id: null,
    started: "2026-10-20T10:00:00Z",
    n,
    question_id: `q${n}`,
    question_text: "Q",
    question_type: "behavioral",
    attempt: 1,
    follow_up: false,
    recorded_at: `2026-10-20T10:0${n}:00Z`,
    rubric_version: 1,
    fix: null,
    note: null,
    note_was_wrong: false,
    checks: [{ id: "proof", passed: true, evidence: "", sentences: [], seconds: null }],
    speaking_ms: 50_000,
    fillers: 0,
    tail_ms: null,
    ai_cost_usd: cost,
    ai_model: cost ? "claude-sonnet-5-5" : null,
    ...over,
  };
}

describe("the Session results line", () => {
  const view = (costs: (number | null)[]) => drillView(mockStore.habits, costs.map((c, i) => summary(i + 1, c)), [], [])!;

  it("comes from the running total and names the model", () => {
    const v = view([0.002, 0.005]);
    expect(v.totals.costUsd).toBeCloseTo(0.005, 9);
    expect(drillCostText(v.totals, timing)).toBe(" · about 0.5 cents with Claude Sonnet 5.5");
    expect(drillCostText({ costUsd: 0.0004, engineName: null }, paid)).toBe(" · less than a cent with Claude Sonnet 5.5");
    expect(drillCostText({ costUsd: 0.06, engineName: null }, paid)).toBe(" · about 6 cents with Claude Sonnet 5.5");
    expect(drillCostText({ costUsd: 1.2, engineName: null }, paid)).toBe(" · about $1.20 with Claude Sonnet 5.5");
  });

  it("is empty for local AI and timing-only sessions", () => {
    expect(drillCostText(view([0, 0]).totals, local)).toBe("");
    expect(drillCostText(view([null, null]).totals, timing)).toBe("");
  });

  it("shows on the screen, and not when the session cost nothing", () => {
    const withCost = (costUsd: number, engineName: string | null): Store => ({ ...mockStore, screens: { ...mockStore.screens, results: { ...mockStore.screens.results, drill: { ...mockStore.screens.results.drill, totals: { answers: 12, followUps: 2, costUsd, engineName } } } } });
    const html = (s: Store) => renderToStaticMarkup(createElement(StoreProvider, { store: s, children: createElement(resultsRoutes["4-3-session-results-drill"]) }));
    expect(html(withCost(0.004, "Claude Sonnet 5.5"))).toContain("about 0.4 cents with Claude Sonnet 5.5");
    expect(html(withCost(0, null))).not.toContain("cents");
    expect(html(withCost(0, null))).not.toContain("less than a cent");
  });
});

function full(n: number, cost: number | null, model: string | null = "claude-sonnet-5-5"): FullRep {
  return {
    session_id: "s",
    n,
    question_id: `q${n}`,
    question_text: `Question ${n}`,
    question_type: "behavioral",
    behavioral_situation: null,
    commitment_check: false,
    builder_operator_check: false,
    is_major_story: true,
    founder_variant: false,
    attempt: 1,
    recorded_at: `2026-10-22T10:0${n}:00Z`,
    story_ids: [],
    follow_up: null,
    fix: null,
    note: null,
    rewrite: null,
    ai: cost === null ? null : { prompts: [], rubric_version: 1, cost_usd: cost, model },
    feedback: null,
    transcript: [],
    metrics: {
      rubric_version: 1,
      outcome: "scored",
      words: [],
      sentences: [{ index: 1, text: "I decided.", start_ms: 0, end_ms: 2000, first_word: 0, word_count: 2 }],
      word_count: 2,
      speaking_ms: 60_000,
      wpm: 120,
      window: { min_s: 60, max_s: 90 },
      length: "fits",
      fillers: { count: 0, per_minute: 0, items: [] },
      pauses: [],
      proof: { matched: [], landed_sentence: null, tail_ms: null },
      unbanked: [],
      restart_at: null,
      checks: [],
    },
  };
}

const detail = (reps: FullRep[]): SessionDetail => ({ session: { id: "s", mode: "mock", stage: "leadership", application_id: null, started: "2026-10-22T10:00:00Z" }, reps });

describe("the Mock debrief line", () => {
  it("is built from the answers' running total and the model that judged", () => {
    const d = debriefOfSession(mockStore.habits, detail([full(1, 0.01), full(2, 0.03)]), null, [])!.data;
    expect(d.costUsd).toBeCloseTo(0.03, 9);
    expect(d.engineName).toBe("Claude Sonnet 5.5");
    expect(mockCostText(d, timing)).toBe("This mock cost about 3 cents with Claude Sonnet 5.5.");
    expect(mockCostText({ costUsd: 0.004, engineName: null }, paid)).toBe("This mock cost about 0.4 cents with Claude Sonnet 5.5.");
    expect(mockCostText({ costUsd: 0.0002, engineName: null }, paid)).toBe("This mock cost less than a cent with Claude Sonnet 5.5.");
  });

  it("is left out for local AI and timing-only mocks", () => {
    const localRun = debriefOfSession(mockStore.habits, detail([full(1, 0, "llama3.2"), full(2, 0, "llama3.2")]), null, [])!.data;
    const timingRun = debriefOfSession(mockStore.habits, detail([full(1, null), full(2, null)]), null, [])!.data;
    expect(mockCostText(localRun, local)).toBeNull();
    expect(mockCostText(timingRun, timing)).toBeNull();
  });

  it("shows on the screen", () => {
    const withCost = (costUsd: number): Store => ({ ...mockStore, screens: { ...mockStore.screens, results: { ...mockStore.screens.results, debrief: { ...mockStore.screens.results.debrief, costUsd, engineName: "Claude Sonnet 5.5" } } } });
    const html = (s: Store) => renderToStaticMarkup(createElement(StoreProvider, { store: s, children: createElement(resultsRoutes["4-4-session-results-mock-debrief"]) }));
    expect(html(withCost(0.06))).toContain("This mock cost about 6 cents with Claude Sonnet 5.5.");
    expect(html(withCost(0))).not.toContain("This mock cost");
  });
});

describe("the session list line", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const rows = (reps: RepSummary[]) => sessionList(reps, now, () => undefined);

  it("carries the session's cost, from the last running total", () => {
    expect(rows([summary(1, 0.002), summary(2, 0.0041)])[0].cost).toBe("about 0.4 cents");
    expect(rows([summary(1, 0.03), summary(2, 0.06)])[0].cost).toBe("about 6 cents");
    expect(rows([summary(1, 0.0003)])[0].cost).toBe("less than a cent");
  });

  it("has none for local AI or timing only", () => {
    expect(rows([summary(1, 0), summary(2, 0)])[0].cost).toBeUndefined();
    expect(rows([summary(1, null)])[0].cost).toBeUndefined();
  });

  it("shows on the Sessions list only for the rows that have it", () => {
    const store: Store = { ...mockStore, sessions: mockStore.sessions.map((s, i) => (i === 0 ? { ...s, cost: "about 0.4 cents" } : { ...s, cost: undefined })) };
    const html = renderToStaticMarkup(createElement(StoreProvider, { store, children: createElement(settingsRoutes["7-2-progress-sessions"]) }));
    expect(html.match(/data-cost/g)?.length).toBe(1);
    expect(html).toContain("about 0.4 cents");
    expect(html).not.toContain("—");
  });
});
