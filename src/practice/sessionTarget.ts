// Which target a practice session is for: the application's own target when practising an application, else the one
// that is active. Pure, so the screens that start a session agree.

import { applicationTarget } from "../data/targets";
import type { Application, Target } from "../data/types";

export function practiceTargetFor(application: Pick<Application, "targetId"> | undefined, targets: Target[], active: Target | undefined): Target | undefined {
  return application ? (applicationTarget(application, targets) ?? active) : active;
}
