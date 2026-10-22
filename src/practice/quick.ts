// One tap to a real Drill, for the places that only say "Practice": Home, its empty state and the end of setup.
// In the browser preview (no real loop) this does nothing and the screen keeps its sample walk-through.

import type { Method, Story } from "../data/types";
import { checkAi, liveAvailable, startLive } from "./live";

/** A first run asks three questions; Home's usual Drill asks five. */
export const FIRST_DRILL = 3;
export const HOME_DRILL = 5;

/** Starts a Drill of general questions for the role, or questions that fit `storyId`. True when a real session started. */
export function startQuickDrill(ctx: { targetRole: string; stories: Story[]; methods: Method[] }, o: { count?: number; storyId?: string } = {}): boolean {
  if (!liveAvailable()) return false;
  startLive({ mode: "drill", stage: "hiring_manager", count: o.count ?? HOME_DRILL, source: o.storyId ? "story" : "stage", storyId: o.storyId }, ctx);
  void checkAi();
  return true;
}
