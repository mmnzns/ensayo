import { invoke } from "@tauri-apps/api/core";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  allVerified,
  applyBundle,
  deleteStory as deleteStoryIn,
  EMPTY_EXTRAS,
  mergeMethods,
  mockApplication,
  mockDeleteQuestion,
  mockSaveProcess,
  mockSaveQuestion,
  mockSetStageDone,
  NEEDS_THE_APP,
  patchApplication,
  removeApplication,
  saveMethod as saveMethodIn,
  saveStory as saveStoryIn,
  setProofVerified as setProofIn,
  stageRows,
  type AppsState,
  type DataState,
} from "./actions";
import type {
  Analysis,
  AppBundle,
  AppPatch,
  ClaimEdit,
  ClaimInput,
  CueSheet,
  DeleteResult,
  InterviewNoteInput,
  JdOutcome,
  LockInput,
  NewApplicationInput,
  PostingOutcome,
  ProcessOutcome,
  QuestionInput,
  ResumeOutcome,
  StageInput,
} from "./applicationCommands";
import type { ApplicationExtras, InterviewNote, NewApplicationDraft } from "./screens/applications";
import { mockDeleteInterviewNote, mockForgetAsked, mockSaveInterviewNote, mockSetAskedFirst } from "./interviews";
import { TIMING_ONLY, engineStatusOf } from "./engine";
import { mockStore } from "./mock";
import { StoreProvider, useStore, type Store } from "./store";
import type { Application, EngineStatus, Method, Profile, StageId, Story, Target, You } from "./types";
import * as TS from "./targetState";
import { activeOf, NO_TARGETS, type TargetsState } from "./targetState";
import { mergedProfile } from "./targets";
import { AI_CHANGED, type AiView } from "../screens/settings/aiSettings";
import { habitStats, pickFocusHabits, sessionList, streakOf, type RepSummary } from "../practice/habits";

/** True inside the desktop app. In a plain browser (`npm run dev`) the data is the mock, held in memory. */
export const isApp = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** What the setup screens start from: nothing filled in. */
export const BLANK_PROFILE: Profile = { name: "", fullName: "", targetRole: "", seniority: "senior", industry: "", sellsTo: "both", identityStatement: "", focusHabits: [] };

export interface DataStatus {
  folder: string;
  state: "ready" | "missing" | "other_machine" | "stale_lock";
  machine: string | null;
  age_secs: number | null;
}

/** What `load_targets` (and the `targets` part of `load_all`) returns. */
interface TargetsBundle {
  you: You | null;
  targets: Target[];
  targetsNotePending: boolean;
}

interface LoadAll extends Partial<TargetsBundle> {
  profile: Profile | null;
  stories: Story[];
  methods: { situation: string; spoken: string; storyIds: string[] }[];
  applications: Application[];
  application_extras: Record<string, ApplicationExtras>;
  problems: string[];
}

