// The data model the screens read. Field names follow the Build Plan ("Data model") and the prompt examples
// (prompts/examples/story-bank.json); where they match, they win over anything invented here.

export type StageId = "recruiter" | "hiring_manager" | "technical" | "panel" | "leadership";
export type HabitId = "to_the_point" | "clean_stop" | "numbers" | "ownership" | "why_first" | "method_first" | "conviction" | "fillers";
export type Mode = "drill" | "mock";
export type Seniority = "early" | "mid" | "senior" | "lead" | "director";
export type SellsTo = "b2b" | "b2c" | "both";
export type Situation = "problem_solving" | "disagreement" | "influence" | "serving_customers" | "leading_team" | "motivation";

/** One row of the habit table in the Build Plan (Habit tracking); onboarding, Settings, Home, Progress and results all use it. */
export interface Habit {
  id: HabitId;
  /** Settings and Progress label. */
  label: string;
  /** Onboarding chip text; undefined for habits that are Settings only. */
  chip?: string;
  /** The line under the chip in onboarding. */
  blurb?: string;
  criteria: string[];
  /** The delta chip on a retry. */
  delta: string;
}

export interface Profile {
  name: string;
  fullName: string;
  targetRole: string;
  seniority: Seniority;
  industry: string;
  sellsTo: SellsTo;
  /** Who you are at work, in one sentence; scores "Tell me about yourself". */
  identityStatement: string;
  focusHabits: HabitId[];
}

export type RoleFamily = "lifecycle" | "marketing_ops" | "growth" | "product_marketing" | "other";
export type CompanyStage = "startup" | "growth" | "enterprise" | "any";
export type TargetColor = "coral" | "slate" | "green" | "gold" | "plum";

/** One kind of job the person goes for (v0.1). Everything job-specific lives here; stories, habits and history are shared. */
export interface Target {
  id: string;
  name: string;
  color: TargetColor;
  role: string;
  roleFamily: RoleFamily;
  seniority: Seniority;
  industry: string;
  sellsTo: SellsTo;
  companyStage: CompanyStage;
  /** The one sentence "Tell me about yourself" is checked against. Ensayo never writes it. */
  pitch: string;
  /** Two or three points every interviewer should hear. */
  leadWith: string[];
  pinnedStoryIds: string[];
  hiddenStoryIds: string[];
  defaultProcess: StageId[];
  baseResume: { path: string; fileName: string } | null;
  /** Never sent to an AI. */
  payRange: { low: number; high: number; currency: string } | null;
  archived: boolean;
  createdAt: string;
}

/** What stays with the person across every target. */
export interface You {
  name: string;
  fullName: string;
  focusHabits: HabitId[];
  activeTargetId: string | null;
}

/** A story's way in for one target. It never changes the story's numbers. */
export interface StoryAngle {
  target_id: string;
  headline: string;
  emphasis: string[];
  lead_branch: string | null;
}

export type FitLevel = "strong" | "ok" | "weak";

/** How a posting reads against the person's targets (prompt 09, or keywords when no engine is set up). */
export interface TargetFit {
  sellsTo: SellsTo;
  roleFamily: RoleFamily;
  seniority: Seniority;
  bestTargetId: string | null;
  mismatchNotes: string[];
  perTarget: { targetId: string; fit: FitLevel; why: string }[];
}

export interface ProofPoint {
  label: string;
  metric: string;
  before: string;
  after: string;
  unit: string;
  approximate: boolean;
  verified: boolean;
}

export interface Branch {
  kind: "data" | "failure" | "pushback" | "leadership" | "ambiguity" | "technical" | "avoided_failure";
  trigger: string;
  angle: string;
}

export interface Story {
  id: string;
  title: string;
  employer: string;
  best_for: string[];
  direct_answer: string;
  context: string;
  /** Empty for a CAR story, and the gap to fill when the text only said what was done. */
  approach: string;
  action: string;
  ownership: string;
  result: string;
  proof_points: ProofPoint[];
  scale: string;
  competencies: string[];
  great_eight: string[];
  branches: Branch[];
  /** True when every proof point is verified. */
  verified: boolean;
  /** The headline line on the card ("7-day activation 31% → 44%"). */
  headline: string;
  usage: { practiced: number; fits: number; saidNumber?: number };
  year?: string;
  /** One per target that has its own way in; targets without one use `headline`. */
  angles?: StoryAngle[];
}

