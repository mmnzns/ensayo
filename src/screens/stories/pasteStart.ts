/** What the paste box opens with: what the person already typed, else empty in the app. The sample text is for the browser preview only. */
export function pasteStart(typed: string | undefined, sample: string, inApp: boolean): string {
  return typed ?? (inApp ? "" : sample);
}
