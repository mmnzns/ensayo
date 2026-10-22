// Screen-specific sample data for the "applications" group. Owned by that group's agent; shared entities live in ../mock/.
import type { StageId } from "../types";

export type QuestionType = "behavioral" | "about_you" | "technical" | "factual" | "future" | "gap" | "motivation";

export interface QuestionTypeInfo {
  id: QuestionType;
  /** Plain-word label shown on the chip. */
  label: string;
  /** One line on what this kind of question is for. */
  hint: string;
}

export interface PrepQuestion {
  id: string;
  /** The ProcessStage id this question belongs to. */
  stageId: string;
  type: QuestionType;
  text: string;
  /** Beyond the sample data (the app sends these): the user wrote or changed it, where it came from, why it was asked. */
  editedByUser?: boolean;
  source?: string;
  why?: string;
  bestStoryId?: string | null;
}

export interface NightBefore {
  /** The ProcessStage id the night before is for. */
  stageId: string;
  openerPrompt: string;
  /** The opener in one line, in the person's words. */
  opener: string;
  powerStoryId: string;
  /** "31% → 44%": what to say out loud for the power story. */
  powerNumbers: string;
  questions: string[];
  rehearseMinutes: number;
}

export interface CueSheetData {
  /** Opener beats; **double stars** mark a bold word. */
  openerBeats: string[];
  power: {
    headline: string;
    headlineNote: string;
    noticed: string;
    decided: string;
    did: string;
    didNote: string;
    result: string;
    ifPushed: string;
  };
  said: { label: string; text: string }[];
  reminders: string[];
  /** Beyond the sample data (the app sends these). */
  company?: string;
  /** "Hiring manager · Friday, October 23 · 2:00 PM". */
  stageLine?: string;
  openerPrompt?: string;
  powerStoryTitle?: string;
  questions?: string[];
  numbers?: { label: string; value: string; resumeSays?: string | null; mismatch: boolean }[];
}

export interface ApplicationExtras {
  postingText: string;
  postingPastedOn: string;
  /** What a field was before the person edited it, for the "Edited by you" note. */
  wasValues: Record<string, string>;
  /** Answers practiced per stage, by ProcessStage id. */
  practicedByStage: Record<string, number>;
  nightBefore?: NightBefore;
  /** Every stage that has a lock, by ProcessStage id. */
  lockedByStage?: Record<string, NightBefore>;
  cue?: CueSheetData;
  questions: PrepQuestion[];
}

export interface NewApplicationDraft {
  company: string;
  role: string;
  status: string;
  appliedOn: string;
  source: string;
  contact: string;
  resumeFileName: string;
  resumePages: number;
  postingText: string;
  startup: boolean;
  stages: { stage: StageId; at: string }[];
}

export interface ApplicationsData {
  /** The application every detail screen shows in M1 (one route per tab, no parameters). */
  featuredId: string;
  byApp: Record<string, ApplicationExtras>;
  questionTypes: QuestionTypeInfo[];
  newApplication: NewApplicationDraft;
  /** The "Why?" choices when an application is closed. */
  closedReasons: { id: string; label: string }[];
}

const POSTING =
  "About the role: Kestrel Pay is a 40-person, founder-led payments startup. You'll own lifecycle end to end, from first signup to the tenth payment, with no ops team behind you. You'll build the journeys, run the experiments, and report on activation and early retention to the founders every week...";

const q = (id: string, stageId: string, type: QuestionType, text: string): PrepQuestion => ({ id, stageId, type, text });