/** What the screens can change. Each one saves first (in the app) and then updates what is on screen. */
export interface Actions {
  saveStory(story: Story): Promise<Story>;
  deleteStory(id: string): Promise<void>;
  setProofVerified(storyId: string, label: string, verified: boolean): Promise<void>;
  saveMethod(method: Method): Promise<void>;
  saveProfile(profile: Profile): Promise<void>;
  // ----- you and your targets (v0.1) -----
  saveYou(you: You): Promise<You>;
  /** An empty `id` makes a new target. */
  saveTarget(target: Target): Promise<Target>;
  duplicateTarget(id: string, name?: string): Promise<Target>;
  /** Practice outside an application is for this one. The screens block this mid-session. */
  setActiveTarget(id: string): Promise<void>;
  /** Fails with a plain line when the target still has applications and `moveApplicationsTo` is not given. */
  archiveTarget(id: string, moveApplicationsTo?: string): Promise<void>;
  restoreTarget(id: string): Promise<void>;
  setStoryPriority(targetId: string, storyId: string, priority: "pin" | "hide" | "none"): Promise<void>;
  /** Dismisses the one-time note about targets. */
  ackTargetsNote(): Promise<void>;
  /** A target prefilled from the posting (not saved), with the closest target's pitch copied in and `pitchCopied` set. */
  targetFromPosting(applicationId: string): Promise<{ target: Target; pitchCopied: boolean }>;
  // ----- applications. Each returns what the command returned; the screens read the new state from the store. -----
  createApplication(input: NewApplicationInput, posting?: string): Promise<AppBundle>;
  updateApplication(applicationId: string, patch: AppPatch): Promise<AppBundle>;
  /** Its practice stays as "practice without an application" unless `deleteReps`. */
  deleteApplication(applicationId: string, deleteReps: boolean): Promise<DeleteResult>;
  /** `needs_confirm` when a removed stage has sessions: ask, then call again with `confirm` true. */
  saveProcess(applicationId: string, stages: StageInput[], confirm?: boolean): Promise<ProcessOutcome>;
  addStage(applicationId: string, stage: StageId, label?: string, at?: string): Promise<AppBundle>;
  removeStage(applicationId: string, stageId: string, confirm?: boolean): Promise<ProcessOutcome>;
  reorderStages(applicationId: string, order: string[]): Promise<AppBundle>;
  renameStage(applicationId: string, stageId: string, label: string): Promise<AppBundle>;
  /** "2026-10-23T14:00", "2026-10-23", or null to clear. */
  setStageTime(applicationId: string, stageId: string, at: string | null): Promise<AppBundle>;
  setStageDone(applicationId: string, stageId: string, done: boolean): Promise<AppBundle>;
  savePosting(applicationId: string, text: string): Promise<PostingOutcome>;
  /** Reads the saved posting (saving `text` first when given): with the engine, or by keywords when none is set up. */
  analyseJd(applicationId: string, text?: string): Promise<JdOutcome>;
  saveAnalysis(applicationId: string, analysis: Analysis): Promise<AppBundle>;
  saveQuestion(applicationId: string, question: QuestionInput): Promise<AppBundle>;
  deleteQuestion(applicationId: string, questionId: string): Promise<AppBundle>;
  editClaim(applicationId: string, claimId: string, edit: ClaimEdit): Promise<AppBundle>;
  removeClaim(applicationId: string, claimId: string): Promise<AppBundle>;
  addClaim(applicationId: string, claim: ClaimInput): Promise<AppBundle>;
  markClaimUpdated(applicationId: string, claimId: string, newValue: string): Promise<AppBundle>;
  markClaimCurrent(applicationId: string, claimId: string): Promise<AppBundle>;
  attachResume(applicationId: string, path: string, confirmReplace: boolean, read: boolean): Promise<ResumeOutcome>;
  /** For a file the window has in memory (the file picker and a drop give no path). */
  attachResumeBytes(applicationId: string, fileName: string, data: Uint8Array, confirmReplace: boolean, read: boolean): Promise<ResumeOutcome>;
  useResumeFrom(applicationId: string, fromApplicationId: string, confirmReplace: boolean, read: boolean): Promise<ResumeOutcome>;
  setNoResume(applicationId: string, confirm: boolean): Promise<ResumeOutcome>;
  pasteResumeText(applicationId: string, text: string, confirmReplace: boolean, read: boolean): Promise<ResumeOutcome>;
  readResume(applicationId: string): Promise<ResumeOutcome>;
  openResume(applicationId: string): Promise<void>;
  recordMustSay(applicationId: string, saidIds: string[]): Promise<AppBundle>;
  dropStorySuggestion(applicationId: string, bullet: string): Promise<AppBundle>;
  saveLocked(applicationId: string, lock: LockInput): Promise<AppBundle>;
  clearLocked(applicationId: string, stageId: string): Promise<AppBundle>;
  /** Null when nothing is locked for the stage. */
  cueSheet(applicationId: string, stageId: string): Promise<CueSheet | null>;
  cueSheetMarkdown(applicationId: string, stageId: string): Promise<string>;
  /** After the interview: saves the note for a stage (replacing it), marks the stage done and adds the questions they were asked to the question set. */
  saveInterviewNote(applicationId: string, note: InterviewNoteInput): Promise<AppBundle>;
  deleteInterviewNote(applicationId: string, stageId: string): Promise<AppBundle>;
  loadInterviewNotes(applicationId: string): Promise<InterviewNote[]>;
  /** The Questions tab switch: questions asked at earlier stages come first in a later stage's Drill. */
  setAskedQuestionsFirst(applicationId: string, on: boolean): Promise<AppBundle>;
}

