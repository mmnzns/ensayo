// Where the user is in the demo chain: which attempt at the current question, and whether the next
// result is the follow-up's. Module-level on purpose: nothing persists in M1 and it survives screen changes.

export const MAX_ATTEMPTS = 3;

export const ASK = "3-1-practice-interviewer-asking";
export const RECORD = "3-2-practice-recording";
export const THINK = "3-3-practice-thinking";
export const FOLLOW_UP = "3-6-follow-up";
export const END_SESSION = "4-3-session-results-drill";

/** Result screen for each attempt (index 0 is attempt 1). */
export const RESULT_IDS = [
  "3-4-result-attempt-1-details-open",
  "3-5-result-attempt-2",
  "3-8-result-everything-worked",
] as const;

let attempt = 1;
let followUp = false;

export const getAttempt = () => attempt;

export function setAttempt(n: number) {
  attempt = Math.min(MAX_ATTEMPTS, Math.max(1, Math.round(n)));
}

/** Another go at the same question (stops at the last attempt). */
export function nextAttempt() {
  setAttempt(attempt + 1);
}

/** A new question starts at attempt 1 with no follow-up pending. */
export function resetFlow() {
  attempt = 1;
  followUp = false;
}

export const isFollowUp = () => followUp;
export const setFollowUp = (on: boolean) => {
  followUp = on;
};

/** The result screen to show once the thinking screen finishes. A follow-up always lands on the last one for the demo. */
export function resultAfterThinking(): string {
  return followUp ? RESULT_IDS[MAX_ATTEMPTS - 1] : RESULT_IDS[attempt - 1];
}

export const CLARIFYING = "3-7-clarifying-question";
export const FIRST_RUN_LOOP = "first-run-loop";

let firstRep = false;
let clarifyingShown = false;

/** Set by the last first-run step: the next "Next question" ends onboarding on the "That's the loop" card. */
export function startFirstRep() {
  firstRep = true;
}

/** Where "Next question" goes: the loop card after the first-run rep, then once to the clarifying-question demo, then a new question. */
export function nextQuestion(): string {
  if (firstRep) {
    firstRep = false;
    return FIRST_RUN_LOOP;
  }
  if (!clarifyingShown) {
    clarifyingShown = true;
    return CLARIFYING;
  }
  return ASK;
}
