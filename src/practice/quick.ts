// One tap to a real Drill, for the places that only say "Practice": Home, its empty state and the end of setup.
// In the browser preview (no real loop) this does nothing and the screen keeps its sample walk-through.

import type { Application, Method, ProcessStage, Story, Target } from "../data/types";
import { checkAi, liveAvailable, startLive, type LiveContext } from "./live";
import { earlierStages, type ExtraQuestion } from "./questions";

/** What a session needs from the person, as the practice buttons outside Start a session give it: the role and target being practised now. */
export function liveContextOf(store: { activeTarget?: Target; profile: { targetRole: string }; stories: Story[]; methods: Method[] }): LiveContext {
  return { targetRole: store.activeTarget?.role ?? store.profile.targetRole, stories: store.stories, methods: store.methods, target: store.activeTarget };
}

/** A first run asks three questions; Home's usual Drill asks five. */
export const FIRST_DRILL = 3;
export const HOME_DRILL = 5;

/** Starts a Drill of general questions for the role, or questions that fit `storyId`. True when a real session started. */
export function startQuickDrill(ctx: LiveContext, o: { count?: number; storyId?: string } = {}): boolean {
  if (!liveAvailable()) return false;
  startLive({ mode: "drill", stage: "hiring_manager", count: o.count ?? HOME_DRILL, source: o.storyId ? "story" : "stage", storyId: o.storyId }, ctx);
  void checkAi();
  return true;
}

/** Starts a Drill inside an application: its next stage's questions, with the application's context behind every answer. True when a real session started. */
export function startApplicationDrill(ctx: LiveContext, target: { application: Application; stage: ProcessStage }, extras?: ExtraQuestion[], count = HOME_DRILL, askedFirst?: boolean): boolean {
  if (!liveAvailable()) return false;
  startLive({ mode: "drill", stage: target.stage.stage, count, source: "application", applicationId: target.application.id, stageId: target.stage.id, startup: target.application.startup, extras, earlierStageIds: earlierStages(target.application.process, target.stage.id), askedFirst }, ctx);
  void checkAi();
  return true;
}
