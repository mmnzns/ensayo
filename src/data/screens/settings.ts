// Screen-specific sample data for the "settings" group (Progress, Settings, Feedback). Owned by that group's agent; shared entities live in ../mock/.
import type { HabitId, Seniority, SellsTo } from "../types";

// ---------- Progress ----------

/** One habit's numbers after today's session. Labels come from `store.habits`. */
export interface HabitProgress {
  id: HabitId;
  /** First-try results, oldest first; the bar and "N of your last 10" read the last 10. */
  results: boolean[];
  /** How often the fix stuck on a retry: [stuck, retries]. Undefined shows "n/a". */
  retry?: [number, number];
  /** Small text after the label ("3.1 a minute"). */
  note?: string;
}

export interface FocusProgress {
  id: HabitId;
  /** Local date "2026-10-21". Left out when it is not known. */
  since?: string;
  /** The end of the line under the bar; when missing, the retry numbers are used. */
  detail?: string;
}

export interface ProgressData {
  habits: HabitProgress[];
  focus: FocusProgress[];
  /** "Based on your last N answers." */
  basedOnLast: number;
  /** When the way answers are judged last changed ("2026-10-18"). Null when it never has. */
  judgedUpdatedOn: string | null;
}

// ---------- Settings ----------

export interface PracticeDefaults {
  stage: string;
  drillQuestions: 3 | 5 | 10;
  tries: 2 | 3;
  timer: boolean;
  followUps: boolean;
  autoStop: boolean;
}

export interface VoiceData {
  voices: string[];
  voice: string;
  readAloud: boolean;
  speed: "Slower" | "Normal" | "Faster";
  readTrySaying: boolean;
}

export type ModelStatus = "in-use" | "ready" | "found" | "missing";

export interface SpeechModel {
  id: string;
  engine: string;
  /** "Whisper Large Turbo". */
  name: string;
  /** Megabytes. */
  mb: number;
  status: ModelStatus;
}

export interface SpeechEngine {
  name: string;
  /** The line shown under the Model row for this engine. */
  hint: string;
}

export interface SpeechData {
  engines: SpeechEngine[];
  models: SpeechModel[];
  /** The model picked for each engine in the select. */
  modelFor: Record<string, string>;
  /** Online speech services are not in v0 (Build Plan, Engines); the design still draws them. Flip to show them. */
  onlineSpeechInV0: boolean;
  onlineEngines: string[];
  onlineKeys: { id: string; label: string }[];
}

export interface AiProvider {
  name: string;
  /** What the assistant is called in "Sent to X so Y can give feedback". */
  assistant: string;
  models: string[];
  /** First entry is the automatic pick. */
  scoring: string[];
  writing: string[];
  /** The key is a secret the user pastes; false for local engines. */
  needsKey: boolean;
  /** Also asks for the server address (any OpenAI-compatible server). */
  asksForAddress?: boolean;
}

export type AiKind = "local" | "key" | "timing";

export interface AiData {
  kind: AiKind;
  cloud: AiProvider[];
  local: AiProvider[];
  provider: string;
  /** The sample key prefilled for the sample provider; Test shows Works. */
  sampleKey: string;
  spendingCaps: string[];
  cap: string;
  /** Spending over the last 7 days, in cents. */
  usage: { cents: number; sessions: number };
}

export interface PrivacyData {
  /** What the app is set up to use right now; "What leaves this computer" is worked out from it. */
  setup: { speech: string; speechLocal: boolean; ai: AiKind; provider: string; assistant: string };
  retention: string;
  retentionOptions: string[];
  recordingsMb: number;
}

export type CheckState = "ready" | "fix";

export interface SetupCheck {
  id: string;
  label: string;
  detail: string;
  state: CheckState;
  /** The button on a row that needs fixing. */
  fixLabel?: string;
  /** What the button shows when pressed. */
  fixHelp?: string;
}

export interface FeedbackDefaults {
  topic: string;
  message: string;
  pay: "No" | "Maybe" | "Yes" | null;
  fair: string | null;
}

export interface CreditGroup {
  title: string;
  items: { name: string; license: string }[];
}

export interface SettingsData {
  progress: ProgressData;
  practice: PracticeDefaults;
  stages: string[];
  voice: VoiceData;
  speech: SpeechData;
  ai: AiData;
  privacy: PrivacyData;
  checkSetup: SetupCheck[];
  feedback: FeedbackDefaults & { topics: string[]; payChoices: ("No" | "Maybe" | "Yes")[]; fairChoices: string[] };
  /** Libraries, fonts and models, summarised from THIRD_PARTY_NOTICES.md. */
  credits: CreditGroup[];
  seniorityLabels: Record<Seniority, string>;
  sellsToLabels: { id: SellsTo; label: string }[];
}

