// "Keep <target>": the person looked at the banner and chose to leave the application where it is. In the app it is saved
// on the application (`fitDismissedFor`, cleared when it moves or its posting changes); this local list is the browser
// preview's stand-in and a fallback.

const KEY = "ensayo.fit-kept";

const read = (storage: Pick<Storage, "getItem">): string[] => {
  try {
    const v = JSON.parse(storage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

const defaultStorage = (): Storage | undefined => {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
};

/** Kept when the application says so (saved in the data folder by the app), or, in the browser preview, on this computer. */
export function isKept(appId: string, targetId: string | undefined, storage: Pick<Storage, "getItem"> | undefined = defaultStorage(), saved?: string | null): boolean {
  if (saved && saved === targetId) return true;
  return !!storage && read(storage).includes(`${appId}:${targetId ?? ""}`);
}

export function keepTarget(appId: string, targetId: string | undefined, storage: Pick<Storage, "getItem" | "setItem"> | undefined = defaultStorage()): void {
  if (!storage) return;
  try {
    const list = read(storage);
    const id = `${appId}:${targetId ?? ""}`;
    if (!list.includes(id)) storage.setItem(KEY, JSON.stringify([...list, id]));
  } catch {
    // Without storage the banner simply comes back next time.
  }
}
