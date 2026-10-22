// Screen-specific sample data for the "practice" group. Owned by that group's agent; shared entities live in ../mock/.

/** 41 seconds as "0:41", 64 as "1:04". */
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Where we are in a session: the mode label, the stage and "2 of 5". */
export interface PracticeSession {
  mode: "Drill" | "Mock";
  /** One short line next to the Drill label, saying what the mode does. */
  modeNote: string;
  stage: string;
  /** 1-based position of the current question. */
  position: number;
  total: number;
}

/** One piece of a transcript line; `circle` marks a word the note is about. */
export interface TranscriptSegment {
  text: string;
  circle?: boolean;
}

export interface TranscriptLine {
  /** Plain text, or pieces when some words are circled. */
  text: string | TranscriptSegment[];
  /** "highlight" is the evidence sentence; "muted" lines are context. */
  tone: "normal" | "muted" | "highlight";
}

/** A row in Details. "yes" is a tick, "notyet" a dot, "info" a quiet middle dot (numbers only). */
export interface DetailRow {
  /** The check this row shows, when it is one the user can label (a rep in the app). */
  id?: string;
  label: string;
  state: "yes" | "notyet" | "info";
  note: string;
}

/** The change since the last attempt, shown top right on attempts 2 and 3. */
export interface DeltaChip {
  label: string;
  /** Seconds before and after, when the change is a number ("41s to 6s"). */
  fromSeconds?: number;
  toSeconds?: number;
  caption?: string;
}

export interface PracticeAttempt {
  number: 1 | 2 | 3;
  coachNote: string;
  /** The one line to say instead. Missing when everything worked. */
  trySaying?: string;
  delta?: DeltaChip;
  /** Green chips when everything worked. */
  wins?: string[];
  /** A closing line under the chips (attempt 3). */
  closing?: string;
  durationSeconds: number;
  transcript: TranscriptLine[];
  /** Caption under the transcript explaining the highlighted sentence. */
  highlightCaption?: string;
  details: { rows: DetailRow[]; footnote: string };
}

export interface FollowUpData {
  /** "Follow-up 1 of 2" */
  number: number;
  of: number;
  question: string;
  /** The question it follows up on, shown at the top. */
  answered: string;
}

export interface ClarifyingMessage {
  from: "interviewer" | "you";
  text: string;
}

export interface PracticeData {
  session: PracticeSession;
  /** The question the whole attempt chain is about. */
  question: string;
  /** Aim for this many seconds (the target window on the timer and the line at the bottom). */
  targetSeconds: { from: number; to: number };
  /** The timer bar runs to this many seconds. */
  timerMaxSeconds: number;
  /** Resting heights (percent) of the level bars, left to right. */
  levelBars: number[];
  /** What the thinking screen shows, per attempt: how long the answer was and the engine doing the picking. */
  thinking: { extraSeconds: number; engine: string; speechWhere: string };
  attempts: PracticeAttempt[];
  followUp: FollowUpData;
  clarifying: { session: PracticeSession; messages: ClarifyingMessage[] };
  mockFollowUp: { session: PracticeSession; followUp: FollowUpData };
}

const QUESTION = "Tell me about a time you improved a metric that really mattered to the business.";

