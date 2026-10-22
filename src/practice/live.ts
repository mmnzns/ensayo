// The live rep loop: which question, which attempt, and what the last rep measured. One module-level state with
// subscribers (like practiceFlow, it survives screen changes). In the app it talks to the Rust rep commands; in the
// browser the screens keep using the mock data and this stays inactive.

import { useSyncExternalStore } from "react";
import type { PracticeAttempt, PracticeSession } from "../data/screens/practice";
import type { Method, Story } from "../data/types";
import { isApp, tauriApi, type RepApi } from "./api";
import { attemptFromOutcome } from "./attempt";
import { banksFor, ownQuestion, pickQuestions, type BankQuestion } from "./questions";
import { pickStories } from "./stories";
import type { FinishArgs, FullRep, RepOutcome } from "./types";

export const HARD_CAP_SECONDS = 240;
export const MAX_ATTEMPTS = 3;

export type Phase = "idle" | "asking" | "recording" | "thinking" | "result" | "didnt_catch" | "notice" | "clarify" | "error";

export interface LiveFollowUp {
  question: string;
  kind: string;
  /** 1 or 2: which follow-up of this question, and how many the stage allows. */
  number: number;
  of: number;
  /** The rep this probes. */
  parentN: number;
}

export interface ChatLine {
  from: "interviewer" | "you";
  text: string;
}

export interface LiveState {
  active: boolean;
  mode: "drill" | "mock";
  stage: string;
  applicationId: string | null;
  sessionId: string | null;
  questions: BankQuestion[];
  /** 0-based position of the current question. */
  index: number;
  /** 1 to 3: tries at the current question. */
  attempt: number;
  phase: Phase;
  recordingPath: string | null;
  /** What each attempt at the current question showed, index 0 is attempt 1. */
  attempts: PracticeAttempt[];
  outcomes: RepOutcome[];
  restartOffered: boolean;
  noteWrong: boolean;
  error: string | null;
  /** A plain line on the screen: the AI did not judge this one, or what the interviewer heard. */
  notice: string | null;
  /** A startup's leadership round: the founder variant. */
  founderVariant: boolean;
  /** Which answer is on screen: the one to the question, or the one to a follow-up. */
  view: "attempt" | "followup";
  followUp: LiveFollowUp | null;
  followUpOutcome: RepOutcome | null;
  followUpAttempt: PracticeAttempt | null;
  /** The interviewer's reply to a clarifying question, as a short conversation. */
  clarify: ChatLine[] | null;
  /** A feedback engine is set up, so follow-ups can be offered. */
  aiReady: boolean;
  /** The session the results screen shows once the practice ends. Kept after the session is over. */
  lastSessionId: string | null;
}

const INITIAL: LiveState = {
  active: false,
  mode: "drill",
  stage: "hiring_manager",
  applicationId: null,
  sessionId: null,
  questions: [],
  index: 0,
  attempt: 1,
  phase: "idle",
  recordingPath: null,
  attempts: [],
  outcomes: [],
  restartOffered: false,
  noteWrong: false,
  error: null,
  notice: null,
  founderVariant: false,
  view: "attempt",
  followUp: null,
  followUpOutcome: null,
  followUpAttempt: null,
  clarify: null,
  aiReady: false,
  lastSessionId: null,
};

let state: LiveState = INITIAL;
let stories: Story[] = [];
let methods: Method[] = [];
let api: RepApi | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<LiveState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const getLive = () => state;
export const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const useLive = () => useSyncExternalStore(subscribe, getLive, getLive);

/** True when the practice screens should run the real loop instead of the mock one. */
export const isLive = () => state.active;

export function setRepApi(next: RepApi | null) {
  api = next;
}

async function repApi(): Promise<RepApi> {
  if (!api) api = await tauriApi();
  return api;
}

/** Whether a session started from the Start screen runs the real loop: only inside the app. */
export const liveAvailable = () => isApp() || api !== null;

export function resetLive() {
  state = INITIAL;
  stories = [];
  methods = [];
  listeners.forEach((l) => l());
}

const STAGE_LABELS: Record<string, string> = { recruiter: "Recruiter", hiring_manager: "Hiring manager", leadership: "Leadership", panel: "Panel", technical: "Technical" };

export interface StartOptions {
  mode: "drill" | "mock";
  stage: string;
  count: number;
  source: "application" | "stage" | "story" | "own";
  storyId?: string;
  ownQuestion?: string;
  startup?: boolean;
  applicationId?: string | null;
  seed?: number;
}

