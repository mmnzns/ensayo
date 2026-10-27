import type { ManifestEntry } from "../manifest";

/** Screens this group adds beyond the 46 in the design export. Kept apart from index.ts so a screen can read the list without a circular import. */
export const extras: ManifestEntry[] = [
  { id: "profile", title: "Profile", shell: "app", nav: "profile", group: "settings", name: "Profile", designed: false },
  { id: "settings-general", title: "Settings, general", shell: "app", nav: "settings", group: "settings", name: "SettingsGeneral", designed: false },
  { id: "8-3-target-editor", title: "Target editor", shell: "app", nav: "profile", group: "settings", name: "TargetEditor", designed: false },
  { id: "settings-about", title: "Settings, about", shell: "app", nav: "settings", group: "settings", name: "SettingsAbout", designed: false },
  { id: "settings-developer", title: "Settings, developer", shell: "app", nav: "settings", group: "settings", name: "SettingsDeveloper", designed: false },
];
