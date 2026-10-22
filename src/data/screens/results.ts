// Screen-specific sample data for the "results" group: Mock run, session results (Drill and Mock) and the habit graduation moment.
// Owned by that group's agent; shared entities (habits, applications, streak, engine) live in ../mock/ and are read from the store.
import type { HabitId } from "../types";

/** One question in a Mock run, in order. The last one is always "your questions for them". */
export interface MockQuestion {
  id: string;
  /** Who is asking, shown above the question ("Founder"). */
  asker: string;
  text: string;
}

export interface MockRunData {
  /** Application the Mock is for (id in store.applications). */
  applicationId: string;
  /** "Leadership"; ", startup" is added from the application. */
  stageLabel: string;
  durationMinutes: number;
  questions: MockQuestion[];
  /** The candidate's locked night-before questions for them. */
  lockedQuestions: string[];
  lockedIntro: string;
  lockedTip: string;
}

export interface DrillQuestionResult {
  id: string;
  /** Seconds to the point on the first try and on the best try. */
  firstTry: number;
  bestTry: number;
}

export interface DrillResultsData {
  /** "seconds": the hero is time on a clock. "flags": the focus habit is a yes or no, so the hero is how many answers got it. Default "seconds". */
  kind?: "seconds" | "flags";
  /** Where Listen plays the best answer from; the words are read aloud when the recording is gone. */
  bestFrom?: { sessionId: string; n: number };
  applicationId: string;
  stageLabel: string;
  /** The habit this session worked on; its label comes from store.habits. */
  focusHabitId: HabitId;
  /** Target for the chart, in seconds. */
  targetSeconds: number;
  /** Right edge of the chart, in seconds. */
  chartMaxSeconds: number;
  questions: DrillQuestionResult[];
  fixes: { stuck: number; of: number };
  bestAnswer: {
    question: string;
    attempt: number;
    pointAtSeconds: number;
    /** Finishes the sentence "Attempt 3. Point at 0:05, ...". */
    note: string;
    /** What Listen reads aloud. */
    spoken: string;
  };
  nextTime: { habitId: HabitId; keptGoingSeconds: number; advice: string };
  totals: { answers: number; followUps: number; costCents: number };
}

export interface ConsistencyFlag {
  id: string;
  badge: string;
  earlierStage: string;
  earlierSaid: string;
  nowSaid: string;
  /** The button that keeps the new answer. */
  keepLabel: string;
  /** Shown once the user has kept it. */
  keptNote: string;
}

export interface MustSayItem {
  id: string;
  text: string;
  said: boolean;
}

export interface DebriefRow {
  id: string;
  /** "question" gets an h3 prompt, "followup" a quiet one, "yours" is the closing note. */
  kind: "question" | "followup" | "yours";
  /** Left label ("1", "2a", "Q"). */
  label: string;
  prompt: string;
  note: string;
  /** The line to say instead; only on the row to rehearse. */
  trySaying?: string;
  /** Rows with a line to say get Rehearse instead of Listen. */
  rehearse?: boolean;
  /** What Listen reads aloud. */
  listen: string;
}

export interface MockDebriefData {
  applicationId: string;
  stageLabel: string;
  durationMinutes: number;
  openedWithPoint: { count: number; of: number };
  summary: string;
  followUps: { held: number; of: number };
  averageAnswerSeconds: number;
  numbers: { said: number; of: number };
  flags: ConsistencyFlag[];
  /** False when nothing was checked against earlier answers (no application), so "All matched" would be a lie. Default true. */
  consistencyChecked?: boolean;
  mustSay: MustSayItem[];
  rows: DebriefRow[];
  nextTime: string;
}

export interface GraduationData {
  habitId: HabitId;
  /** Oldest first; true when the answer got it right. */
  results: boolean[];
  /** Finishes "8 of your last 10 answers ...". */
  passLine: string;
  /** Null for a habit that has no clock (the two boxes are then left out). */
  before: { when: string; seconds: number } | null;
  nowSeconds: number | null;
  /** Habit ids offered as the next one to work on. */
  nextChoices: HabitId[];
  suggestedNextId: HabitId;
}

export interface ResultsData {
  mock: MockRunData;
  drill: DrillResultsData;
  debrief: MockDebriefData;
  graduation: GraduationData;
}

