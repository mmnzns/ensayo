import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockStore } from "../data/mock";
import { StoreProvider, type Store } from "../data/store";
import type { Application } from "../data/types";
import type { RepApi } from "../practice/api";
import { beginRecording, resetLive, setRepApi, startLive, stopAndFinish } from "../practice/live";
import type { FullRep, RepOutcome } from "../practice/types";
import { clearSessionPreset } from "../screens/home/preset";
import { registry } from "../screens/registry";
import { Debrief } from "../screens/results/SessionResultsMockDebrief";

const extrasOf = vi.hoisted(() => ({ byId: {} as Record<string, unknown>, actions: {} as Record<string, unknown>, app: false }));
vi.mock("../data/real", async (original) => ({ ...(await original<Record<string, unknown>>()), useApplicationExtras: (id: string | null | undefined) => (id ? extrasOf.byId[id] : undefined), useActions: () => extrasOf.actions, isApp: () => extrasOf.app }));

const render = (id: string, store: Store = mockStore) => renderToStaticMarkup(createElement(StoreProvider, { store, children: createElement(registry[id]) }));
const stage = (id: string, at?: string) => ({ id, stage: "hiring_manager" as const, label: "Hiring manager", order: 1, done: false, decides: "", sessions: 0, ...(at ? { at } : {}) });
const application = (over: Partial<Application> = {}): Application => ({ ...mockStore.applications[0], id: "app_h", company: "Harbour Labs", status: "interviewing", process: [stage("s1", "2026-10-26T10:00")], current_stage_id: "s1", ...over });
const storeWith = (apps: Application[]): Store => ({ ...mockStore, now: () => new Date("2026-10-22T09:00:00"), applications: apps });

const rep: FullRep = { session_id: "ses_a", n: 1, question_id: "q_1", question_text: "How long is your notice?", question_type: "factual", behavioral_situation: null, commitment_check: false, builder_operator_check: false, is_major_story: false, founder_variant: false, attempt: 1, recorded_at: "2026-10-21T10:00:00Z", story_ids: [], follow_up: null, fix: "c1_consistent", note: "Pick one answer for your notice and say it the same way each time.", rewrite: null, ai: { prompts: [], rubric_version: 1, cost_usd: 0 }, feedback: null, transcript: [], metrics: { rubric_version: 1, outcome: "scored", words: [], sentences: [{ index: 1, text: "Two weeks.", start_ms: 0, end_ms: 1000, first_word: 0, word_count: 2 }], word_count: 2, speaking_ms: 12_000, wpm: 120, window: { min_s: 3, max_s: 20 }, length: "fits", fillers: { count: 0, per_minute: 0, items: [] }, pauses: [], proof: { matched: [], landed_sentence: null, tail_ms: null }, unbanked: [], restart_at: null, checks: [{ id: "c1_consistent", passed: false, evidence: 'In the recruiter stage you said "four weeks". Here you said "two weeks".', sentences: [1], seconds: null }] } };
const outcome: RepOutcome = { outcome: "scored", session_id: "ses_a", rep, delta: null, restart_offered: false, audio_kept: true, notice: null, transcript_text: null };
const api = { startRecording: async () => undefined, stopRecording: async () => ({ path: "/tmp/r.wav", duration_ms: 12_000 }), finishRep: async () => outcome, aiReady: async () => true, repLabels: async () => ({}) } as unknown as RepApi;

beforeEach(() => {
  extrasOf.byId = {};
  extrasOf.actions = {};
  extrasOf.app = false;
  setRepApi(api);
});
afterEach(() => {
  setRepApi(null);
  resetLive();
  clearSessionPreset();
});

const ctx = { targetRole: "Lifecycle lead", stories: mockStore.stories, methods: mockStore.methods };