export const applicationsData: ApplicationsData = {
  featuredId: "app_kestrel",
  closedReasons: [
    { id: "no_response", label: "No response" },
    { id: "rejected", label: "They said no" },
    { id: "withdrew", label: "I withdrew" },
    { id: "accepted", label: "I accepted" },
  ],
  questionTypes: [
    { id: "behavioral", label: "Behavioral", hint: "Tell me about a time. One story, with the number." },
    { id: "about_you", label: "Tell me about yourself", hint: "Who you are at work, in under a minute." },
    { id: "technical", label: "Technical", hint: "How you work something out when someone keeps asking why." },
    { id: "factual", label: "Factual", hint: "Short facts: notice, pay, dates. Say them the same way every time." },
    { id: "future", label: "Future looking", hint: "What you would do in the job, and how you would decide." },
    { id: "gap", label: "Gap", hint: "Something the posting asks for that your stories don't show yet." },
    { id: "motivation", label: "Motivation", hint: "Why this company, why this work, why now." },
  ],
  newApplication: {
    company: "Kestrel Pay",
    role: "Senior Lifecycle Marketing Manager",
    status: "interviewing",
    appliedOn: "Oct 6",
    source: "Company site",
    contact: "Priya, recruiter",
    resumeFileName: "Dana Ortiz, Resume, Kestrel.pdf",
    resumePages: 2,
    postingText: POSTING,
    startup: true,
    stages: [
      { stage: "recruiter", at: "Oct 14" },
      { stage: "hiring_manager", at: "Oct 23, 2 PM" },
      { stage: "panel", at: "" },
      { stage: "leadership", at: "" },
    ],
  },
  byApp: {
    app_kestrel: {
      postingText: POSTING,
      postingPastedOn: "2026-10-09",
      wasValues: { role: "Sr. Lifecycle Mktg Mgr" },
      practicedByStage: { kestrel_stg_1: 6, kestrel_stg_2: 9, kestrel_stg_4: 6 },
      nightBefore: {
        stageId: "kestrel_stg_2",
        openerPrompt: "Tell me about yourself",
        opener: "lifecycle marketer, finds where activation breaks, then builds the fix. Fernhill now, Brightwave before.",
        powerStoryId: "st_onboarding",
        powerNumbers: "31% → 44%",
        questions: ["Beyond activation and first-month retention, how will you judge this hire?", "What's the biggest thing in the way of that?"],
        rehearseMinutes: 6,
      },
      cue: {
        openerBeats: [
          "Lifecycle marketer: I find where activation breaks, then build the fix.",
          "Now: Fernhill, owning onboarding and retention.",
          "Before: Brightwave, email and deliverability.",
          "Why you: you want one person who builds it **and** runs it.",
        ],
        power: {
          headline: "Activation **31% → 44%** by fixing what happened after signup.",
          headlineNote: "Resume says the same",
          noticed: "People clicked, then stalled on bank linking. Not an email problem.",
          decided: "Fix the handoff. Prove it with 7-day activation.",
          did: "Trigger on the stall. Screen from 3 steps to 1 (with design).",
          didNote: "Resume says 5 to 1",
          result: "**44%** in a quarter · 40k signups a quarter.",
          ifPushed: "Data: funnel by step. Failure: first trigger fired mid-flow, moved to 20 min.",
        },
        said: [
          { label: "Notice", text: "Two weeks" },
          { label: "Why leaving", text: "Want to own lifecycle end to end, not one channel." },
        ],
        reminders: ["Answer first.", "One story.", "Stop when the number lands."],
      },
      questions: [
        q("q1", "kestrel_stg_1", "about_you", "Give me the short version of your background, and what you're looking for next."),
        q("q2", "kestrel_stg_1", "factual", "What's your notice period, and what range are you hoping for?"),
        q("q3", "kestrel_stg_1", "motivation", "What caught your eye about Kestrel Pay?"),
        q("q4", "kestrel_stg_2", "behavioral", "Tell me about a time you found out why new customers weren't activating. What did you do about it?"),
        q("q5", "kestrel_stg_2", "behavioral", "Tell me about a lifecycle program that didn't work the first time. What did you change?"),
        q("q6", "kestrel_stg_2", "technical", "You only have SQL access to the warehouse. How would you set up a cohort view of 7-day activation?"),
        q("q7", "kestrel_stg_2", "gap", "Your background is mostly email. How would you handle push notifications at scale?"),
        q("q8", "kestrel_stg_3", "behavioral", "Tell me about a time you disagreed with product or engineering about a launch. How did it end?"),
        q("q9", "kestrel_stg_3", "future", "If you joined next month, what would you do in your first 60 days?"),
        q("q10", "kestrel_stg_4", "motivation", "Why a 40-person startup instead of a bigger company?"),
        q("q11", "kestrel_stg_4", "future", "There's no ops team behind you. What would you do yourself, and what would you ask us to hire for?"),
        q("q12", "kestrel_stg_4", "motivation", "Are you all in? Would you run this yourself, week after week, until the number moves?"),
      ],
    },
  },
};
