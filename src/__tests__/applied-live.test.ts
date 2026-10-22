import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockStore } from "../data/mock";
import type { RepApi } from "../practice/api";
import { askMockDebrief, beginRecording, getLive, recordMustSay, resetLive, setRepApi, startLive, stopAndFinish } from "../practice/live";
import type { ExtraQuestion } from "../practice/questions";
import type { FinishArgs, FullRep, RepOutcome } from "../practice/types";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

function repOf(): FullRep {
  return { session_id: "ses_a", n: 1, question_id: "q", question_text: "Q", question_type: "behavioral", behavioral_situation: null, commitment_check: false, builder_operator_check: false, is_major_story: true, founder_variant: false, attempt: 1, recorded_at: "2026-10-21T10:00:00Z", story_ids: [], follow_up: null, fix: null, note: null, rewrite: null, ai: null, feedback: null, transcript: [], metrics: { rubric_version: 1, outcome: "scored", words: [], sentences: [], word_count: 0, speaking_ms: 50_000, wpm: 120, window: { min_s: 45, max_s: 60 }, length: "fits", fillers: { count: 0, per_minute: 0, items: [] }, pauses: [], proof: { matched: [], landed_sentence: null, tail_ms: null }, unbanked: [], restart_at: null, checks: [] } };
}

function fake() {
  const finished: FinishArgs[] = [];
  const debriefs: unknown[] = [];
  const api: RepApi = {
    startRecording: async () => undefined,
    stopRecording: async () => ({ path: "/tmp/rec.wav", duration_ms: 50_000 }),
    level: async () => null,
    finishRep: async (args) => {
      finished.push(args);
      return { outcome: "scored", session_id: "ses_a", rep: repOf(), delta: null, restart_offered: false, audio_kept: true, notice: null, transcript_text: null } satisfies RepOutcome;
    },
    rescoreRep: async () => Promise.reject(new Error("no")),
    deleteRep: async () => undefined,
    labelRep: async () => undefined,
    nextFollowUp: async () => Promise.reject(new Error("no")),
    clarifyReply: async () => "",
    aiReady: async () => false,
    discardRecording: async () => undefined,
    labelCriteria: async () => undefined,
    repLabels: async () => ({}),
    audioAvailable: async () => false,
    readAudio: async () => new ArrayBuffer(0),
    loadSession: async () => null,
    mockDebrief: async (args) => {
      debriefs.push(args);
      return { questions: [], weakest: 0, try_asking: "", note: "", must_say_said: [] };
    },
  };
  return { api, finished, debriefs };
}

const ctx = { targetRole: "Senior Lifecycle Marketing Manager", stories: mockStore.stories, methods: mockStore.methods };
const extras: ExtraQuestion[] = [
  { id: "q_1", stageId: "stg_2", type: "behavioral", text: "Tell me about a time you rebuilt onboarding." },
  { id: "q_2", stageId: "stg_2", type: "future", text: "What would your first 60 days look like?" },
  { id: "q_3", stageId: "stg_1", type: "about_you", text: "Give me the short version." },
];

beforeEach(() => {
  resetLive();
  invoke.mockReset();
});

describe("a session inside an application", () => {
  it("asks that stage's own questions first and keeps the application and the stage", () => {
    startLive({ mode: "drill", stage: "hiring_manager", count: 3, source: "application", applicationId: "app_1", stageId: "stg_2", extras }, ctx);
    const s = getLive();
    expect(s.questions.map((q) => q.id).slice(0, 2)).toEqual(["q_1", "q_2"]);
    expect(s.questions[1].type).toBe("future_looking");
    expect(s.questions).toHaveLength(3);
    expect(s.applicationId).toBe("app_1");
    expect(s.stageId).toBe("stg_2");
  });

  it("uses the bank when the application's questions have not loaded", () => {
    startLive({ mode: "drill", stage: "hiring_manager", count: 3, source: "application", applicationId: "app_1", stageId: "stg_2" }, ctx);
    expect(getLive().questions).toHaveLength(3);
    expect(getLive().questions.every((q) => q.stages.includes("hiring_manager"))).toBe(true);
  });

  it("sends the application, the stage and the founder variant with every answer", async () => {
    const { api, finished } = fake();
    setRepApi(api);
    startLive({ mode: "drill", stage: "leadership", count: 2, source: "application", applicationId: "app_1", stageId: "stg_4", startup: true, extras: [] }, ctx);
    await beginRecording();
    await stopAndFinish();
    expect(finished[0]).toMatchObject({ application_id: "app_1", stage_id: "stg_4", stage: "leadership", founder_variant: true });
  });

  it("sends no stage outside an application, and no founder variant outside a startup's leadership stage", async () => {
    const { api, finished } = fake();
    setRepApi(api);
    startLive({ mode: "drill", stage: "hiring_manager", count: 2, source: "stage", applicationId: null, stageId: "stg_9", startup: true }, ctx);
    await beginRecording();
    await stopAndFinish();
    expect(finished[0]).toMatchObject({ application_id: null, stage_id: null, founder_variant: false });
  });

  it("a Mock inside an application still ends with the closing questions", () => {
    startLive({ mode: "mock", stage: "hiring_manager", count: 3, source: "application", applicationId: "app_1", stageId: "stg_2", extras }, ctx);
    const qs = getLive().questions;
    expect(qs[qs.length - 1].type).toBe("candidate_questions");
    expect(qs.slice(0, 2).map((q) => q.id)).toEqual(["q_1", "q_2"]);
  });
});

describe("the Mock debrief call", () => {
  it("tells the model about the application", async () => {
    const { api, debriefs } = fake();
    setRepApi(api);
    await askMockDebrief("ses_a", { company: "Kestrel Pay", role: "Lifecycle lead", jdSummary: "Early startup", priorities: "Keep new customers\nDo more with less", mustSay: [{ id: "ms-1", text: "Ran lifecycle alone" }] });
    expect(debriefs[0]).toEqual({ session_id: "ses_a", company: "Kestrel Pay", role: "Lifecycle lead", jd_summary: "Early startup", priorities: "Keep new customers\nDo more with less", must_say: [{ id: "ms-1", text: "Ran lifecycle alone" }] });
  });

  it("sends nothing extra outside an application", async () => {
    const { api, debriefs } = fake();
    setRepApi(api);
    await askMockDebrief("ses_b", { role: "Accountant" });
    expect(debriefs[0]).toMatchObject({ company: "this company", role: "Accountant", jd_summary: "", priorities: "", must_say: [] });
  });
});

describe("saving what was said out loud", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("saves once per Mock, however often the debrief is opened", async () => {
    invoke.mockResolvedValue({});
    expect(await recordMustSay("ses_m1", "app_1", ["ms-1"])).toBe(true);
    expect(invoke).toHaveBeenCalledWith("record_must_say", { applicationId: "app_1", saidIds: ["ms-1"] });
    expect(await recordMustSay("ses_m1", "app_1", ["ms-1"])).toBe(false);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("remembers across runs, so reopening an old debrief does not count it again", async () => {
    store.set("ensayo:must-say-recorded", JSON.stringify(["ses_m2"]));
    expect(await recordMustSay("ses_m2", "app_1", ["ms-1"])).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("ignores a failure", async () => {
    invoke.mockRejectedValue("must-say item ms-9 not found");
    expect(await recordMustSay("ses_m3", "app_1", ["ms-9"])).toBe(false);
  });

  it("does nothing in the browser", async () => {
    vi.stubGlobal("window", {});
    expect(await recordMustSay("ses_m4", "app_1", ["ms-1"])).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
});
