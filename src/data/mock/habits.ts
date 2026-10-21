import type { Habit } from "../types";

/** The habit table from the Build Plan (Habit tracking). Onboarding chips and blurbs come from screen 1-3. */
export const habits: Habit[] = [
  { id: "to_the_point", label: "Getting to the point", chip: "I take too long to get to the point", blurb: "The answer comes after the backstory.", criteria: ["answer_first", "time_to_point"], delta: "Point landed at 41s → 6s" },
  { id: "clean_stop", label: "Stopping once the point lands", chip: "I keep going after I've made my point", blurb: "A strong answer, then two more minutes.", criteria: ["clean_stop"], delta: "Stopped 14s sooner" },
  { id: "numbers", label: "Saying my numbers", chip: "I forget to say my numbers", blurb: "The result is there, the proof isn't.", criteria: ["proof"], delta: "You said the number this time" },
  { id: "ownership", label: "Saying what I decided", chip: 'I say "we" when I mean "I"', blurb: "Nobody can tell what you decided.", criteria: ["ownership"], delta: '"I decided" said twice' },
  { id: "why_first", label: "Why before what", chip: "I talk about what I built before why", blurb: "The thinking stays hidden behind the work.", criteria: ["approach_before_action"], delta: "You said why first" },
  { id: "method_first", label: "Opening with how I work", criteria: ["method_first"], delta: "Opened with your method" },
  { id: "conviction", label: "No hedging", chip: "I hedge or apologise", blurb: '"Sorry, this might not be the best example..."', criteria: ["conviction"], delta: "No apology this time" },
  { id: "fillers", label: "Fewer filler words", chip: 'I say "um" and "like" a lot', blurb: "Fillers instead of a clean pause.", criteria: ["fillers"], delta: "7 fillers → 2" },
];
