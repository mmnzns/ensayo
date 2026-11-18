// Which models run the full Smart coach. The catalog lists them per provider (`coach_models` on the provider info);
// anything else, and everything on this computer, gives basic feedback.

/** A provider as the catalog lists it (aiSettings.ts's ProviderInfo). Only `coach_models` is read, and it may be missing. */
export type CoachProvider = object;

const coachModelsOf = (provider: CoachProvider | undefined | null): string[] => (provider as { coach_models?: string[] } | undefined | null)?.coach_models ?? [];

export const FULL_LABEL = "Full coach";
export const FULL_LINE = "This model runs the full coach.";
export const BASIC_MODEL_LINE = "Basic feedback with this model. Pick one marked Full coach for the full coach.";
export const LOCAL_LINE = "On this computer you get basic feedback. The full coach needs your own key with a model marked Full coach.";

/** True when this model id runs the full coach for the provider. */
export const isFullCoach = (provider: CoachProvider | undefined | null, model: string): boolean => !!model && coachModelsOf(provider).includes(model);

/** The one line under the model picker. `kind` is the engine choice ("local", "key" or "timing"); timing has no model, so no line. */
export function coachLine(kind: string, provider: CoachProvider | undefined | null, model: string): string | null {
  if (kind === "local") return LOCAL_LINE;
  if (kind !== "key") return null;
  return isFullCoach(provider, model) ? FULL_LINE : BASIC_MODEL_LINE;
}