export function startLive(o: StartOptions, ctx: { targetRole: string; stories: Story[]; methods: Method[] }) {
  stories = ctx.stories;
  methods = ctx.methods;
  const story = o.source === "story" ? ctx.stories.find((s) => s.id === o.storyId) : undefined;
  const questions =
    o.source === "own" && o.ownQuestion?.trim()
      ? [ownQuestion(o.ownQuestion)]
      : pickQuestions({ bank: banksFor(ctx.targetRole), stage: o.stage, mode: o.mode, count: o.count, startup: o.startup, story, seed: o.seed ?? Date.now() });
  state = { ...INITIAL, active: true, mode: o.mode, stage: o.stage, applicationId: o.applicationId ?? null, founderVariant: o.startup === true, questions, phase: "asking" };
  listeners.forEach((l) => l());
}

export const currentQuestion = (): BankQuestion | undefined => state.questions[state.index];

export function liveSession(): PracticeSession {
  return {
    mode: state.mode === "mock" ? "Mock" : "Drill",
    modeNote: state.mode === "mock" ? "notes at the end" : "note after each answer",
    stage: STAGE_LABELS[state.stage] ?? state.stage,
    position: state.index + 1,
    total: state.questions.length,
  };
}

/** The target window for the current question, for the timer. */
export function liveWindow(): { from: number; to: number } {
  if (state.view === "followup") {
    // A follow-up answer should take under half the time of the first.
    const first = state.outcomes[state.attempt - 1]?.rep?.metrics.speaking_ms ?? 0;
    return { from: 5, to: Math.max(10, Math.round(first / 2000)) };
  }
  const last = state.outcomes[state.outcomes.length - 1]?.rep?.metrics.window;
  if (last) return { from: last.min_s, to: last.max_s };
  const t = currentQuestion()?.type;
  if (t === "factual") return { from: 3, to: 20 };
  if (t === "technical" || state.stage === "technical") return { from: 30, to: 180 };
  if (state.stage === "recruiter") return { from: 45, to: 60 };
  if (state.stage === "leadership") return { from: 30, to: 60 };
  return { from: 60, to: 90 };
}

/** The rep whose result is on screen: the follow-up's while one is showing, else the current attempt's. */
export function currentRep(): FullRep | null {
  if (state.view === "followup") return state.followUpOutcome?.rep ?? null;
  return state.outcomes[state.attempt - 1]?.rep ?? null;
}

/** The question text on screen: the follow-up's while one is asked. */
export const currentQuestionText = (): string => (state.view === "followup" && state.followUp ? state.followUp.question : (currentQuestion()?.text ?? ""));

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function beginRecording() {
  try {
    await (await repApi()).startRecording();
    set({ phase: "recording", error: null });
  } catch (e) {
    set({ phase: "error", error: message(e) });
  }
}

function storyIdsFor(q: BankQuestion, source?: Story): string[] {
  return (source ? [source] : pickStories(q, stories, methods)).map((s) => s.id);
}

/** "Start over" while recording: throw this take away and begin again. */
export async function restartRecording() {
  try {
    const a = await repApi();
    const rec = await a.stopRecording();
    await a.discardRecording(rec.path);
    await a.startRecording();
    set({ phase: "recording", error: null });
  } catch (e) {
    set({ phase: "error", error: message(e) });
  }
}

/** 0 to 1, how loud the mic is right now. 0 when it cannot be read. */
export async function recordingLevel(): Promise<number> {
  try {
    return (await (await repApi()).level())?.level ?? 0;
  } catch {
    return 0;
  }
}

export async function stopAndFinish() {
  const q = currentQuestion();
  if (!q) return;
  set({ phase: "thinking" });
  try {
    const a = await repApi();
    const rec = await a.stopRecording();
    set({ recordingPath: rec.path });
    const args: FinishArgs = {
      session_id: state.sessionId,
      mode: state.mode,
      stage: state.stage,
      application_id: state.applicationId,
      question_id: q.id,
      question_text: currentQuestionText(),
      question_type: q.type,
      behavioral_situation: q.behavioral_situation && q.behavioral_situation !== "other" ? q.behavioral_situation : null,
      commitment_check: q.commitment_check,
      builder_operator_check: q.builder_operator_check,
      is_major_story: !["factual", "gap", "motivation"].includes(q.type),
      founder_variant: state.founderVariant && state.stage === "leadership",
      follow_up: state.view === "followup" && state.followUp ? { parent_n: state.followUp.parentN, kind: state.followUp.kind, number: state.followUp.number } : null,
      attempt: state.view === "followup" ? 1 : state.attempt,
      story_ids: storyIdsFor(q),
      audio_path: rec.path,
    };
    const out = await a.finishRep(args);
    await apply(out);
  } catch (e) {
    set({ phase: "error", error: message(e) });
  }
}

