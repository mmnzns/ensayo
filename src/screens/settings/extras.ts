import type { ManifestEntry } from "../manifest";

/** Screens this group adds beyond the 46 in the design export. Kept apart from index.ts so a screen can read the list without a circular import. */
export const extras: ManifestEntry[] = [
  { id: "settings-about", title: "Settings, about", shell: "app", nav: "settings", group: "settings", name: "SettingsAbout", designed: false },
  { id: "settings-developer", title: "Settings, developer", shell: "app", nav: "settings", group: "settings", name: "SettingsDeveloper", designed: false },
];
