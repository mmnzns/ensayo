// Screen-specific sample data for the "stories" group. Owned by that group's agent; shared entities live in ../mock/.

/** A filter chip on the story list. `competency` filters on `Story.competencies`; `gaps` shows stories with gap badges. */
export interface StoryFilter {
  id: string;
  label: string;
  competency?: string;
  gaps?: boolean;
}

/** What the sample "Read it" parse returns for the pasted text. Parts the text did not say stay empty; nothing is invented. */
export interface ParsedStory {
  title: string;
  company: string;
  headline: string;
  context: string;
  approach: string;
  action: string;
  ownership: string;
  result: string;
  numbers: { id: string; label: string; value: string }[];
  /** Themes the parse picked, shown selected. */
  goodFor: string[];
  followUps: { question: string; angle: string }[];
}

export interface StoryTelling {
  /** A quiet note about how the user has said the story, such as a number that drifted. */
  note?: string;
  /** Questions this story fits. */
  questions: string[];
}

export interface StoriesData {
  filters: StoryFilter[];
  /** What the Kestrel prompt strip on the list says the company will want. Shown after the company name. */
  gapNeed: string;
  /** The text the paste screen opens with. */
  pasteSample: string;
  parsed: ParsedStory;
  /** Explanations under a part the parse could not fill. */
  missingNotes: { approach: string; approachBlank: string };
  /** Themes the user can add to "Good for questions about". */
  goodForOptions: string[];
  /** Per story id. */
  telling: Record<string, StoryTelling>;
  /** Placeholder for an empty method sentence, per situation. */
  methodPlaceholders: Record<string, string>;
}

export const storiesData: StoriesData = {
  filters: [
    { id: "all", label: "All" },
    { id: "metric", label: "Improving a metric", competency: "improving a metric" },
    { id: "people", label: "Leading people", competency: "leading people" },
    { id: "disagreement", label: "Disagreement", competency: "disagreement" },
    { id: "gaps", label: "Has gaps", gaps: true },
  ],
  gapNeed: "a story about owning a number end to end without an ops team",
  pasteSample:
    "Brightwave 2024. Newsletter open rates dropped from 38% to 21% over a month, team blamed subject lines and kept testing copy. Sender score had fallen to 62. Moved to a dedicated IP, set up warmup, cleaned 40k inactive addresses, fixed DMARC. Sender score back to 94 in six weeks, opens back to 36%.",
  parsed: {
    title: "Deliverability rescue",
    company: "Brightwave",
    headline: "I got newsletter opens from 21 back to 36 percent by fixing our sender reputation, not the subject lines.",
    context: "Newsletter opens dropped from 38 to 21 percent in a month. The team blamed subject lines and kept testing copy.",
    approach: "",
    action: "I moved us to a dedicated IP, set up a warmup, cleaned 40,000 inactive addresses and fixed DMARC.",
    ownership: "",
    result: "Sender score went from 62 to 94 in six weeks, and opens came back to 36 percent.",
    numbers: [
      { id: "n1", label: "Sender score", value: "62 → 94" },
      { id: "n2", label: "Newsletter open rate", value: "21% → 36%" },
      { id: "n3", label: "Inactive addresses removed", value: "40,000" },
    ],
    goodFor: ["Fixing what's broken", "Finding the real problem"],
    followUps: [{ question: "How did you know it wasn't the subject lines?", angle: "Sender score had dropped to 62." }],
  },
  missingNotes: {
    approach: "Your text says what you did, not why. What did you see that the team missed, and why did you pick that fix? Ensayo won't guess this for you.",
    approachBlank: "What did you see that others missed, and why did you pick that fix? Ensayo won't guess this for you.",
  },
  goodForOptions: ["Improving a metric", "Leading people", "Disagreement", "Getting buy-in", "Experimentation", "Hiring"],
  telling: {
    st_onboarding: {
      note: "Last Tuesday you said 45 percent. Your story says 44.",
      questions: ["Tell me about a time you improved a metric.", "Tell me about a problem everyone had misread.", "How do you decide what to fix first?"],
    },
    st_reactivation: {
      questions: ["Tell me about a time you improved a metric.", "How do you know a test result is real?", "Tell me about getting a team to try something new."],
    },
    st_deliverability: {
      questions: ["Tell me about a time something was broken and nobody knew why.", "Tell me about a problem everyone had misread.", "What is the hardest technical problem you have fixed?"],
    },
    st_pricing: {
      questions: ["Tell me about a test you ran.", "Tell me about a time you improved a metric."],
    },
    st_team: {
      questions: ["Tell me about building a team.", "How do you decide who to hire first?", "How do you keep a team on track while it grows?"],
    },
    st_launch: {
      questions: ["Tell me about a time you disagreed with leadership.", "Tell me about a time you pushed back and were right."],
    },
  },
  methodPlaceholders: {
    leading_team: "When I lead a team, the first thing I do is...",
    motivation: "The part I care about most is...",
    problem_solving: "When I hit a problem, the first thing I do is...",
    disagreement: "When I disagree with someone, I start by...",
    influence: "To get buy-in, I start by...",
    serving_customers: "When a customer is stuck, I start by...",
  },
};
