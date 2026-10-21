// Screen-specific sample data for the "first-run" group. Owned by that group's agent; shared entities live in ../mock/.
import type { Seniority, SellsTo } from "../types";

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

export interface ProviderOption {
  id: string;
  label: string;
  /** Models for this provider, the first one is the recommended one. */
  models: string[];
}

export type EngineKind = "local" | "key" | "timing";

export interface EngineOption {
  kind: EngineKind;
  title: string;
  blurb: string;
  /** Small pill under the blurb ("2.7 GB download", "Recommended"). */
  pill?: string;
  /** Pills in the design are grey except the recommended one, which uses the default pill colour. */
  pillTone?: "ground" | "default";
}

export interface ParsedStory {
  headline: string;
  proof: string;
  employer: string;
  gap: string;
  footnote: string;
}

export interface FirstRunData {
  seniorityOptions: ChoiceOption<Seniority>[];
  sellsToOptions: ChoiceOption<SellsTo>[];
  /** Microphones in the device list. */
  microphones: string[];
  /** Bar heights (percent) the level test settles on, and how many are lit. */
  levelBars: { heights: number[]; lit: number };
  speech: {
    local: { model: string; note: string };
    download: { model: string; sizeMb: number; blurb: string };
  };
  engines: EngineOption[];
  providers: ProviderOption[];
  /** The sample key shown masked in the design. */
  sampleKey: string;
  /** What the story box holds before the user types, and what "Read it" finds in it. */
  firstStory: { raw: string; parsed: ParsedStory };
}

export const firstRunData: FirstRunData = {
  seniorityOptions: [
    { value: "early", label: "Early career" },
    { value: "mid", label: "Mid-level" },
    { value: "senior", label: "Senior" },
    { value: "lead", label: "Lead or manager" },
    { value: "director", label: "Director and up" },
  ],
  sellsToOptions: [
    { value: "b2b", label: "Businesses (B2B)" },
    { value: "b2c", label: "Consumers (B2C)" },
    { value: "both", label: "Both" },
  ],
  microphones: ["AirPods Pro", "MacBook Pro Microphone"],
  levelBars: { heights: [18, 34, 62, 88, 70, 46, 80, 58, 30, 50, 22, 12, 8, 6], lit: 10 },
  speech: {
    local: { model: "Whisper Large Turbo", note: "nothing to download" },
    download: { model: "Whisper Large Turbo", sizeMb: 575, blurb: 'Accurate, and keeps the "um"s Ensayo needs to count.' },
  },
  engines: [
    { kind: "local", title: "Local AI", blurb: "Runs on this computer. Private and offline. Slower, and lighter on follow-up questions.", pill: "2.7 GB download", pillTone: "ground" },
    { kind: "key", title: "Your own key", blurb: "Claude, OpenAI, Gemini and others. The sharpest feedback. You pay the provider directly, usually cents a session.", pill: "Recommended", pillTone: "default" },
    { kind: "timing", title: "Timing only", blurb: "Speed, length and filler words. Add an engine any time in Settings." },
  ],
  providers: [
    { id: "anthropic", label: "Anthropic (Claude)", models: ["Claude Sonnet 5.5 (recommended)", "Claude Haiku 5.5", "Claude Opus 5.5", "Other model…"] },
    { id: "openai", label: "OpenAI", models: ["GPT-5 (recommended)", "GPT-5 mini", "Other model…"] },
    { id: "gemini", label: "Google Gemini", models: ["Gemini 2.5 Pro (recommended)", "Gemini 2.5 Flash", "Other model…"] },
    { id: "openrouter", label: "OpenRouter", models: ["Choose a model on OpenRouter", "Other model…"] },
    { id: "groq", label: "Groq", models: ["Llama 3.3 70B (recommended)", "Other model…"] },
    { id: "mistral", label: "Mistral", models: ["Mistral Large (recommended)", "Mistral Small", "Other model…"] },
    { id: "cerebras", label: "Cerebras", models: ["Llama 3.3 70B (recommended)", "Other model…"] },
    { id: "ollama", label: "Ollama", models: ["Llama 3.1 8B (recommended)", "Other model…"] },
    { id: "lmstudio", label: "LM Studio", models: ["The model loaded in LM Studio", "Other model…"] },
    { id: "other", label: "Other (OpenAI-compatible)", models: ["Other model…"] },
  ],
  sampleKey: "sk-ant-xxxxxxxxxxxxxxxxxxxx",
  firstStory: {
    raw: "Fernhill onboarding, 2025. 7-day activation stuck around 31% for two quarters, team assumed welcome emails were weak. Looked at the funnel: people opened and clicked but stalled on bank linking. Rebuilt the trigger to fire when someone stalled on that step, worked with the designer to cut the screen from 3 steps to 1. Activation went to 44% in a quarter.",
    parsed: {
      headline: "I moved seven-day activation from 31 to 44 percent by fixing what happened after signup.",
      proof: "7-day activation 31% → 44%",
      employer: "Fernhill",
      gap: "No strategy yet: what did you notice, and why that fix? You can add it later.",
      footnote: "Nothing was added that isn't in your text.",
    },
  },
};
