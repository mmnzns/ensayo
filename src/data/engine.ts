// What the sidebar says about the feedback engine, worked out from the saved AI settings and whether the engine can run now.

import { BUILT_IN, isLocalAddress, localEngineFor, type AiSettings, type ProviderInfo } from "../screens/settings/aiSettings";
import type { EngineStatus } from "./types";

export const TIMING_ONLY: EngineStatus = { label: "Timing only", kind: "timing", offline: false };

/** "claude-sonnet-5-5" reads "Claude Sonnet 5.5"; anything else is left to the provider's name. */
export function modelLabel(modelId: string): string | null {
  const m = /^claude-([a-z]+)-(\d+)-(\d+)$/.exec(modelId.trim());
  return m ? `Claude ${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}.${m[3]}` : null;
}

/**
 * `settings` is what `ai_settings` returned (null before it has), `ready` is what `ai_ready` said (the engine is chosen
 * and can run: a key is saved, or the local model is on this computer), `online` is the browser's idea of the connection.
 * An engine that is chosen but cannot run counts as timing only, because that is what the user gets.
 */
export function engineStatusOf(settings: AiSettings | null, ready: boolean, providers: ProviderInfo[], online = true): EngineStatus {
  if (!settings || !settings.provider.trim() || !ready) return TIMING_ONLY;
  if (settings.provider === BUILT_IN) return { label: "Built-in model", kind: "local", offline: false };
  if (settings.provider === "compatible") {
    if (isLocalAddress(settings.base_url)) return { label: localEngineFor(settings.base_url).name, kind: "local", offline: false };
    return { label: "Your own server", kind: "key", offline: !online };
  }
  const info = providers.find((p) => p.id === settings.provider);
  const model = settings.fast_model.trim() || info?.fast_default || "";
  return { label: modelLabel(model) ?? info?.name ?? settings.provider, kind: "key", offline: !online };
}