export const resultsData: ResultsData = {
  mock: {
    applicationId: "app_kestrel",
    stageLabel: "Leadership",
    durationMinutes: 14,
    questions: [
      { id: "m1", asker: "Founder", text: "Before we get into it: are you looking for a full-time role, or doing your own thing, or both?" },
      { id: "m2", asker: "Founder", text: "Are you more of a builder, or the person who runs it day to day?" },
      { id: "m3", asker: "Founder", text: "Why are you leaving Fernhill?" },
      { id: "m4", asker: "Founder", text: "Tell me about a decision you made with incomplete data." },
      { id: "m5", asker: "Founder", text: "What would you want to have changed by the end of your first quarter?" },
      { id: "m6", asker: "Founder", text: "That's everything from me. What questions do you have for me?" },
    ],
    lockedQuestions: [
      "For a lifecycle role at your stage I'd expect activation and first-month retention to be under the most pressure. Beyond those, how will you judge this hire?",
      "What's the single biggest thing standing in the way of that right now?",
    ],
    lockedIntro: "From your night-before set. Say them in your own words.",
    lockedTip: "Strong questions open with what you already expect, then ask what's specific to them.",
  },
  drill: {
    applicationId: "app_kestrel",
    stageLabel: "Hiring manager",
    focusHabitId: "to_the_point",
    targetSeconds: 10,
    chartMaxSeconds: 60,
    questions: [
      { id: "q1", firstTry: 44, bestTry: 7 },
      { id: "q2", firstTry: 41, bestTry: 6 },
      { id: "q3", firstTry: 36, bestTry: 12 },
      { id: "q4", firstTry: 31, bestTry: 9 },
      { id: "q5", firstTry: 38, bestTry: 11 },
    ],
    fixes: { stuck: 3, of: 4 },
    bestAnswer: {
      question: "Tell me about a time you improved a metric you owned.",
      attempt: 3,
      pointAtSeconds: 5,
      note: "stopped right after the result",
      spoken: "Activation. I took seven-day activation from thirty-one to forty-four percent in one quarter by rebuilding the first-week trigger and testing it every week.",
    },
    nextTime: {
      habitId: "clean_stop",
      keptGoingSeconds: 14,
      advice: "Try ending on the number.",
    },
    totals: { answers: 12, followUps: 2, costCents: 6 },
  },
  debrief: {
    applicationId: "app_kestrel",
    stageLabel: "Leadership",
    durationMinutes: 14,
    openedWithPoint: { count: 5, of: 6 },
    summary: "Your commitment answer was clean. The builder or operator question is the one to rehearse before Friday.",
    followUps: { held: 3, of: 3 },
    averageAnswerSeconds: 52,
    numbers: { said: 4, of: 5 },
    flags: [
      {
        id: "notice",
        badge: "Said differently",
        earlierStage: "recruiter",
        earlierSaid: "four weeks' notice",
        nowSaid: "two weeks",
        keepLabel: "Two weeks is right now",
        keptNote: "Marked as updated. Two weeks is your answer from here on.",
      },
    ],
    mustSay: [
      { id: "ms-1", text: "No ops team behind you", said: true },
      { id: "ms-2", text: "Activation 31% to 44%", said: true },
      { id: "ms-3", text: "Weekly reporting to leadership", said: false },
    ],
    rows: [
      {
        id: "r1",
        kind: "question",
        label: "1",
        prompt: "Are you looking for a full-time role, or doing your own thing, or both?",
        note: "Full-time came first, side work came second and short. Clean.",
        listen: "Full-time, a lifecycle role where I own the whole journey. I do a little side consulting, but it's small and it won't compete with this job.",
      },
      {
        id: "r2",
        kind: "question",
        label: "2",
        prompt: "Are you more of a builder, or the person who runs it day to day?",
        note: 'You described the system for 50 seconds before saying you\'d run it. Start with "Both."',
        trySaying: "\"Both. I build it and I run it: at Fernhill I rebuilt the trigger, then tested it every week until activation moved.\"",
        rehearse: true,
        listen: "Both. I build it and I run it: at Fernhill I rebuilt the trigger, then tested it every week until activation moved.",
      },
      {
        id: "r2a",
        kind: "followup",
        label: "2a",
        prompt: "Wouldn't activation have gone up anyway?",
        note: "You held your ground and named the control group. Good.",
        listen: "Not by this much. We held back ten percent of new customers as a control, and they stayed flat while the rest moved.",
      },
      {
        id: "r3",
        kind: "question",
        label: "3",
        prompt: "Why are you leaving Fernhill?",
        note: "Forward-looking and specific. The notice period changed from last time, see above.",
        listen: "I want to own lifecycle end to end, and Fernhill has a good team but the role is one channel. I'd give two weeks' notice.",
      },
      {
        id: "r4",
        kind: "question",
        label: "4",
        prompt: "Tell me about a decision you made with incomplete data.",
        note: "Strong story. You said 5 percent; your story bank says 4.8. Say the real number.",
        listen: "We had two weeks of data on the win-back test. I made the call to roll it out anyway, and reactivation came in at about five percent.",
      },
      {
        id: "rq",
        kind: "yours",
        label: "Q",
        prompt: "Your questions for them",
        note: "The first one opened with what you expected. The second asked about team size, which they'd already told you.",
        listen: "I'd expect activation and first-month retention to be under the most pressure. How will you judge this hire? And how big is the team?",
      },
    ],
    nextTime: 'open with "Both." when they ask builder or operator.',
  },
  graduation: {
    habitId: "to_the_point",
    results: [true, true, false, true, true, true, false, true, true, true],
    passLine: "opened with the point.",
    before: { when: "Three weeks ago", seconds: 41 },
    nowSeconds: 8,
    nextChoices: ["ownership", "numbers", "fillers"],
    suggestedNextId: "ownership",
  },
};
