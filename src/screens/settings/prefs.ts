// Practice defaults and the interviewer voice. The backend keeps no setting for these (they only matter to this
// window), so they live in localStorage under one key. Storage can be missing or blocked, so every access is guarded
// and a bad or old value falls back to its default one field at a time.

import type { StageId } from "../../data/types";

export const PREFS_KEY = "ensayo.prefs";

export type Speed = "Slower" | "Normal" | "Faster";

export interface PracticePrefs {
  stage: StageId;
  /** Questions in a Drill. */
  questions: 3 | 5 | 10;
  tries: 2 | 3;
  timer: boolean;
  followUps: boolean;
  /** Stop recording after a long silence. */
  autoStop: boolean;
}

export interface VoicePrefs {
  readAloud: boolean;
  /** A browser voice's `voiceURI`; empty means whichever voice the computer picks. */
  voiceUri: string;
  speed: Speed;
  readTrySaying: boolean;
}

export interface Prefs {
  practice: PracticePrefs;
  voice: VoicePrefs;
}

export const DEFAULT_PREFS: Prefs = {
  practice: { stage: "hiring_manager", questions: 5, tries: 3, timer: true, followUps: true, autoStop: false },
  voice: { readAloud: true, voiceUri: "", speed: "Normal", readTrySaying: true },
};

type Store = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

// ---------- stages ----------

const STAGES: [StageId, string][] = [
  ["recruiter", "Recruiter"],
  ["hiring_manager", "Hiring manager"],
  ["panel", "Panel"],
  ["leadership", "Leadership"],
  ["technical", "Technical"],
];

/** The words in the Settings list for a stage id. */
export const stageLabelOf = (id: StageId): string => STAGES.find(([i]) => i === id)?.[1] ?? "Hiring manager";
/** The stage id for a label in the list; an unknown label gives the default stage. */
export const stageIdOf = (label: string): StageId => STAGES.find(([, l]) => l === label)?.[0] ?? DEFAULT_PREFS.practice.stage;
const isStage = (v: unknown): v is StageId => STAGES.some(([i]) => i === v);

// ---------- reading and saving ----------

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function cleanPractice(raw: unknown): PracticePrefs {
  const d = DEFAULT_PREFS.practice;
  const r = isObject(raw) ? raw : {};
  return {
    stage: isStage(r.stage) ? r.stage : d.stage,
    questions: r.questions === 3 || r.questions === 5 || r.questions === 10 ? r.questions : d.questions,
    tries: r.tries === 2 || r.tries === 3 ? r.tries : d.tries,
    timer: bool(r.timer, d.timer),
    followUps: bool(r.followUps, d.followUps),
    autoStop: bool(r.autoStop, d.autoStop),
  };
}

function cleanVoice(raw: unknown): VoicePrefs {
  const d = DEFAULT_PREFS.voice;
  const r = isObject(raw) ? raw : {};
  return {
    readAloud: bool(r.readAloud, d.readAloud),
    voiceUri: typeof r.voiceUri === "string" ? r.voiceUri : d.voiceUri,
    speed: r.speed === "Slower" || r.speed === "Normal" || r.speed === "Faster" ? r.speed : d.speed,
    readTrySaying: bool(r.readTrySaying, d.readTrySaying),
  };
}

/** The saved settings, or the defaults for anything missing, damaged or unreadable. */
export function readPrefs(storage: Store | null = browserStorage()): Prefs {
  try {
    const text = storage?.getItem(PREFS_KEY);
    const raw: unknown = text ? JSON.parse(text) : null;
    const r = isObject(raw) ? raw : {};
    return { practice: cleanPractice(r.practice), voice: cleanVoice(r.voice) };
  } catch {
    return { practice: { ...DEFAULT_PREFS.practice }, voice: { ...DEFAULT_PREFS.voice } };
  }
}

function writePrefs(prefs: Prefs, storage: Store | null): void {
  try {
    storage?.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage is blocked; the choice still applies on this screen until the app closes.
  }
}

/** Saves a change to the practice defaults and returns everything as it now stands. */
export function updatePractice(change: Partial<PracticePrefs>, storage: Store | null = browserStorage()): Prefs {
  const now = readPrefs(storage);
  const next: Prefs = { ...now, practice: cleanPractice({ ...now.practice, ...change }) };
  writePrefs(next, storage);
  return next;
}

/** Saves a change to the voice settings and returns everything as it now stands. */
export function updateVoice(change: Partial<VoicePrefs>, storage: Store | null = browserStorage()): Prefs {
  const now = readPrefs(storage);
  const next: Prefs = { ...now, voice: cleanVoice({ ...now.voice, ...change }) };
  writePrefs(next, storage);
  return next;
}

// ---------- the voice itself ----------

/** The parts of a browser `SpeechSynthesisVoice` that matter here. */
export interface VoiceLike {
  voiceURI: string;
  name: string;
  lang: string;
  localService?: boolean;
}

const isEnglish = (v: VoiceLike) => /^en\b/i.test(v.lang.replace("_", "-"));

function languageName(lang: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(lang.replace("_", "-")) ?? lang;
  } catch {
    return lang;
  }
}

/** The voices to pick from: English first, then the rest, each by name, labelled with its language. */
export function voiceChoices(voices: VoiceLike[]): { value: string; label: string }[] {
  const byName = (a: VoiceLike, b: VoiceLike) => a.name.localeCompare(b.name);
  const english = voices.filter(isEnglish).sort(byName);
  const other = voices.filter((v) => !isEnglish(v)).sort(byName);
  return [...english, ...other].map((v) => ({ value: v.voiceURI, label: `${v.name} · ${languageName(v.lang)}` }));
}

/** The saved voice, or undefined for "automatic" and for a voice this computer no longer has. */
export function chooseVoice<T extends VoiceLike>(voices: T[], voiceUri: string): T | undefined {
  return voiceUri ? voices.find((v) => v.voiceURI === voiceUri) : undefined;
}

export function speechRate(speed: Speed): number {
  return speed === "Slower" ? 0.85 : speed === "Faster" ? 1.2 : 1;
}
