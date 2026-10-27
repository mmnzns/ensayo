import type { ComponentType } from "react";
import type { ManifestEntry } from "../manifest";
import ProgressHabits from "./ProgressHabits";
import ProgressSessions from "./ProgressSessions";
import Profile from "./Profile";
import TargetEditor from "./TargetEditor";
import SettingsPractice from "./SettingsPractice";
import SettingsVoice from "./SettingsVoice";
import SettingsSpeech from "./SettingsSpeech";
import SettingsAi from "./SettingsAi";
import SettingsPrivacy from "./SettingsPrivacy";
import SettingsCheckSetup from "./SettingsCheckSetup";
import Feedback from "./Feedback";
import SettingsAbout from "./SettingsAbout";
import SettingsDeveloper from "./SettingsDeveloper";
import { extras as settingsExtras } from "./extras";

/** Screen id to component, for this group's screens. */
export const routes: Record<string, ComponentType> = {
  "7-1-progress-habits": ProgressHabits,
  "7-2-progress-sessions": ProgressSessions,
  // You and Targets moved out of Settings into Profile. The old routes stay as aliases, so a saved link or an old
  // build still lands there; the same for Practice, now Settings › General.
  profile: Profile,
  "8-1-settings-profile": Profile,
  "8-1-settings-you": Profile,
  "8-2-settings-targets": Profile,
  "8-3-target-editor": TargetEditor,
  "settings-general": SettingsPractice,
  "8-2-settings-practice": SettingsPractice,
  "8-3-settings-voice": SettingsVoice,
  "8-4-settings-speech": SettingsSpeech,
  "8-5-settings-ai": SettingsAi,
  "8-6-settings-privacy": SettingsPrivacy,
  "8-7-settings-check-setup": SettingsCheckSetup,
  "9-1-feedback": Feedback,
  "settings-about": SettingsAbout,
  "settings-developer": SettingsDeveloper,
};

/** Extra screens (states, dialogs) this group adds beyond the 46 in the design export. */
export const extras: ManifestEntry[] = settingsExtras;
