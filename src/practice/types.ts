// The shapes the Rust rep commands return (src-tauri/src/metrics, storage/reps.rs, rep_commands.rs). Field names are
// the JSON names, so nothing translates between the files and the screens.

export interface Word {
  text: string;
  start_ms: number;
  end_ms: number;
}

export interface Sentence {
  /** 1-based. */
  index: number;
  text: string;
  start_ms: number;
  end_ms: number;
  first_word: number;
  word_count: number;
}

export interface SaidNumber {
  value: number;
  percent: boolean;
  raw: string;
  token: number;
}

export interface Check {
  id: string;
  /** null when the check does not apply to this answer. */
  passed: boolean | null;
  evidence: string;
  /** 1-based sentences the check points at. */
  sentences: number[];
  /** The measurement in seconds when the check is a time. */
  seconds: number | null;
}

export interface Filler {
  text: string;
  start_ms: number;
  word: number;
}

export interface Metrics {
  rubric_version: number;
  outcome: "scored" | "didnt_catch";
  words: Word[];
  sentences: Sentence[];
  word_count: number;
  speaking_ms: number;
  wpm: number;
  window: { min_s: number; max_s: number };
  length: "short" | "fits" | "long";
  fillers: { count: number; per_minute: number; items: Filler[] };
  pauses: { at_ms: number; length_ms: number; after_word: number }[];
  proof: { matched: SaidNumber[]; landed_sentence: number | null; tail_ms: number | null };
  unbanked: SaidNumber[];
  restart_at: number | null;
  checks: Check[];
}

export interface Rewrite {
  text: string;
  position: "open" | "replace";
  replaces_sentence: number | null;
}

export interface FollowUpMeta {
  parent_n: number;
  kind: string;
  question: string;
  number: number;
}

export interface FollowUpQuestion {
  kind: string;
  question: string;
  targets: string;
  number: number;
  of: number;
}

export interface FullRep {
  session_id: string;
  n: number;
  question_id: string;
  question_text: string;
  question_type: string;
  behavioral_situation: string | null;
  commitment_check: boolean;
  builder_operator_check: boolean;
  is_major_story: boolean;
  founder_variant: boolean;
  /** 1, 2 or 3: tries at the same question. */
  attempt: number;
  recorded_at: string;
  story_ids: string[];
  follow_up: FollowUpMeta | null;
  fix: string | null;
  /** The coach's note and the line to say instead. Null for a rep judged by timing only. */
  note: string | null;
  rewrite: Rewrite | null;
  ai: { prompts: string[]; rubric_version: number; cost_usd: number } | null;
  feedback: { note_was_wrong: boolean; at: string } | null;
  transcript: Word[];
  metrics: Metrics;
}

export interface Delta {
  check: string;
  label: string;
  from_seconds: number | null;
  to_seconds: number | null;
  from_count: number | null;
  to_count: number | null;
  improved: boolean;
}

export interface RepOutcome {
  outcome: "scored" | "didnt_catch" | "clarifying" | "not_an_answer";
  session_id: string;
  rep: FullRep | null;
  delta: Delta | null;
  restart_offered: boolean;
  audio_kept: boolean;
  /** Why the AI did not judge this one (no key, over the cap, an unreadable reply). */
  notice: string | null;
  /** What was said, for a clarifying question. */
  transcript_text: string | null;
}

export interface FinishArgs {
  session_id: string | null;
  mode: "drill" | "mock";
  stage: string;
  application_id: string | null;
  question_id: string;
  question_text: string;
  /** "" for a question nobody tagged: the engine classifies it. */
  question_type: string;
  behavioral_situation: string | null;
  commitment_check: boolean;
  builder_operator_check: boolean;
  is_major_story: boolean;
  founder_variant: boolean;
  /** Set when this recording answers a follow-up question. */
  follow_up: { parent_n: number; kind: string; number: number } | null;
  attempt: number;
  story_ids: string[];
  audio_path: string;
}