const unavailable = () => Promise.reject(new Error("The data store is not ready"));
const NO_ACTIONS: Actions = {
  saveStory: unavailable,
  deleteStory: unavailable,
  setProofVerified: unavailable,
  saveMethod: unavailable,
  saveProfile: unavailable,
  saveYou: unavailable,
  saveTarget: unavailable,
  duplicateTarget: unavailable,
  setActiveTarget: unavailable,
  archiveTarget: unavailable,
  restoreTarget: unavailable,
  setStoryPriority: unavailable,
  ackTargetsNote: unavailable,
  targetFromPosting: unavailable,
  createApplication: unavailable,
  updateApplication: unavailable,
  deleteApplication: unavailable,
  saveProcess: unavailable,
  addStage: unavailable,
  removeStage: unavailable,
  reorderStages: unavailable,
  renameStage: unavailable,
  setStageTime: unavailable,
  setStageDone: unavailable,
  savePosting: unavailable,
  analyseJd: unavailable,
  saveAnalysis: unavailable,
  saveQuestion: unavailable,
  deleteQuestion: unavailable,
  editClaim: unavailable,
  removeClaim: unavailable,
  addClaim: unavailable,
  markClaimUpdated: unavailable,
  markClaimCurrent: unavailable,
  attachResume: unavailable,
  attachResumeBytes: unavailable,
  useResumeFrom: unavailable,
  setNoResume: unavailable,
  pasteResumeText: unavailable,
  readResume: unavailable,
  openResume: unavailable,
  recordMustSay: unavailable,
  dropStorySuggestion: unavailable,
  saveLocked: unavailable,
  clearLocked: unavailable,
  cueSheet: unavailable,
  cueSheetMarkdown: unavailable,
  saveInterviewNote: unavailable,
  deleteInterviewNote: unavailable,
  loadInterviewNotes: unavailable,
  setAskedQuestionsFirst: unavailable,
};

const ActionsContext = createContext<Actions>(NO_ACTIONS);
export const useActions = (): Actions => useContext(ActionsContext);

/** An application's extras: the pasted posting, answers practiced per stage, the questions, the locked night-before
 *  sets and what its edited fields used to say. In the app these come from the data folder; in the browser from the
 *  sample data. An unknown id gets empty extras. */
export const useApplicationExtras = (applicationId: string | undefined): ApplicationExtras => {
  const byApp = useStore().screens.applications.byApp;
  return (applicationId && byApp[applicationId]) || EMPTY_EXTRAS;
};

const SetupContext = createContext(false);
/** True in the app until a profile has been saved: the first-run screens come before Home. */
export const useNeedsSetup = (): boolean => useContext(SetupContext);

const TargetsNoteContext = createContext(false);
/** True until the one-time note about targets (shown after the upgrade to v0.1) has been dismissed. */
export const useTargetsNotePending = (): boolean => useContext(TargetsNoteContext);

const DataInfoContext = createContext<{ problems: string[] }>({ problems: [] });

const RepsContext = createContext<RepSummary[]>([]);
/** Every saved answer as a compact summary, oldest first by session. Empty in the browser and before anything is practised. */
export const useRepHistory = (): RepSummary[] => useContext(RepsContext);
/** Plain-words lines for data files that could not be read (a damaged file, one from a newer Ensayo). */
export const useDataProblems = (): string[] => useContext(DataInfoContext).problems;

type Phase = "loading" | "ready" | "blocked" | "error";

const HEARTBEAT_MS = 60_000;

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="e-focus" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div className="e-card" style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 14 }}>
        {children}
      </div>
    </div>
  );
}

function Blocked({ status, onRetry, onOpenAnyway }: { status: DataStatus | null; onRetry: () => void; onOpenAnyway: () => void }) {
  if (status?.state === "other_machine") {
    const minutes = Math.max(1, Math.round((status.age_secs ?? 0) / 60));
    return (
      <Centered>
        <h1 className="e-h2">Another computer has Ensayo open</h1>
        <p className="e-meta" style={{ margin: 0 }}>
          {status.machine} was using this data folder {minutes === 1 ? "a minute" : `${minutes} minutes`} ago. Running both at once is how copies of your stories get out of step. Close Ensayo there first, or open it here anyway.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className="e-btn e-btn-primary" onClick={onRetry}>Try again</button>
          <button type="button" className="e-btn e-btn-line" onClick={onOpenAnyway}>Open anyway</button>
        </div>
      </Centered>
    );
  }
  return (
    <Centered>
      <h1 className="e-h2">Your data folder isn't available</h1>
      <p className="e-meta" style={{ margin: 0 }}>
        Ensayo looked for it at {status?.folder ?? "its usual place"} and didn't find it. If it is on a drive, wait for the drive to finish loading. Ensayo won't start an empty one in its place.
      </p>
      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" className="e-btn e-btn-primary" onClick={onRetry}>Try again</button>
      </div>
    </Centered>
  );
}

/** What the New application screen starts from in the app: nothing filled in. */
const BLANK_DRAFT: NewApplicationDraft = { company: "", role: "", status: "applied", appliedOn: "", source: "", contact: "", resumeFileName: "", resumePages: 0, postingText: "", startup: false, stages: [] };