const NOTICES: Record<string, string> = {
  clarifying: "That sounded like a question back to the interviewer, not an answer. Answer it directly this time.",
  not_an_answer: "That didn't sound like an answer to this question. Try again.",
};

async function apply(out: RepOutcome) {
  if (out.outcome === "clarifying") {
    // Asking to clarify is a valid move: the interviewer answers, then the real answer is recorded. It is not scored.
    const question = currentQuestionText();
    try {
      const reply = await (await repApi()).clarifyReply(out.session_id, question, out.transcript_text ?? "", state.stage);
      set({
        phase: "clarify",
        clarify: [
          { from: "interviewer", text: question },
          { from: "you", text: out.transcript_text ?? "" },
          { from: "interviewer", text: reply },
        ],
        sessionId: out.session_id,
        recordingPath: null,
        restartOffered: false,
      });
    } catch {
      set({ phase: "notice", notice: NOTICES.clarifying, sessionId: out.session_id, recordingPath: null, restartOffered: false });
    }
    return;
  }
  if (out.outcome === "not_an_answer") {
    set({ phase: "notice", notice: NOTICES.not_an_answer, sessionId: out.session_id, recordingPath: null, restartOffered: false });
    return;
  }
  if (out.outcome === "didnt_catch" || !out.rep) {
    set({ phase: "didnt_catch", sessionId: out.session_id, recordingPath: null, restartOffered: false });
    return;
  }
  if (state.view === "followup") {
    set({ phase: "result", sessionId: out.session_id, lastSessionId: out.session_id, followUpOutcome: out, followUpAttempt: attemptFromOutcome(out), restartOffered: out.restart_offered, noteWrong: false, recordingPath: null, notice: out.notice, clarify: null });
    announceHistory();
    return;
  }
  const i = state.attempt - 1;
  const attempts = [...state.attempts.slice(0, i), attemptFromOutcome(out)];
  const outcomes = [...state.outcomes.slice(0, i), out];
  set({ phase: "result", sessionId: out.session_id, lastSessionId: out.session_id, attempts, outcomes, restartOffered: out.restart_offered, noteWrong: false, recordingPath: null, notice: out.notice, clarify: null });
  announceHistory();
}

/** Tells the data layer a rep was saved, so Home, Progress and the history list read the new one. */
function announceHistory() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("ensayo:history"));
}

/** The result screen for what was just measured. */
export function resultRoute(): string {
  const a = state.view === "followup" ? state.followUpAttempt : state.attempts[state.attempt - 1];
  if (a?.wins && a.wins.length > 0) return "3-8-result-everything-worked";
  return state.view === "followup" || state.attempt > 1 ? "3-5-result-attempt-2" : "3-4-result-attempt-1-details-open";
}

/** "Again": one more go at the same question, up to three. */
export function tryAgain() {
  set({ attempt: Math.min(MAX_ATTEMPTS, state.attempt + 1), phase: "asking", restartOffered: false, noteWrong: false, error: null, notice: null, clarify: null });
}

/** Moves to the next question, or says the session is over. */
export function nextLiveQuestion(): "asking" | "done" {
  if (state.index + 1 >= state.questions.length) {
    set({ phase: "idle" });
    return "done";
  }
  set({ index: state.index + 1, attempt: 1, attempts: [], outcomes: [], phase: "asking", restartOffered: false, noteWrong: false, error: null, notice: null, clarify: null, view: "attempt", followUp: null, followUpOutcome: null, followUpAttempt: null });
  return "asking";
}

/** After "Start this rep again?": keep the rep and measure from after the restart. */
export async function keepAfterRestart() {
  const rep = currentRep();
  if (!rep) return;
  try {
    const out = await (await repApi()).rescoreRep(rep.session_id, rep.n, true);
    await apply({ ...out, restart_offered: false });
  } catch (e) {
    set({ phase: "error", error: message(e) });
  }
}

