// Screen-specific sample data for the "home" group. Owned by that group's agent; shared entities live in ../mock/.
import type { HabitId, Mode, StageId } from "../types";

export interface HomeLastSession {
  /** "Yesterday". */
  when: string;
  mode: Mode;
  /** The stage name as shown in the row ("Recruiter"); the row adds the word "stage". */
  stageLabel: string;
  /** The small win on the right ("3 fixes stuck"). */
  win: string;
}

export interface StageBlurb {
  stage: StageId;
  /** The stage name in the select and in "What the X stage is like". */
  label: string;
  /** One line to two on what this interviewer is deciding and how the answers run. */
  like: string;
}

export interface HomeData {
  /** The streak before today's session; the store's streak already includes it. */
  streakBefore: number;
  /** The row at the bottom of Home, the state before today's session. */
  lastSession: HomeLastSession | null;
  /** The small totals line, the state before today's session. */
  totalsBefore: { answers: number; questions: number; followUps: number };
  /** What the big Practice card says about the focus habit ("Practice getting to the point"). */
  practiceTitles: Record<HabitId, string>;
  /** The default Drill the Practice button starts. */
  drill: { questions: number; minutes: number };
  /** Start a session: what each stage is like, in the order of the select. */
  stageBlurbs: StageBlurb[];
}

export const homeData: HomeData = {
  streakBefore: 4,
  lastSession: { when: "Yesterday", mode: "drill", stageLabel: "Recruiter", win: "3 fixes stuck" },
  totalsBefore: { answers: 46, questions: 18, followUps: 9 },
  practiceTitles: {
    to_the_point: "Practice getting to the point",
    clean_stop: "Practice stopping once the point lands",
    numbers: "Practice saying your numbers",
    ownership: "Practice saying what you decided",
    why_first: "Practice saying why before what",
    method_first: "Practice opening with how you work",
    conviction: "Practice sounding sure",
    fillers: "Practice cutting filler words",
  },
  drill: { questions: 5, minutes: 12 },
  stageBlurbs: [
    { stage: "recruiter", label: "Recruiter", like: "They're deciding whether you fit the role and the basics line up: availability, range, location, why you're leaving. Answers of 45 to 60 seconds, plain the first time. Light follow-ups." },
    { stage: "hiring_manager", label: "Hiring manager", like: "They're deciding whether you can do this job and how you work. Answers of 60 to 90 seconds. Follow-ups dig into what you owned and your numbers." },
    { stage: "panel", label: "Panel", like: "They're deciding whether people across teams can work with you. Answers of 60 to 90 seconds. Follow-ups go to who you worked with and how you handled disagreement." },
    { stage: "leadership", label: "Leadership", like: "They're deciding on your judgment, your commitment and whether you'd run it yourself. Answers of 30 to 60 seconds, no setup. Follow-ups are short and skeptical." },
    { stage: "technical", label: "Technical", like: "They're deciding how deep you go when someone keeps asking why. Answers of up to 3 minutes. Each follow-up goes one layer deeper." },
  ],
};