export const practiceData: PracticeData = {
  session: {
    mode: "Drill",
    modeNote: "note after each answer",
    stage: "Hiring manager",
    position: 2,
    total: 5,
  },
  question: QUESTION,
  targetSeconds: { from: 60, to: 90 },
  timerMaxSeconds: 120,
  levelBars: [18, 34, 56, 80, 64, 92, 70, 48, 76, 100, 66, 40, 72, 54, 30, 16],
  thinking: { extraSeconds: 8, engine: "Claude Sonnet", speechWhere: "On this computer" },
  attempts: [
    {
      number: 1,
      coachNote: "Your result came 41 seconds in, after the whole backstory. Say it first, then tell the story.",
      trySaying: "I moved seven-day activation from 31 to 44 percent by firing the email when people stalled on bank linking.",
      durationSeconds: 58,
      transcript: [
        { tone: "muted", text: "So, um, at Fernhill I was on the lifecycle team, and we owned all the onboarding emails." },
        { tone: "muted", text: "And basically activation was kind of flat, like for a long time..." },
        { tone: "muted", text: "So we looked at the data and, you know, people weren't linking their bank." },
        { tone: "highlight", text: "And activation went up to about 44 percent, which was a big deal for us." },
      ],
      highlightCaption: `Highlighted: where your point finally landed, at ${clock(41)}.`,
      details: {
        rows: [
          { label: "Answered the question first", state: "notyet", note: `point at ${clock(41)}` },
          { label: "Said your number", state: "yes", note: "44%" },
          { label: "Picked a story that fits", state: "yes", note: "Onboarding drop-off" },
          { label: "Kept the setup short", state: "yes", note: "3 sentences" },
          { label: "Stopped once the point landed", state: "notyet", note: "16 s after" },
          { label: "Said what you decided", state: "notyet", note: `"we" throughout` },
          { label: "Opened with how you work", state: "notyet", note: "no method line" },
          { label: "No knocks on past teams", state: "yes", note: "" },
          { label: "Filler words", state: "notyet", note: "4 a minute · um, like, you know, basically" },
          { label: "Pace and length", state: "info", note: `148 words a minute · ${clock(58)}` },
        ],
        footnote: "Two sentences trailed off at the end. Finish them with breath to spare.",
      },
    },
    {
      number: 2,
      coachNote: `Every decision was "we". Say what you decided.`,
      trySaying: "I decided the fix was the handoff from email to the bank-linking screen, and I picked seven-day activation to prove it.",
      delta: { label: "fixed", fromSeconds: 41, toSeconds: 6, caption: "point landed" },
      durationSeconds: 48,
      transcript: [
        { tone: "normal", text: "I moved seven-day activation from 31 to 44 percent by fixing what happened after signup." },
        { tone: "muted", text: "Activation had been flat for two quarters and everyone blamed the welcome emails." },
        {
          tone: "normal",
          text: [
            { text: "So " },
            { text: "we", circle: true },
            { text: " looked at the funnel and " },
            { text: "we", circle: true },
            { text: " decided to change the trigger to fire when people stalled." },
          ],
        },
        { tone: "muted", text: "Within a quarter, activation went from 31 to 44 percent." },
      ],
      details: {
        rows: [
          { label: "Answered the question first", state: "yes", note: `point at ${clock(6)}` },
          { label: "Said your number", state: "yes", note: "31 to 44%" },
          { label: "Picked a story that fits", state: "yes", note: "Onboarding drop-off" },
          { label: "Kept the setup short", state: "yes", note: "2 sentences" },
          { label: "Stopped once the point landed", state: "yes", note: "right after the result" },
          { label: "Said what you decided", state: "notyet", note: `"we" twice` },
          { label: "Opened with how you work", state: "notyet", note: "no method line" },
          { label: "No knocks on past teams", state: "yes", note: "" },
          { label: "Filler words", state: "notyet", note: "2 a minute · like, you know" },
          { label: "Pace and length", state: "info", note: `152 words a minute · ${clock(48)}` },
        ],
        footnote: "Much tighter than the first try. One more pass on the decision and this one is done.",
      },
    },
    {
      number: 3,
      coachNote: "You led with the 44 percent, said what you decided, and stopped right after the result.",
      delta: { label: "that's the one" },
      wins: [`Point at ${clock(5)}`, `"I decided" said twice`, `${clock(64)} long`],
      closing: "Real interviewers usually push on an answer this clean. Want to see how you hold up?",
      durationSeconds: 64,
      transcript: [
        { tone: "normal", text: "I moved seven-day activation from 31 to 44 percent by fixing what happened after signup, not the emails." },
        { tone: "muted", text: "Activation had been flat for two quarters and everyone blamed the welcome emails." },
        { tone: "normal", text: "I looked at the funnel and saw people stalled on bank linking, so I decided the handoff was the fix and picked seven-day activation to prove it." },
        { tone: "normal", text: "Within a quarter it went from 31 to 44 percent." },
      ],
      details: {
        rows: [
          { label: "Answered the question first", state: "yes", note: `point at ${clock(5)}` },
          { label: "Said your number", state: "yes", note: "44%" },
          { label: "Picked a story that fits", state: "yes", note: "Onboarding drop-off" },
          { label: "Kept the setup short", state: "yes", note: "2 sentences" },
          { label: "Stopped once the point landed", state: "yes", note: "right after the result" },
          { label: "Said what you decided", state: "yes", note: `"I decided" twice` },
          { label: "Opened with how you work", state: "yes", note: "looked at the funnel first" },
          { label: "No knocks on past teams", state: "yes", note: "" },
          { label: "Filler words", state: "yes", note: "1 a minute" },
          { label: "Pace and length", state: "info", note: `146 words a minute · ${clock(64)}` },
        ],
        footnote: "Nothing trailed off. This is the version to walk in with.",
      },
    },
  ],
  followUp: {
    number: 1,
    of: 2,
    question: "What was your part in that, specifically?",
    answered: QUESTION,
  },
  clarifying: {
    session: { mode: "Drill", modeNote: "note after each answer", stage: "Hiring manager", position: 3, total: 5 },
    messages: [
      { from: "interviewer", text: "How would you approach our churn problem in your first 90 days?" },
      { from: "you", text: "Do you mean the strategy, or how I'd roll it out?" },
      { from: "interviewer", text: "Mostly the rollout. That's where our team keeps getting stuck." },
    ],
  },
  mockFollowUp: {
    session: { mode: "Mock", modeNote: "notes at the end", stage: "Hiring manager", position: 3, total: 6 },
    followUp: {
      number: 1,
      of: 2,
      question: "What was your part in that, specifically?",
      answered: QUESTION,
    },
  },
};
