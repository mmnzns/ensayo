import { beforeEach, describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import type { Application, Story, Target } from "../data/types";
import type { RepApi } from "../practice/api";
import { banksFor, packSize, pickQuestions } from "../practice/questions";
import { beginRecording, getLive, resetLive, setRepApi, startLive, stopAndFinish } from "../practice/live";
import { pickStories } from "../practice/stories";
import { practiceTargetFor } from "../practice/sessionTarget";
import { SWITCH_BLOCKED, switchBlocked } from "../practice/switching";
import type { FinishArgs, RepOutcome } from "../practice/types";

const t = (id: string, over: Partial<Target> = {}): Target => ({
  id, name: id, color: "coral", role: "Senior Lifecycle Marketing Manager", roleFamily: "lifecycle", seniority: "senior", industry: "Fintech", sellsTo: "b2c", companyStage: "any", pitch: "I fix activation.", leadWith: [],
  pinnedStoryIds: [], hiddenStoryIds: [], defaultProcess: ["recruiter", "hiring_manager"], baseResume: null, payRange: null, archived: false, createdAt: "2026-10-22T00:00:00Z", ...over,
});

describe("the question pack follows the target's kind of role", () => {
  const general = banksFor(t("x", { roleFamily: "other", role: "Chef" })).length;
  it("gives lifecycle the lifecycle pack and the general set", () => {
    expect(banksFor(t("a")).length).toBe(general + 70);
  });
  it("gives marketing ops the same pack, which covers both kinds of role", () => {
    expect(banksFor(t("a", { roleFamily: "marketing_ops" })).length).toBe(general + 70);
  });
  it("gives the other kinds the general set, since no pack exists for them yet", () => {
    for (const roleFamily of ["growth", "product_marketing", "other"] as const) expect(banksFor(t("a", { roleFamily })).length).toBe(general);
  });
  it("says how big each pack is, none for a kind of role without one", () => {
    expect(packSize("lifecycle")).toBe(70);
    expect(packSize("marketing_ops")).toBe(70);
    expect(packSize("growth")).toBe(0);
  });
  it("still takes a role in words, as before", () => {
    expect(banksFor("Senior Lifecycle Marketing Manager").length).toBe(general + 70);
    expect(banksFor("Accountant").length).toBe(general);
  });
});

describe("stories a question is measured against", () => {
  const stories: Story[] = mockStore.stories;
  const q = { ...pickQuestions({ bank: banksFor("Senior Lifecycle Marketing Manager"), stage: "hiring_manager", mode: "drill", count: 8, seed: 3 })[0], text: "Tell me about improving a metric.", competencies: ["improving a metric"], behavioral_situation: null, best_story_id: null };
  const top = pickStories(q, stories, []).map((s) => s.id);
  it("never includes a hidden story", () => {
    expect(top.length).toBe(3);
    const without = pickStories(q, stories, [], t("a", { hiddenStoryIds: [top[0]] })).map((s) => s.id);
    expect(without).not.toContain(top[0]);
    expect(without).toHaveLength(3);
  });
  it("puts a pinned story first when it fits, even if it would have been left out", () => {
    const fitting = stories.filter((s) => s.competencies.includes("improving a metric")).map((s) => s.id);
    const left = fitting.find((id) => !top.includes(id))!;
    expect(left).toBeTruthy();
    expect(pickStories(q, stories, [], t("a", { pinnedStoryIds: [left] }))[0].id).toBe(left);
  });
  it("does not pull in a pinned story that does not fit the question", () => {
    const never = { ...stories[0], id: "never", title: "Never", competencies: [], best_for: [], proof_points: [], verified: false };
    expect(pickStories(q, [...stories, never], [], t("a", { pinnedStoryIds: ["never"] })).map((s) => s.id)).not.toContain("never");
  });
});

describe("which target a session is for", () => {
  const a = t("tg_a");
  const b = t("tg_b");
  const app = (targetId: string | undefined): Application => ({ ...mockStore.applications[0], targetId });
  it("is the application's target when practising an application", () => {
    expect(practiceTargetFor(app("tg_b"), [a, b], a)).toBe(b);
  });
  it("is the first target for an application from before targets", () => {
    expect(practiceTargetFor(app(undefined), [a, b], b)).toBe(a);
  });
  it("is the active target otherwise", () => {
    expect(practiceTargetFor(undefined, [a, b], b)).toBe(b);
  });
});

describe("switching target during a session", () => {
  it("is blocked while a session is running and says so plainly", () => {
    expect(SWITCH_BLOCKED).toBe("Finish or end this session before you switch.");
    expect(switchBlocked({ active: true, phase: "asking" })).toBe(SWITCH_BLOCKED);
    expect(switchBlocked({ active: true, phase: "result" })).toBe(SWITCH_BLOCKED);
  });
  it("is fine when nothing is running or the session is over", () => {
    expect(switchBlocked({ active: false, phase: "idle" })).toBeNull();
    expect(switchBlocked({ active: true, phase: "idle" })).toBeNull();
  });
});

describe("a session carries its target", () => {
  const finished: FinishArgs[] = [];
  const api = {
    startRecording: async () => undefined,
    stopRecording: async () => ({ path: "/tmp/r.wav", duration_ms: 1000 }),
    finishRep: async (args: FinishArgs) => (finished.push(args), { outcome: "didnt_catch", session_id: "s", rep: null, delta: null, restart_offered: false, audio_kept: false, notice: null, transcript_text: null } as RepOutcome),
  } as unknown as RepApi;
  beforeEach(() => {
    resetLive();
    finished.length = 0;
    setRepApi(api);
  });
  const ctx = (target?: Target) => ({ targetRole: "x", stories: mockStore.stories, methods: mockStore.methods, target });

  it("asks the pack of the target and sends its id with every answer", async () => {
    startLive({ mode: "drill", stage: "hiring_manager", count: 2, source: "stage" }, ctx(t("tg_b2b", { roleFamily: "marketing_ops" })));
    expect(getLive().targetId).toBe("tg_b2b");
    await beginRecording();
    await stopAndFinish();
    expect(finished[0].target_id).toBe("tg_b2b");
  });
  it("sends none when no target is known, and the backend uses the active one", async () => {
    startLive({ mode: "drill", stage: "hiring_manager", count: 2, source: "stage" }, ctx());
    expect(getLive().targetId).toBeNull();
    await beginRecording();
    await stopAndFinish();
    expect(finished[0].target_id).toBeUndefined();
  });
});