/** After "Start this rep again?": throw the rep away and record it again. */
export async function startOverAfterRestart() {
  const rep = currentRep();
  if (!rep) return;
  try {
    await (await repApi()).deleteRep(rep.session_id, rep.n);
    if (state.view === "followup") {
      set({ followUpOutcome: null, followUpAttempt: null, phase: "asking", restartOffered: false, noteWrong: false });
      return;
    }
    const i = state.attempt - 1;
    set({ attempts: state.attempts.slice(0, i), outcomes: state.outcomes.slice(0, i), phase: "asking", restartOffered: false, noteWrong: false });
  } catch (e) {
    set({ phase: "error", error: message(e) });
  }
}

/** "That note was wrong" on the current rep, or taking the tap back. */
export async function markWrong(wrong: boolean) {
  const rep = currentRep();
  if (!rep) return;
  try {
    await (await repApi()).labelRep(rep.session_id, rep.n, wrong);
    set({ noteWrong: wrong });
  } catch (e) {
    set({ error: message(e) });
  }
}

/** Whether a feedback engine is set up, so the follow-up buttons can show. */
export async function checkAi() {
  try {
    set({ aiReady: await (await repApi()).aiReady() });
  } catch {
    set({ aiReady: false });
  }
}

async function askFollowUp(parent: FullRep): Promise<string | null> {
  try {
    const f = await (await repApi()).nextFollowUp(parent.session_id, parent.n);
    set({ view: "followup", followUp: { question: f.question, kind: f.kind, number: f.number, of: f.of, parentN: parent.n }, followUpOutcome: null, followUpAttempt: null, phase: "asking", notice: null, noteWrong: false, restartOffered: false, clarify: null });
    return "3-6-follow-up";
  } catch (e) {
    set({ notice: message(e) });
    return null;
  }
}

/** "They have a follow-up": the interviewer's next question, aimed at the weak spot of the answer on screen. */
export async function requestFollowUp(): Promise<string | null> {
  const parent = state.outcomes[state.attempt - 1]?.rep;
  return parent ? askFollowUp(parent) : null;
}

/** After answering a follow-up: another one, from the same kept answer, while the stage allows. */
export async function anotherFollowUp(): Promise<string | null> {
  const parent = state.outcomes[state.attempt - 1]?.rep;
  return parent ? askFollowUp(parent) : null;
}

/** Back to the result of the answer the follow-ups were about. */
export function endFollowUp() {
  set({ view: "attempt", followUp: null, followUpOutcome: null, followUpAttempt: null, phase: "result", noteWrong: false, restartOffered: false, clarify: null });
}

/** "Label this rep": the user's own pass or fail per criterion, saved into the eval set. */
export async function labelCriteria(labels: Record<string, "pass" | "fail">) {
  const rep = currentRep();
  if (!rep) return;
  await (await repApi()).labelCriteria(rep.session_id, rep.n, labels);
}

/** The labels already saved for the current rep. */
export async function savedLabels(): Promise<Record<string, "pass" | "fail">> {
  const rep = currentRep();
  if (!rep) return {};
  try {
    return await (await repApi()).repLabels(rep.session_id, rep.n);
  } catch {
    return {};
  }
}

/** Ends the session. A recording in progress is stopped and thrown away. */
export async function cancelLive() {
  if (state.phase === "recording") {
    try {
      const a = await repApi();
      const rec = await a.stopRecording();
      await a.discardRecording(rec.path);
    } catch {
      // Nothing was being recorded: fine.
    }
  } else if (state.recordingPath) {
    try {
      await (await repApi()).discardRecording(state.recordingPath);
    } catch {
      // The file is already gone.
    }
  }
  set({ active: false, phase: "idle", recordingPath: null });
}

/** After an error or "didn't catch that": go back to the question for another go. */
export async function retryQuestion() {
  if (state.recordingPath) {
    try {
      await (await repApi()).discardRecording(state.recordingPath);
    } catch {
      // Already gone.
    }
  }
  set({ phase: "asking", recordingPath: null, error: null, notice: null });
}

let player: HTMLAudioElement | null = null;

/** Plays the saved audio for the current rep. Returns false when it is no longer on this computer. */
export async function listenToRep(): Promise<boolean> {
  const rep = currentRep();
  if (!rep) return false;
  try {
    const a = await repApi();
    if (!(await a.audioAvailable(rep.session_id, rep.n))) return false;
    const bytes = await a.readAudio(rep.session_id, rep.n);
    player?.pause();
    player = new Audio(URL.createObjectURL(new Blob([bytes], { type: "audio/wav" })));
    await player.play();
    return true;
  } catch {
    return false;
  }
}

export function stopListening() {
  player?.pause();
  player = null;
}
