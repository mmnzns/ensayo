/** One line under each story field saying what goes there, shared by "Write your story" and the story screen. Plain
 * words and an example where it helps, because the parts of a story are not obvious the first time. */
export const FIELD_HELP = {
  title: "A short name only you see, like “Lead enrichment pipeline”.",
  company: "Where it happened.",
  headline: "The one sentence you'd open with: what you did and what changed, result first.",
  context: "The situation in two or three sentences: the problem, and why it mattered.",
  approach: "Your thinking: what you spotted, and the choice you made because of it.",
  action: "The steps you took. Say “I”, not “we”.",
  ownership: "The part that was yours, and who else helped. Interviewers often ask.",
  result: "What was different afterwards. Put the numbers in the Numbers box below too.",
  scale: "How big it was: team size, budget, users or volume.",
  numbers:
    "Each number that proves it worked. On the left, what it measures (“sales-ready leads a month”). On the right, the number: a before and after (31% → 44%) or one figure (about 300 a day).",
  goodFor:
    "The kinds of questions this story answers, like “a time you fixed a broken process”. Ensayo uses these to pick this story when a question fits.",
} as const;
