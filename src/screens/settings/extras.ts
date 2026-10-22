import type { ManifestEntry } from "../manifest";

/** Screens this group adds beyond the 46 in the design export. Kept apart from index.ts so a screen can read the list without a circular import. */
export const extras: ManifestEntry[] = [
  { id: "8-1-settings-you", title: "Settings, you", shell: "app", nav: "settings", group: "settings", name: "SettingsYou", designed: false },
  { id: "8-2-settings-targets", title: "Settings, targets", shell: "app", nav: "settings", group: "settings", name: "SettingsTargets", designed: false },
  { id: "8-3-target-editor", title: "Target editor", shell: "app", nav: "settings", group: "settings", name: "TargetEditor", designed: false },
  { id: "settings-about", title: "Settings, about", shell: "app", nav: "settings", group: "settings", name: "SettingsAbout", designed: false },
  { id: "settings-developer", title: "Settings, developer", shell: "app", nav: "settings", group: "settings", name: "SettingsDeveloper", designed: false },
];
