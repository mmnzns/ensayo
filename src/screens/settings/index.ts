import type { ComponentType } from "react";
import type { ManifestEntry } from "../manifest";
import ProgressHabits from "./ProgressHabits";
import ProgressSessions from "./ProgressSessions";
import SettingsProfile from "./SettingsProfile";
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
  "8-1-settings-profile": SettingsProfile,
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