/** A line in plain words for what the browser preview cannot do. */
const needsApp = <T,>(): Promise<T> => Promise.reject(new Error(NEEDS_THE_APP));

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** The application commands. In the app each one calls the backend and replaces the application and its extras with
 *  what came back. In the browser preview the simple ones (the tracker, the stages, the questions) change the sample
 *  data in memory and the rest say they need the app. */
function applicationActions(app: boolean, appsRef: { current: AppsState }, setApps: (f: (s: AppsState) => AppsState) => void): Pick<
  Actions,
  | "createApplication" | "updateApplication" | "deleteApplication" | "saveProcess" | "addStage" | "removeStage" | "reorderStages" | "renameStage" | "setStageTime" | "setStageDone"
  | "savePosting" | "analyseJd" | "saveAnalysis" | "saveQuestion" | "deleteQuestion" | "editClaim" | "removeClaim" | "addClaim" | "markClaimUpdated" | "markClaimCurrent"
  | "attachResume" | "attachResumeBytes" | "useResumeFrom" | "setNoResume" | "pasteResumeText" | "readResume" | "openResume" | "recordMustSay" | "dropStorySuggestion"
  | "saveLocked" | "clearLocked" | "cueSheet" | "cueSheetMarkdown"
  | "saveInterviewNote" | "deleteInterviewNote" | "loadInterviewNotes" | "setAskedQuestionsFirst"