export interface Method {
  situation: Situation;
  /** "Solving a problem". */
  label: string;
  /** One spoken sentence; empty until the user writes it. */
  spoken: string;
  storyIds: string[];
  /** The prompt shown while empty. */
  prompt: string;
}

export type ApplicationStatus = "applied" | "screening" | "interviewing" | "offer" | "closed";
export type ClosedReason = "no_response" | "rejected" | "withdrew" | "accepted";

export interface ProcessStage {
  id: string;
  stage: StageId;
  label: string;
  order: number;
  /** Local date-time "2026-10-23T14:00"; undefined until the user adds one. */
  at?: string;
  done: boolean;
  previous_at?: string[];
  /** One line on what this interviewer is deciding. */
  decides: string;
  sessions: number;
  note?: string;
}

export interface Contact {
  name: string;
  role: string;
  email_or_phone: string;
  notes: string;
}

export type ClaimMatch = "matches" | "differs" | "not_in_bank" | "consistent" | "updated" | "said_once";

export interface Claim {
  id: string;
  type: "title" | "number" | "notice" | "reason_leaving" | "pay_range" | "why_company" | "result";
  subject: string;
  value: string;
  quote: string;
  /** Stage id, or "resume". */
  stage: string;
  stage_label: string;
  status: ClaimMatch;
  note?: string;
  /** Beyond the sample data (the app sends these): the user fixed it, a newer answer replaced it, where it came from. */
  edited?: boolean;
  superseded?: boolean;
  source?: string;
}

export interface ResumeInfo {
  fileName: string;
  title: string;
  pages: number;
  sentOn: string;
  readOn: string;
  claims: Claim[];
  mustSay: { id: string; text: string; resume: string; said: string }[];
  suggestions: { text: string; gap: string; bullet?: string; employer?: string; title?: string; headline_result?: string }[];
  /** Beyond the sample data (the app sends these). `attached` waits for the yes to read it, `no_text` needs pasted text. */
  status?: "attached" | "no_text" | "read";
  needs_paste?: boolean;
  kind?: string;
  text_source?: string;
  engine?: string | null;
  /** `ready`, `waiting_for_posting`, `none`, or empty before a read. */
  must_say_state?: string;
}

export interface Application {
  id: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  closed_reason: ClosedReason | null;
  applied_on: string;
  source: string;
  contacts: Contact[];
  notes: string;
  startup: boolean;
  process: ProcessStage[];
  current_stage_id: string | null;
  edited_by_user: string[];
  /** null when "I didn't send one". */
  resume: ResumeInfo | null;
  /** Read from the posting; null until a posting is pasted. */
  analysis: {
    summary: string;
    priorities: { title: string; detail: string }[];
    beliefs: { text: string; storyId: string | null; story: string; covered: boolean; why?: string }[];
    gaps: string[];
    echo: string[];
  } | null;
  claims: Claim[];
  /** "Waiting to hear · 6 days since you applied"-style note for the list. */
  waiting?: string;
  answersPracticed: number;
  /** Beyond the sample data (the app sends these). A status the tracker might move to; only a suggestion. */
  suggested_status?: ApplicationStatus | null;
  /** The day before the earliest upcoming interview. */
  night_before?: { date: string; stage_id: string } | null;
  /** "I didn't send one". */
  no_resume?: boolean;
  /** The target this application is filed under. Missing means the first target. */
  targetId?: string;
  /** How the posting reads against the targets; null until a posting is read. */
  targetFit?: TargetFit | null;
  /** The target the person chose to keep on the fit banner; the banner stays quiet while it is still the filed target. */
  fitDismissedFor?: string | null;
}

export interface SessionSummary {
  id: string;
  when: string;
  group: "This week" | "Last week";
  mode: Mode;
  title: string;
  headline: string;
  applicationId?: string;
  targetId?: string;
}

export interface EngineStatus {
  label: string;
  kind: "local" | "key" | "timing";
  offline: boolean;
}

export interface HabitStat {
  id: HabitId;
  firstTry: [number, number];
  retry?: [number, number];
  note: string;
  graduated?: boolean;
  since?: string;
}

export interface Streak {
  daysInARow: number;
  answers: number;
  questions: number;
  followUps: number;
}
