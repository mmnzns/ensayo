// Which stories a question is measured against: up to three, by matching competencies, situation and best_for.
// No AI ranking call in v0 (Build Plan, Story selection).

import type { Method, Story } from "../data/types";
import { storyFit, type BankQuestion } from "./questions";

export function pickStories(q: BankQuestion, stories: Story[], methods: Method[] = []): Story[] {
  const linked = new Set(q.behavioral_situation ? methods.filter((m) => m.situation === q.behavioral_situation).flatMap((m) => m.storyIds) : []);
  const named = q.best_story_id ? stories.find((s) => s.id === q.best_story_id) : undefined;
  const rest = stories
    .filter((s) => s.id !== named?.id)
    .map((s) => ({ s, score: storyFit(q, s) + (linked.has(s.id) ? 2 : 0) + (s.verified ? 0.5 : 0) }))
    .filter((x) => x.score >= 1)
    .sort((a, b) => b.score - a.score || a.s.title.localeCompare(b.s.title))
    .map((x) => x.s);
  return (named ? [named, ...rest] : rest).slice(0, 3);
}