> {
  const keep = (b: AppBundle): AppBundle => {
    setApps((s) => applyBundle(s, b));
    return b;
  };
  const bundleCmd = async (cmd: string, args: Record<string, unknown>) => keep(await invoke<AppBundle>(cmd, args));
  const processCmd = async (cmd: string, args: Record<string, unknown>) => {
    const out = await invoke<ProcessOutcome>(cmd, args);
    if (out.bundle) keep(out.bundle);
    return out;
  };
  const resumeCmd = async (cmd: string, args: Record<string, unknown>) => {
    const out = await invoke<ResumeOutcome>(cmd, args);
    keep(out.bundle);
    return out;
  };
  const bundleOf = (id: string): AppBundle => {
    const application = appsRef.current.applications.find((a) => a.id === id);
    if (!application) throw new Error("That application isn't here any more.");
    return { application, extras: appsRef.current.extras[id] ?? { postingText: "", postingPastedOn: "", wasValues: {}, practicedByStage: {}, questions: [] } };
  };
  /** Browser preview: change one application in memory. */
  const local = (id: string, change: (b: AppBundle) => AppBundle): Promise<AppBundle> => {
    try {
      return Promise.resolve(keep(change(bundleOf(id))));
    } catch (e) {
      return Promise.reject(e);
    }
  };
  const localProcess = (id: string, rows: (b: AppBundle) => StageInput[], confirm: boolean): Promise<ProcessOutcome> => {
    try {
      const b = bundleOf(id);
      const out = mockSaveProcess(b, rows(b), confirm);
      if (out.bundle) keep(out.bundle);
      return Promise.resolve(out);
    } catch (e) {
      return Promise.reject(e);
    }
  };

  return {
    createApplication: (input, posting) => {
      if (app) return bundleCmd("create_application", { new: input, posting: posting ?? null });
      if (!input.company.trim()) return Promise.reject(new Error("Write the company name first."));
      const b = mockApplication(input, new Date());
      const text = (posting ?? "").trim();
      return Promise.resolve(keep(text ? { ...b, extras: { ...b.extras, postingText: text, postingPastedOn: localToday() } } : b));
    },
    updateApplication: (applicationId, patch) => (app ? bundleCmd("update_application", { applicationId, patch }) : local(applicationId, (b) => patchApplication(b, patch))),
    async deleteApplication(applicationId, deleteReps) {
      if (app) {
        const out = await invoke<DeleteResult>("delete_application", { applicationId, deleteReps });
        setApps((s) => removeApplication(s, applicationId));
        return out;
      }
      setApps((s) => removeApplication(s, applicationId));
      return { kept_sessions: 0, deleted_reps: 0 };
    },
    saveProcess: (applicationId, stages, confirm = false) => (app ? processCmd("save_process", { applicationId, stages, confirm }) : localProcess(applicationId, () => stages, confirm)),
    addStage: (applicationId, stage, label, at) =>
      app
        ? bundleCmd("add_stage", { applicationId, stage, label: label ?? null, at: at ?? null })
        : localProcess(applicationId, (b) => [...stageRows(b.application), { stage, label: label ?? "", at: at ?? null }], false).then((o) => o.bundle ?? bundleOf(applicationId)),
    removeStage: (applicationId, stageId, confirm = false) =>
      app ? processCmd("remove_stage", { applicationId, stageId, confirm }) : localProcess(applicationId, (b) => stageRows(b.application).filter((r) => r.id !== stageId), confirm),
    reorderStages: (applicationId, order) =>
      app
        ? bundleCmd("reorder_stages", { applicationId, order })
        : localProcess(applicationId, (b) => order.map((id) => stageRows(b.application).find((r) => r.id === id)).filter((r): r is StageInput => !!r), false).then((o) => o.bundle ?? bundleOf(applicationId)),
    renameStage: (applicationId, stageId, label) =>
      app
        ? bundleCmd("rename_stage", { applicationId, stageId, label })
        : localProcess(applicationId, (b) => stageRows(b.application).map((r) => (r.id === stageId ? { ...r, label } : r)), false).then((o) => o.bundle ?? bundleOf(applicationId)),
    setStageTime: (applicationId, stageId, at) =>
      app
        ? bundleCmd("set_stage_time", { applicationId, stageId, at })
        : localProcess(applicationId, (b) => stageRows(b.application).map((r) => (r.id === stageId ? { ...r, at } : r)), false).then((o) => o.bundle ?? bundleOf(applicationId)),
    setStageDone: (applicationId, stageId, done) => (app ? bundleCmd("set_stage_done", { applicationId, stageId, done }) : local(applicationId, (b) => mockSetStageDone(b, stageId, done))),
    async savePosting(applicationId, text) {
      if (!app) return needsApp();
      const out = await invoke<PostingOutcome>("save_posting", { applicationId, text });
      keep(out.bundle);
      return out;
    },
    async analyseJd(applicationId, text) {
      if (!app) return needsApp();
      const out = await invoke<JdOutcome>("analyse_jd", { applicationId, text: text ?? null });
      keep(out.bundle);
      return out;
    },
    saveAnalysis: (applicationId, analysis) => (app ? bundleCmd("save_analysis", { applicationId, analysis }) : needsApp()),
    saveQuestion: (applicationId, question) => (app ? bundleCmd("save_question", { applicationId, question }) : local(applicationId, (b) => mockSaveQuestion(b, question))),
    deleteQuestion: (applicationId, questionId) => (app ? bundleCmd("delete_question", { applicationId, questionId }) : local(applicationId, (b) => mockDeleteQuestion(mockForgetAsked(b, questionId), questionId))),
    editClaim: (applicationId, claimId, edit) => (app ? bundleCmd("edit_claim", { applicationId, claimId, edit }) : needsApp()),
    removeClaim: (applicationId, claimId) => (app ? bundleCmd("remove_claim", { applicationId, claimId }) : needsApp()),
    addClaim: (applicationId, claim) => (app ? bundleCmd("add_claim", { applicationId, claim }) : needsApp()),
    markClaimUpdated: (applicationId, claimId, newValue) => (app ? bundleCmd("mark_claim_updated", { applicationId, claimId, newValue }) : needsApp()),
    markClaimCurrent: (applicationId, claimId) => (app ? bundleCmd("mark_claim_current", { applicationId, claimId }) : needsApp()),
    attachResume: (applicationId, path, confirmReplace, read) => (app ? resumeCmd("attach_resume", { applicationId, path, confirmReplace, read }) : needsApp()),
    // Tauri sends arguments as JSON, so the bytes go as an array of numbers.
    attachResumeBytes: (applicationId, fileName, data, confirmReplace, read) => (app ? resumeCmd("attach_resume_bytes", { applicationId, fileName, data: Array.from(data), confirmReplace, read }) : needsApp()),
    useResumeFrom: (applicationId, fromApplicationId, confirmReplace, read) => (app ? resumeCmd("use_resume_from", { applicationId, fromApplicationId, confirmReplace, read }) : needsApp()),
    setNoResume: (applicationId, confirm) => (app ? resumeCmd("set_no_resume", { applicationId, confirm }) : needsApp()),
    pasteResumeText: (applicationId, text, confirmReplace, read) => (app ? resumeCmd("paste_resume_text", { applicationId, text, confirmReplace, read }) : needsApp()),
    readResume: (applicationId) => (app ? resumeCmd("read_resume", { applicationId }) : needsApp()),
    async openResume(applicationId) {
      if (!app) return needsApp();
      await invoke("open_resume", { applicationId });
    },
    recordMustSay: (applicationId, saidIds) => (app ? bundleCmd("record_must_say", { applicationId, saidIds }) : needsApp()),
    dropStorySuggestion: (applicationId, bullet) => (app ? bundleCmd("drop_story_suggestion", { applicationId, bullet }) : needsApp()),
    saveLocked: (applicationId, lock) =>
      app ? bundleCmd("save_locked", { applicationId, stageId: lock.stageId, opener: lock.opener, powerStory: lock.powerStory, questions: lock.questions, openerPrompt: lock.openerPrompt ?? null }) : needsApp(),
    clearLocked: (applicationId, stageId) => (app ? bundleCmd("clear_locked", { applicationId, stageId }) : needsApp()),
    cueSheet: (applicationId, stageId) => (app ? invoke<CueSheet | null>("cue_sheet", { applicationId, stageId }) : needsApp()),
    cueSheetMarkdown: (applicationId, stageId) => (app ? invoke<string>("cue_sheet_markdown", { applicationId, stageId }) : needsApp()),
    saveInterviewNote: (applicationId, note) => (app ? bundleCmd("save_interview_note", { applicationId, note }) : local(applicationId, (b) => mockSaveInterviewNote(b, note, new Date()))),
    deleteInterviewNote: (applicationId, stageId) => (app ? bundleCmd("delete_interview_note", { applicationId, stageId }) : local(applicationId, (b) => mockDeleteInterviewNote(b, stageId))),
    loadInterviewNotes: (applicationId) => (app ? invoke<InterviewNote[]>("load_interview_notes", { applicationId }) : Promise.resolve(appsRef.current.extras[applicationId]?.interviewNotes ?? [])),
    setAskedQuestionsFirst: (applicationId, on) => (app ? bundleCmd("set_asked_questions_first", { applicationId, on }) : local(applicationId, (b) => mockSetAskedFirst(b, on))),
  };
}

