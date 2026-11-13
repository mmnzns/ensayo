// Practice defaults and the interviewer voice. The backend keeps no setting for these (they only matter to this
// window), so they live in localStorage under one key. Storage can be missing or blocked, so every access is guarded
// and a bad or old value falls back to its default one field at a time.

import type { StageId } from "../../data/types";

export const PREFS_KEY = "ensayo.prefs";
/** When the last backup was made on this computer (an ISO time). Machine-local, so never in the data folder. */
export const LAST_BACKUP_KEY = "ensayo.lastBackup";

/** Until when (epoch milliseconds) "Not now" hides the Home card about moving the data to Documents. */
export const MOVE_CARD_KEY = "ensayo.moveCardHiddenUntil";
export const MOVE_CARD_HIDDEN_DAYS = 30;

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

/** Which engine reads aloud: the app's browser engine, or the computer's own speech run by the backend. */
export type VoiceEngine = "browser" | "system";

export interface VoicePrefs {
  readAloud: boolean;
  /** A browser voice's `voiceURI`, or a system voice's id when `engine` is "system"; empty means whichever voice the engine picks. */
  voiceUri: string;
  /** The engine `voiceUri` belongs to. Saves from before system voices have none, and mean "browser". */
  engine: VoiceEngine;
  speed: Speed;
  readTrySaying: boolean;
}

export interface SpeechPrefs {
  /** The speech model picked in Settings, Speech; empty means the first one on this computer in Ensayo's order. */
  model: string;
}

export interface MicPrefs {
  /** The microphone chosen in setup or Settings, Speech, by the name `list_input_devices` gave; empty means the system default. */
  device: string;
}

export interface SetupPrefs {
  /** The setup steps (`MissingStep.id`) that were missing when "Finish setting up" was dismissed with "Not now". The card stays hidden while exactly these are missing. Sorted, no repeats. */
  dismissed: string[];
}

export interface Prefs {
  practice: PracticePrefs;
  voice: VoicePrefs;
  speech: SpeechPrefs;
  mic: MicPrefs;
  setup: SetupPrefs;
}

export const DEFAULT_PREFS: Prefs = {
  practice: { stage: "hiring_manager", questions: 5, tries: 3, timer: true, followUps: true, autoStop: false },
  voice: { readAloud: true, voiceUri: "", engine: "browser", speed: "Normal", readTrySaying: true },
  speech: { model: "" },
  mic: { device: "" },
  setup: { dismissed: [] },
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
    // Migration: an old save has no engine, and its voice was always a browser voice.
    engine: r.engine === "system" ? "system" : "browser",
    speed: r.speed === "Slower" || r.speed === "Normal" || r.speed === "Faster" ? r.speed : d.speed,
    readTrySaying: bool(r.readTrySaying, d.readTrySaying),
  };
}

function cleanSpeech(raw: unknown): SpeechPrefs {
  const r = isObject(raw) ? raw : {};
  return { model: typeof r.model === "string" ? r.model : DEFAULT_PREFS.speech.model };
}

function cleanMic(raw: unknown): MicPrefs {
  const r = isObject(raw) ? raw : {};
  return { device: typeof r.device === "string" ? r.device : DEFAULT_PREFS.mic.device };
}

function cleanSetup(raw: unknown): SetupPrefs {
  const r = isObject(raw) ? raw : {};
  const ids = Array.isArray(r.dismissed) ? r.dismissed.filter((i): i is string => typeof i === "string") : [];
  return { dismissed: [...new Set(ids)].sort() };
}

/** The saved settings, or the defaults for anything missing, damaged or unreadable. */
export function readPrefs(storage: Store | null = browserStorage()): Prefs {
  try {
    const text = storage?.getItem(PREFS_KEY);
    const raw: unknown = text ? JSON.parse(text) : null;
    const r = isObject(raw) ? raw : {};
    return { practice: cleanPractice(r.practice), voice: cleanVoice(r.voice), speech: cleanSpeech(r.speech), mic: cleanMic(r.mic), setup: cleanSetup(r.setup) };
  } catch {
    return { practice: { ...DEFAULT_PREFS.practice }, voice: { ...DEFAULT_PREFS.voice }, speech: { ...DEFAULT_PREFS.speech }, mic: { ...DEFAULT_PREFS.mic }, setup: { dismissed: [] } };
  }
}

function writePrefs(prefs: Prefs, storage: Store | null): void {
  try {
    storage?.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage is blocked; the choice still applies on this screen until the app closes.
  }
}

