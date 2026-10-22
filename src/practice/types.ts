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

export interface FullRep {
  session_id: string;
  n: number;
  question_id: string;
  question_text: string;
  question_type: string;
  /** 1, 2 or 3: tries at the same question. */
  attempt: number;
  recorded_at: string;
  story_ids: string[];
  fix: string | null;
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
  outcome: "scored" | "didnt_catch";
  session_id: string;
  rep: FullRep | null;
  delta: Delta | null;
  restart_offered: boolean;
  audio_kept: boolean;
}

export interface FinishArgs {
  session_id: string | null;
  mode: "drill" | "mock";
  stage: string;
  application_id: string | null;
  question_id: string;
  question_text: string;
  question_type: string;
  attempt: number;
  story_ids: string[];
  audio_path: string;
}