/** Owns the user's data. In the app it loads from the data folder through the backend; in the browser it starts from the mock. */
export function DataProvider({ children }: { children: ReactNode }) {
  const app = isApp();
  const [apps, setApps] = useState<AppsState>(() => (app ? { applications: [], extras: {} } : { applications: mockStore.applications, extras: mockStore.screens.applications.byApp }));
  const appsRef = useRef(apps);
  appsRef.current = apps;
  const [state, setState] = useState<DataState>(() =>
    app ? { profile: null, stories: [], methods: mergeMethods([], mockStore.methods) } : { profile: mockStore.profile, stories: mockStore.stories, methods: mockStore.methods },
  );
  const [tg, setTg] = useState<TargetsState>(() => (app ? NO_TARGETS : { you: mockStore.you, targets: mockStore.targets, notePending: false }));
  const tgRef = useRef(tg);
  tgRef.current = tg;
  const [phase, setPhase] = useState<Phase>(app ? "loading" : "ready");
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [error, setError] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [reps, setReps] = useState<RepSummary[]>([]);
  const [engine, setEngine] = useState<EngineStatus>(TIMING_ONLY);

  // The sidebar's engine line: what the saved AI settings mean right now (a key saved, the local model on this computer).
  const readEngine = useCallback(async () => {
    if (!app) return;
    try {
      const [view, ready] = await Promise.all([invoke<AiView>("ai_settings"), invoke<boolean>("ai_ready")]);
      setEngine(engineStatusOf(view.settings, ready, view.providers, typeof navigator === "undefined" || navigator.onLine !== false));
    } catch {
      setEngine(TIMING_ONLY);
    }
  }, [app]);

  // Settings and setup announce every change to the AI settings, a key or the local model; the connection coming and going matters too.
  useEffect(() => {
    if (!app) return;
    const refresh = () => void readEngine();
    for (const name of [AI_CHANGED, "online", "offline"]) window.addEventListener(name, refresh);
    return () => {
      for (const name of [AI_CHANGED, "online", "offline"]) window.removeEventListener(name, refresh);
    };
  }, [app, readEngine]);

  const readReps = useCallback(async () => {
    if (!app) return;
    try {
      setReps(await invoke<RepSummary[]>("rep_summaries"));
    } catch {
      // History is a view over files that may be mid-sync; showing none is better than blocking the app.
    }
  }, [app]);

  // Practice counts on the applications (answers per stage, sessions) follow the saved reps.
  const readApps = useCallback(async () => {
    if (!app) return;
    try {
      const all = await invoke<{ applications: Application[]; application_extras: Record<string, ApplicationExtras> }>("load_applications");
      setApps({ applications: all.applications, extras: all.application_extras });
    } catch {
      // The list stays as it was; the next change brings it up to date.
    }
  }, [app]);

  // live.ts announces every saved rep; Home, Progress and the history list read the new one.
  useEffect(() => {
    if (!app) return;
    const onHistory = () => {
      void readReps();
      void readApps();
    };
    window.addEventListener("ensayo:history", onHistory);
    return () => window.removeEventListener("ensayo:history", onHistory);
  }, [app, readReps, readApps]);

  const readAll = useCallback(async () => {
    const all = await invoke<LoadAll>("load_all");
    setState({ profile: all.profile, stories: all.stories, methods: mergeMethods(all.methods, mockStore.methods) });
    setTg({ you: all.you ?? null, targets: all.targets ?? [], notePending: all.targetsNotePending ?? false });
    setApps({ applications: all.applications ?? [], extras: all.application_extras ?? {} });
    setProblems(all.problems);
    await readReps();
    await readEngine();
    setPhase("ready");
    // Housekeeping: remove answer audio older than the retention setting (reps kept for the eval set stay).
    void invoke("sweep_audio").catch(() => {});
  }, [readReps, readEngine]);

  const load = useCallback(async () => {
    if (!app) return;
    setPhase("loading");
    try {
      const st = await invoke<DataStatus>("data_status");
      setStatus(st);
      if (st.state === "missing" || st.state === "other_machine") {
        setPhase("blocked");
        return;
      }
      await invoke("acquire_data_lock");
      await readAll();
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  }, [app, readAll]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the "this computer has it open" lock fresh while the app is open.
  useEffect(() => {
    if (!app || phase !== "ready") return;
    const t = window.setInterval(() => void invoke("data_heartbeat").catch(() => {}), HEARTBEAT_MS);
    return () => window.clearInterval(t);
  }, [app, phase]);

  const openAnyway = useCallback(async () => {
    try {
      await invoke("acquire_data_lock");
      await readAll();
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  }, [readAll]);

  /** After a command changed targets: take what the backend now holds. */
  const refreshTargets = useCallback(async () => {
    const b = await invoke<TargetsBundle>("load_targets");
    setTg({ you: b.you, targets: b.targets, notePending: b.targetsNotePending });
  }, []);

  const targetActions = useMemo<Pick<Actions, "saveYou" | "saveTarget" | "duplicateTarget" | "setActiveTarget" | "archiveTarget" | "restoreTarget" | "setStoryPriority" | "ackTargetsNote" | "targetFromPosting">>(
    () => ({
      async saveYou(you) {
        if (app) {
          const saved = await invoke<You>("save_you", { you });
          setTg((s) => ({ ...s, you: saved }));
          return saved;
        }
        setTg((s) => ({ ...s, you }));
        return you;
      },
      async saveTarget(target) {
        if (app) {
          const saved = await invoke<Target>("save_target", { target });
          await refreshTargets();
          return saved;
        }
        const out = TS.saveTarget(tgRef.current, target);
        setTg(out.state);
        return out.saved;
      },
      async duplicateTarget(id, name) {
        if (app) {
          const saved = await invoke<Target>("duplicate_target", { id, name: name ?? null });
          await refreshTargets();
          return saved;
        }
        const out = TS.duplicateTarget(tgRef.current, id, name);
        setTg(out.state);
        return out.saved;
      },
      async setActiveTarget(id) {
        if (app) {
          await invoke("set_active_target", { id });
          await refreshTargets();
          return;
        }
        setTg(TS.setActive(tgRef.current, id));
      },
      async archiveTarget(id, moveApplicationsTo) {
        if (app) {
          await invoke("archive_target", { id, moveApplicationsTo: moveApplicationsTo ?? null });
          await refreshTargets();
          await readApps();
          return;
        }
        const inUse = appsRef.current.applications.some((a) => (a.targetId ?? tgRef.current.targets[0]?.id) === id);
        if (inUse && !moveApplicationsTo) throw new Error("This target has applications. Move them to another target first.");
        if (moveApplicationsTo) setApps((s) => ({ ...s, applications: s.applications.map((a) => ((a.targetId ?? tgRef.current.targets[0]?.id) === id ? { ...a, targetId: moveApplicationsTo } : a)) }));
        setTg(TS.setArchived(tgRef.current, id, true));
      },
      async restoreTarget(id) {
        if (app) {
          await invoke("restore_target", { id });
          await refreshTargets();
          return;
        }
        setTg(TS.setArchived(tgRef.current, id, false));
      },
      async setStoryPriority(targetId, storyId, priority) {
        if (app) {
          await invoke("set_story_priority", { targetId, storyId, priority });
          await refreshTargets();
          return;
        }
        setTg(TS.setStoryPriority(tgRef.current, targetId, storyId, priority));
      },
      async ackTargetsNote() {
        if (app) await invoke("ack_targets_note");
        setTg((s) => ({ ...s, notePending: false }));
      },
      async targetFromPosting(applicationId) {
        if (!app) return Promise.reject(new Error(NEEDS_THE_APP));
        return invoke<{ target: Target; pitchCopied: boolean }>("target_from_posting", { applicationId });
      },
    }),
    [app, refreshTargets, readApps],
  );

  const actions = useMemo<Actions>(
    () => ({
      async saveStory(story) {
        const saved = app ? await invoke<Story>("save_story", { story }) : { ...story, verified: allVerified(story) };
        setState((s) => saveStoryIn(s, saved));
        return saved;
      },
      async deleteStory(id) {
        if (app) await invoke("delete_story", { id });
        setState((s) => deleteStoryIn(s, id));
      },
      async setProofVerified(storyId, label, verified) {
        if (app) {
          const saved = await invoke<Story>("set_proof_verified", { storyId, label, verified });
          setState((s) => saveStoryIn(s, saved));
        } else {
          setState((s) => setProofIn(s, storyId, label, verified));
        }
      },
      async saveMethod(method) {
        if (app) await invoke("save_method", { method: { situation: method.situation, spoken: method.spoken, storyIds: method.storyIds } });
        setState((s) => saveMethodIn(s, method));
      },
      async saveProfile(profile) {
        if (app) {
          await invoke("save_profile", { profile });
          await refreshTargets();
        } else {
          setTg((s) => TS.applyProfile(s, profile));
        }
        setState((s) => ({ ...s, profile }));
      },
      ...targetActions,
      ...applicationActions(app, appsRef, setApps),
    }),
    [app, targetActions, refreshTargets],
  );

  const store = useMemo<Store>(() => {
    const active = activeOf(tg);
    const you: You = tg.you ?? { name: "", fullName: "", focusHabits: [], activeTargetId: null };
    const profile = tg.you ? mergedProfile(tg.you, active, state.profile ?? undefined) : (state.profile ?? (app ? BLANK_PROFILE : mockStore.profile));
    const base: Store = {
      ...mockStore,
      profile,
      you,
      targets: tg.targets,
      activeTarget: active,
      stories: state.stories,
      methods: state.methods,
      applications: apps.applications,
      // The sample extras, the sample new-application form and the featured application are for the browser only.
      screens: { ...mockStore.screens, applications: app ? { ...mockStore.screens.applications, featuredId: "", byApp: apps.extras, newApplication: BLANK_DRAFT } : { ...mockStore.screens.applications, byApp: apps.extras } },
    };
    if (!app) return base;
    const now = new Date();
    const companyOf = (id: string) => apps.applications.find((a) => a.id === id)?.company;
    // "Not sure yet" at setup: after five answers on a habit, Ensayo picks the one that is lowest.
    const focus = base.profile.focusHabits.length ? base.profile.focusHabits : pickFocusHabits(mockStore.habits, reps);
    return {
      ...base,
      profile: { ...base.profile, focusHabits: focus },
      engine,
      sessions: sessionList(reps, now, companyOf),
      streak: streakOf(reps, now),
      homeHabitStats: habitStats(mockStore.habits, reps),
    };
  }, [state, apps, tg, reps, app, engine]);
  const info = useMemo(() => ({ problems }), [problems]);

  if (phase === "loading") return <Centered><p className="e-meta" style={{ margin: 0 }}>Opening your data…</p></Centered>;
  if (phase === "blocked") return <Blocked status={status} onRetry={() => void load()} onOpenAnyway={() => void openAnyway()} />;
  if (phase === "error") {
    return (
      <Centered>
        <h1 className="e-h2">Ensayo couldn't open your data</h1>
        <p className="e-meta" style={{ margin: 0 }}>{error}</p>
        <div><button type="button" className="e-btn e-btn-primary" onClick={() => void load()}>Try again</button></div>
      </Centered>
    );
  }
  return (
    <ActionsContext.Provider value={actions}>
      <DataInfoContext.Provider value={info}>
        <RepsContext.Provider value={reps}>
          <TargetsNoteContext.Provider value={app && tg.notePending}>
          <SetupContext.Provider value={app && state.profile === null && tg.you === null}>
            <StoreProvider store={store}>{children}</StoreProvider>
          </SetupContext.Provider>
          </TargetsNoteContext.Provider>
        </RepsContext.Provider>
      </DataInfoContext.Provider>
    </ActionsContext.Provider>
  );
}
