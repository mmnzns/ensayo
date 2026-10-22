// Opening a web or email link. Inside the desktop window `target=_blank` and `mailto:` do nothing, so the app asks the
// system through Tauri's opener plugin. The plugin is loaded on first use, so the browser preview never needs it.

export const isExternal = (to: string): boolean => /^(https?:|mailto:)/.test(to);

/** Hands `url` to the system: the browser for a web address, the email app for `mailto:`. Rejects when it cannot. */
export async function openExternal(url: string): Promise<void> {
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

/** The click handler for an external link in the app, or undefined where the plain anchor already works. */
export function externalClick(to: string, app: boolean, open: (url: string) => Promise<void> = openExternal): ((e: { preventDefault(): void }) => void) | undefined {
  if (!app || !isExternal(to)) return undefined;
  return (e) => {
    e.preventDefault();
    void open(to).catch(() => {});
  };
}
