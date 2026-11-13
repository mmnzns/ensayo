// Where an AI error on the thinking screen goes: a rejected key and an unreachable engine each have their own page.
// The backend words them (ai/providers.rs: http_error 401 and 403, transport_error), so the text is what is matched.

export const KEY_REJECTED = "states-error-key-rejected";
export const OFFLINE_ENGINE = "states-error-offline-engine";
export const NO_SPEECH_MODEL = "states-error-no-speech-model";

/** The page for this error text, or null to keep the generic error on the thinking screen. */
export function errorPage(error: string | null | undefined): string | null {
  const text = error ?? "";
  if (text.includes("didn't accept the API key")) return KEY_REJECTED;
  if (text.includes("Couldn't reach")) return OFFLINE_ENGINE;
  return null;
}

/** The provider named in a rejected-key line ("Claude didn't accept the API key..."), or null. */
export function providerOfRejection(error: string | null | undefined): string | null {
  const m = /^(.+?) didn't accept the API key/.exec((error ?? "").trim());
  return m ? m[1] : null;
}