describe("the closing questions of a Mock inside an application", () => {
  // count 0: the session is at the closing "what questions do you have for me?".
  const run = () => {
    startLive({ mode: "mock", stage: "hiring_manager", count: 0, source: "application", applicationId: "app_h", stageId: "s1" }, ctx);
    return storeWith([application()]);
  };

  it("shows the questions locked the night before for this stage", () => {
    extrasOf.byId.app_h = { questions: [], lockedByStage: { s1: { stageId: "s1", questions: ["How will you judge this hire in six months?", "What is in the way of that?"] }, s2: { stageId: "s2", questions: ["Another stage's question"] } } };
    const s = run();
    const html = render("4-2-mock-your-questions", s);
    expect(html).toContain("How will you judge this hire in six months?");
    expect(html).toContain("What is in the way of that?");
    expect(html).not.toContain("Another stage");
  });

  it("says none are locked when the stage has none, and when the questions have not loaded", () => {
    const s = run();
    expect(render("4-2-mock-your-questions", s)).toContain("No questions locked yet");
    extrasOf.byId.app_h = { questions: [], lockedByStage: {} };
    expect(render("4-2-mock-your-questions", s)).toContain("No questions locked yet");
  });
});

describe("Start a session when the application has its own questions but no posting", () => {
  const bare = application({ analysis: null });

  it("goes to the page that asks for a posting when there are no questions", () => {
    expect(render("2-3-start-a-session", storeWith([bare]))).toContain("home-session-no-questions");
  });

  it("starts the practice when the application already has questions for the stage", () => {
    extrasOf.byId.app_h = { questions: [{ id: "q_1", stageId: "s1", type: "behavioral", text: "Tell me about a time." }] };
    const html = render("2-3-start-a-session", storeWith([bare]));
    expect(html).not.toContain("home-session-no-questions");
    expect(html).toContain("3-1-practice-interviewer-asking");
  });

  it("does not count another stage's questions", () => {
    extrasOf.byId.app_h = { questions: [{ id: "q_9", stageId: "s9", type: "behavioral", text: "Elsewhere." }] };
    expect(render("2-3-start-a-session", storeWith([bare]))).toContain("home-session-no-questions");
  });
});

describe("the result of an answer that was said differently", () => {
  it("says it in plain words in the coach note area and in the details", async () => {
    startLive({ mode: "drill", stage: "hiring_manager", count: 2, source: "application", applicationId: "app_h", stageId: "s1" }, ctx);
    await beginRecording();
    await stopAndFinish();
    const html = render("3-4-result-attempt-1-details-open", storeWith([application()]));
    expect(html).toContain("Said differently");
    expect(html).toContain("In the recruiter stage you said &quot;four weeks&quot;. Here you said &quot;two weeks&quot;.");
    expect(html).toContain("Said it the way you said it before");
    expect(html).not.toContain("c1_consistent");
    for (const banned of ["STAR", "rubric", "criterion", "score", "fail"]) expect(html, banned).not.toContain(banned);
  });
});

describe("the Mock debrief's flags", () => {
  const d = { ...mockStore.screens.results.debrief, applicationId: "app_h" };
  const claims = [{ id: "c_a", type: "notice" as const, subject: "Notice period", value: "four weeks' notice", quote: "", stage: "s0", stage_label: "Recruiter", status: "consistent" as const }];
  const html = (props: { saves: boolean }, apps = [application({ claims })]) => renderToStaticMarkup(createElement(StoreProvider, { store: storeWith(apps), children: createElement(Debrief, { d, ...props }) }));

  it("keeps the sample walk-through in the preview", () => {
    expect(html({ saves: false })).toContain("Two weeks is right now");
  });

  it("leaves the button out where the data layer cannot mark a claim", () => {
    extrasOf.app = true;
    expect(html({ saves: true })).not.toContain("Two weeks is right now");
    expect(html({ saves: true })).toContain("Said differently");
  });

  it("shows the button when it can, and the claim is there to change", () => {
    extrasOf.app = true;
    extrasOf.actions = { markClaimUpdated: async () => undefined };
    expect(html({ saves: true })).toContain("Two weeks is right now");
    expect(html({ saves: true }, [application({ claims: [] })])).not.toContain("Two weeks is right now");
  });

  it("says a resume as the earlier version in its own words", () => {
    const r = { ...d, flags: [{ ...d.flags[0], earlierStage: "resume", earlierSaid: "five steps", nowSaid: "one step" }] };
    const out = renderToStaticMarkup(createElement(StoreProvider, { store: storeWith([application()]), children: createElement(Debrief, { d: r }) }));
    expect(out).toContain("Your resume says");
    expect(out).not.toContain("In the resume stage");
  });
});