const anthropic: AiProvider = {
  name: "Anthropic (Claude)",
  assistant: "Claude",
  models: ["Claude Sonnet 5.5 (recommended)", "Claude Haiku 5.5", "Claude Opus 5.5", "Other model…"],
  scoring: ["Automatic · Claude Haiku 5.5", "Claude Sonnet 5.5"],
  writing: ["Automatic · Claude Sonnet 5.5", "Claude Opus 5.5"],
  needsKey: true,
};

export const settingsData: SettingsData = {
  progress: {
    habits: [
      { id: "to_the_point", results: [true, true, false, true, true, true, true, false, true, true], retry: [9, 10] },
      { id: "clean_stop", results: [false, false, true, false, false, true, false, true, false, true], retry: [4, 5] },
      { id: "numbers", results: [true, false, true, true, true, false, true], retry: [3, 3] },
      { id: "ownership", results: [false, true, false, false, true, true, false, true, true, false], retry: [4, 5] },
      { id: "why_first", results: [false, true, false, false, false], retry: [1, 4] },
      { id: "method_first", results: [true, true, false, true, true, true], retry: [1, 1] },
      { id: "conviction", results: [true, true, true, true, true, true] },
      { id: "fillers", results: [false, true, false, true, false], retry: [2, 4], note: "3.1 a minute" },
    ],
    focus: [
      { id: "ownership", since: "2026-10-21" },
      { id: "clean_stop", since: "2026-10-02", detail: "about 14 seconds past the point, down from 31" },
    ],
    basedOnLast: 20,
    judgedUpdatedOn: "2026-10-18",
  },
  practice: { stage: "Hiring manager", drillQuestions: 5, tries: 3, timer: true, followUps: true, autoStop: false },
  stages: ["Recruiter", "Hiring manager", "Panel", "Leadership", "Technical"],
  voice: {
    voices: ["Samantha (natural)", "Daniel (natural)", "Karen", "Alex"],
    voice: "Samantha (natural)",
    readAloud: true,
    speed: "Normal",
    readTrySaying: true,
  },
  speech: {
    engines: [
      { name: "Whisper", hint: "Large Turbo is the most accurate and keeps the \"um\"s. Small is faster on older machines." },
      { name: "Parakeet", hint: "Fast and accurate for English." },
      { name: "Nemotron", hint: "Built for live speech. The largest download." },
    ],
    models: [
      { id: "whisper-large-turbo", engine: "Whisper", name: "Whisper Large Turbo", mb: 575, status: "in-use" },
      { id: "parakeet-v3", engine: "Parakeet", name: "Parakeet v3", mb: 600, status: "found" },
      { id: "whisper-small", engine: "Whisper", name: "Whisper Small", mb: 244, status: "missing" },
      { id: "nemotron", engine: "Nemotron", name: "Nemotron", mb: 2400, status: "missing" },
    ],
    modelFor: { Whisper: "whisper-large-turbo", Parakeet: "parakeet-v3", Nemotron: "nemotron" },
    onlineSpeechInV0: false,
    onlineEngines: ["AssemblyAI", "ElevenLabs Scribe", "Gemini", "Speechmatics", "xAI"],
    onlineKeys: [
      { id: "assemblyai", label: "AssemblyAI" },
      { id: "elevenlabs", label: "ElevenLabs" },
    ],
  },
  ai: {
    kind: "key",
    cloud: [
      anthropic,
      { name: "OpenAI", assistant: "GPT", models: ["GPT-5 (recommended)", "GPT-5 mini", "Other model…"], scoring: ["Automatic · GPT-5 mini", "GPT-5"], writing: ["Automatic · GPT-5", "GPT-5 mini"], needsKey: true },
      { name: "Google Gemini", assistant: "Gemini", models: ["Gemini 2.5 Pro (recommended)", "Gemini 2.5 Flash", "Other model…"], scoring: ["Automatic · Gemini 2.5 Flash", "Gemini 2.5 Pro"], writing: ["Automatic · Gemini 2.5 Pro", "Gemini 2.5 Flash"], needsKey: true },
      { name: "OpenRouter", assistant: "the model you pick", models: ["Other model…"], scoring: ["Automatic · your model"], writing: ["Automatic · your model"], needsKey: true },
      { name: "Groq", assistant: "the model you pick", models: ["Llama 3.3 70B (recommended)", "Other model…"], scoring: ["Automatic · Llama 3.3 70B"], writing: ["Automatic · Llama 3.3 70B"], needsKey: true },
      { name: "Cerebras", assistant: "the model you pick", models: ["Llama 3.3 70B (recommended)", "Other model…"], scoring: ["Automatic · Llama 3.3 70B"], writing: ["Automatic · Llama 3.3 70B"], needsKey: true },
      { name: "Mistral", assistant: "Mistral", models: ["Mistral Large (recommended)", "Mistral Small", "Other model…"], scoring: ["Automatic · Mistral Small", "Mistral Large"], writing: ["Automatic · Mistral Large", "Mistral Small"], needsKey: true },
      { name: "Other (OpenAI-compatible)", assistant: "the model you pick", models: ["Other model…"], scoring: ["Automatic · your model"], writing: ["Automatic · your model"], needsKey: true, asksForAddress: true },
    ],
    local: [
      { name: "Built-in local AI", assistant: "the local model", models: ["Recommended small model", "Other model…"], scoring: ["Automatic · the same local model"], writing: ["Automatic · the same local model"], needsKey: false },
      { name: "Ollama", assistant: "the local model", models: ["Whichever model Ollama has loaded", "Other model…"], scoring: ["Automatic · the same local model"], writing: ["Automatic · the same local model"], needsKey: false },
      { name: "LM Studio", assistant: "the local model", models: ["Whichever model LM Studio has loaded", "Other model…"], scoring: ["Automatic · the same local model"], writing: ["Automatic · the same local model"], needsKey: false },
    ],
    provider: "Anthropic (Claude)",
    sampleKey: "sk-ant-xxxxxxxxxxxxxxxxxxxx",
    spendingCaps: ["None", "25 cents", "1 dollar"],
    cap: "25 cents",
    usage: { cents: 41, sessions: 6 },
  },
  privacy: {
    setup: { speech: "Whisper", speechLocal: true, ai: "key", provider: "Anthropic", assistant: "Claude" },
    retention: "30 days",
    retentionOptions: ["7 days", "30 days", "90 days", "Forever", "Don't keep"],
    recordingsMb: 412,
  },
  checkSetup: [
    { id: "mic", label: "Microphone", detail: "MacBook Pro microphone · level good, no clipping", state: "ready" },
    { id: "speech", label: "Speech to text", detail: "Whisper Large Turbo · 3-second test heard \"testing one two three\"", state: "ready" },
    { id: "voice", label: "Interviewer voice", detail: "Samantha (natural) · played", state: "ready" },
    { id: "ai", label: "Feedback engine", detail: "Claude Sonnet 5.5 · answered in 1.8s", state: "ready" },
    {
      id: "folder",
      label: "Data folder",
      detail: "Last synced copy from another computer is open there. Close Ensayo on the other machine first.",
      state: "fix",
      fixLabel: "How to fix",
      fixHelp: "Another computer has Ensayo open on this folder. Close Ensayo there, wait a few seconds, then press Run again.",
    },
  ],
  feedback: {
    topic: "An idea",
    message: "It would help to practice a single follow-up on its own, without answering the main question first.",
    pay: "Maybe",
    fair: "$10 to $25",
    topics: ["Something broke", "An idea", "A note felt wrong", "Something else"],
    payChoices: ["No", "Maybe", "Yes"],
    fairChoices: ["Free only", "Under $10", "$10 to $25", "$25 to $50", "More"],
  },
  credits: [
    {
      title: "Built with",
      items: [
        { name: "Tauri", license: "MIT / Apache-2.0" },
        { name: "React", license: "MIT" },
        { name: "Vite", license: "MIT" },
        { name: "Tailwind CSS", license: "MIT" },
        { name: "Plus Jakarta Sans, Outfit and Poppins (fonts)", license: "SIL OFL 1.1" },
        { name: "Talaan speech and audio engine (Miguel Monzones)", license: "MIT" },
        { name: "whisper.cpp and ONNX Runtime", license: "MIT" },
        { name: "parakeet-rs, serde, reqwest, rubato and other Rust libraries", license: "MIT / Apache-2.0" },
        { name: "cpal and hound (audio)", license: "Apache-2.0" },
      ],
    },
    {
      title: "Speech models",
      items: [
        { name: "NVIDIA Parakeet TDT 0.6B v2 and v3 (© NVIDIA)", license: "CC-BY-4.0" },
        { name: "Parakeet Ultra (Moondream)", license: "CC-BY-4.0" },
        { name: "NVIDIA Parakeet Unified EN 0.6B", license: "NVIDIA Open Model License" },
        { name: "NVIDIA Nemotron 3.5 ASR Streaming 0.6B (© NVIDIA)", license: "OpenMDW-1.1" },
        { name: "OpenAI Whisper models (ggml conversions)", license: "MIT" },
        { name: "Silero VAD", license: "MIT" },
      ],
    },
  ],
  seniorityLabels: { early: "Early career", mid: "Mid-level", senior: "Senior", lead: "Lead or manager", director: "Director and up" },
  sellsToLabels: [
    { id: "b2b", label: "Businesses (B2B)" },
    { id: "b2c", label: "Consumers (B2C)" },
    { id: "both", label: "Both" },
  ],
};
