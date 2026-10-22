// Which stories a question is measured against: up to three, by matching competencies, situation and best_for.
// No AI ranking call in v0 (Build Plan, Story selection).

import { visibleStories } from "../data/targets";
import type { Method, Story, Target } from "../data/types";
import { storyFit, type BankQuestion } from "./questions";

/** Pinned stories count a little more, so they come first among stories that fit about the same. A story that does not fit the question is never pulled in by a pin. */
const PIN_BONUS = 2;

/** With a target, its hidden stories are never used and its pinned ones go first. */
export function pickStories(q: BankQuestion, allStories: Story[], methods: Method[] = [], target?: Pick<Target, "pinnedStoryIds" | "hiddenStoryIds">): Story[] {
  const stories = visibleStories(allStories, target);
  const pinned = new Set(target?.pinnedStoryIds);
  const linked = new Set(q.behavioral_situation ? methods.filter((m) => m.situation === q.behavioral_situation).flatMap((m) => m.storyIds) : []);
  const named = q.best_story_id ? stories.find((s) => s.id === q.best_story_id) : undefined;
  const rest = stories
    .filter((s) => s.id !== named?.id)
    .map((s) => ({ s, score: storyFit(q, s) + (linked.has(s.id) ? 2 : 0) + (s.verified ? 0.5 : 0) }))
    .filter((x) => x.score >= 1)
    .map((x) => ({ ...x, score: x.score + (pinned.has(x.s.id) ? PIN_BONUS : 0) }))
    .sort((a, b) => b.score - a.score || a.s.title.localeCompare(b.s.title))
    .map((x) => x.s);
  return (named ? [named, ...rest] : rest).slice(0, 3);
}