/** Forgets every saved choice (used by Delete all Ensayo data). */
export function clearPrefs(storage: Pick<Storage, "removeItem"> | null = browserStorage() as Pick<Storage, "removeItem"> | null): void {
  try {
    storage?.removeItem(PREFS_KEY);
    storage?.removeItem(LAST_BACKUP_KEY);
    storage?.removeItem(MOVE_CARD_KEY);
  } catch {
    // Storage is blocked; there is nothing to clear.
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

/** Saves the speech model to use and returns everything as it now stands. */
export function updateSpeech(change: Partial<SpeechPrefs>, storage: Store | null = browserStorage()): Prefs {
  const now = readPrefs(storage);
  const next: Prefs = { ...now, speech: cleanSpeech({ ...now.speech, ...change }) };
  writePrefs(next, storage);
  return next;
}

/** Saves the microphone to use ("" is the system default) and returns everything as it now stands. */
export function updateMic(change: Partial<MicPrefs>, storage: Store | null = browserStorage()): Prefs {
  const now = readPrefs(storage);
  const next: Prefs = { ...now, mic: cleanMic({ ...now.mic, ...change }) };
  writePrefs(next, storage);
  return next;
}

/** Saves which missing setup steps were dismissed with "Not now" and returns everything as it now stands. */
export function updateSetup(change: Partial<SetupPrefs>, storage: Store | null = browserStorage()): Prefs {
  const now = readPrefs(storage);
  const next: Prefs = { ...now, setup: cleanSetup({ ...now.setup, ...change }) };
  writePrefs(next, storage);
  return next;
}

/** True when the card was dismissed for exactly this set of missing steps. A different set (one was finished, or a new one is missing) shows it again. */
export function setupDismissed(missingIds: string[], dismissed: string[]): boolean {
  if (missingIds.length === 0) return false;
  const a = [...new Set(missingIds)].sort();
  const b = [...new Set(dismissed)].sort();
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

// ---------- the "move your data" card ----------

/** True while "Not now" is still hiding the card. Storage that can't be read means the card shows. */
export function moveCardHidden(now: number, storage: Pick<Storage, "getItem"> | null = browserStorage()): boolean {
  try {
    const until = Number(storage?.getItem(MOVE_CARD_KEY));
    return Number.isFinite(until) && until > now;
  } catch {
    return false;
  }
}

/** "Not now": hides the card for 30 days. Returns when it will show again. */
export function hideMoveCard(now: number, storage: Pick<Storage, "setItem"> | null = browserStorage()): number {
  const until = now + MOVE_CARD_HIDDEN_DAYS * 24 * 60 * 60 * 1000;
  try {
    storage?.setItem(MOVE_CARD_KEY, String(until));
  } catch {
    // Storage is blocked; the card is hidden until the window reloads.
  }
  return until;
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

// ---------- system voices ----------

/** A voice the backend reports from the computer's own speech (`native_voices`). */
export interface NativeVoiceLike {
  id: string;
  name: string;
  language: string;
}

/** A choice in the Voice list: the engine and voice it stands for, and the words and tag shown. */
export interface VoiceOption {
  /** What the list holds: a browser voiceURI as it is, or `system:` and the system voice's id. */
  value: string;
  label: string;
  engine: VoiceEngine;
  voiceUri: string;
  /** "system" on a system voice. */
  tag?: "system";
}

const SYSTEM_PREFIX = "system:";

/** The list's value for a saved choice. */
export const voiceValue = (engine: VoiceEngine, voiceUri: string): string => (voiceUri && engine === "system" ? SYSTEM_PREFIX + voiceUri : voiceUri);

/** The engine and voice a list value stands for; "" is automatic. */
export function parseVoiceValue(value: string): { engine: VoiceEngine; voiceUri: string } {
  return value.startsWith(SYSTEM_PREFIX) ? { engine: "system", voiceUri: value.slice(SYSTEM_PREFIX.length) } : { engine: "browser", voiceUri: value };
}

/** Browser voices first (English first), then the system's, each tagged "system" and labelled with its language. */
export function voiceOptions(browser: VoiceLike[], system: NativeVoiceLike[]): VoiceOption[] {
  const fromBrowser: VoiceOption[] = voiceChoices(browser).map((c) => ({ ...c, engine: "browser", voiceUri: c.value }));
  const fromSystem: VoiceOption[] = voiceChoices(system.map((v) => ({ voiceURI: v.id, name: v.name, lang: v.language })))
    .map((c) => ({ value: SYSTEM_PREFIX + c.value, label: `${c.label} · system`, engine: "system" as const, voiceUri: c.value, tag: "system" as const }));
  return [...fromBrowser, ...fromSystem];
}
