import type { NavId } from "../ui/Sidebar";

export type Group = "first-run" | "home" | "practice" | "results" | "stories" | "applications" | "settings" | "states";

export interface ManifestEntry {
  /** The route id. For designed screens this is the design file name without .html. */
  id: string;
  title: string;
  shell: "app" | "focus";
  /** The sidebar item that is highlighted (app shell only). */
  nav?: NavId;
  group: Group;
  /** Component name (file name inside the group folder). */
  name: string;
  /** True for the 46 screens in the design export; false for the extra states the Build Plan lists. */
  designed: boolean;
}

/** The 46 screens in the design export (Design/screens/html), in flow order. Generated from those files. */
export const manifest: ManifestEntry[] = [
  { id: "1-1-welcome", title: "Welcome to Ensayo", shell: "focus", group: "first-run", name: "Welcome", designed: true },
  { id: "1-2-about-you", title: "About you", shell: "focus", group: "first-run", name: "AboutYou", designed: true },
  { id: "1-3-what-to-work-on", title: "What to work on", shell: "focus", group: "first-run", name: "WhatToWorkOn", designed: true },
  { id: "1-4-microphone", title: "Microphone", shell: "focus", group: "first-run", name: "Microphone", designed: true },
  { id: "1-5-speech", title: "Speech", shell: "focus", group: "first-run", name: "Speech", designed: true },
  { id: "1-6-feedback-engine", title: "Feedback engine", shell: "focus", group: "first-run", name: "FeedbackEngine", designed: true },
  { id: "1-7-your-first-story", title: "Your first story", shell: "focus", group: "first-run", name: "YourFirstStory", designed: true },
  { id: "2-1-home", title: "Home", shell: "app", nav: "home", group: "home", name: "Home", designed: true },
  { id: "2-2-home-empty", title: "Home, first visit", shell: "app", nav: "home", group: "home", name: "HomeEmpty", designed: true },
  { id: "2-3-start-a-session", title: "Start a session", shell: "focus", group: "home", name: "StartASession", designed: true },
  { id: "3-1-practice-interviewer-asking", title: "Practice, interviewer asking", shell: "focus", group: "practice", name: "PracticeInterviewerAsking", designed: true },
  { id: "3-2-practice-recording", title: "Practice, recording", shell: "focus", group: "practice", name: "PracticeRecording", designed: true },
  { id: "3-3-practice-thinking", title: "Practice, thinking", shell: "focus", group: "practice", name: "PracticeThinking", designed: true },
  { id: "3-4-result-attempt-1-details-open", title: "Result, attempt 1", shell: "focus", group: "practice", name: "ResultAttempt1DetailsOpen", designed: true },
  { id: "3-5-result-attempt-2", title: "Result, attempt 2", shell: "focus", group: "practice", name: "ResultAttempt2", designed: true },
  { id: "3-6-follow-up", title: "Practice, follow-up", shell: "focus", group: "practice", name: "FollowUp", designed: true },
  { id: "3-7-clarifying-question", title: "Practice, clarifying question", shell: "focus", group: "practice", name: "ClarifyingQuestion", designed: true },
  { id: "3-8-result-everything-worked", title: "Result, everything worked", shell: "focus", group: "practice", name: "ResultEverythingWorked", designed: true },
  { id: "4-1-mock-in-progress", title: "Mock, in progress", shell: "focus", group: "results", name: "MockInProgress", designed: true },
  { id: "4-2-mock-your-questions", title: "Mock, your questions", shell: "focus", group: "results", name: "MockYourQuestions", designed: true },
  { id: "4-3-session-results-drill", title: "Session results", shell: "focus", group: "results", name: "SessionResultsDrill", designed: true },
  { id: "4-4-session-results-mock-debrief", title: "Mock debrief", shell: "focus", group: "results", name: "SessionResultsMockDebrief", designed: true },
  { id: "4-5-habit-graduation", title: "A habit stuck", shell: "focus", group: "results", name: "HabitGraduation", designed: true },
  { id: "5-1-stories", title: "Stories", shell: "app", nav: "stories", group: "stories", name: "Stories", designed: true },
  { id: "5-2-add-a-story-paste", title: "Add a story", shell: "app", nav: "stories", group: "stories", name: "AddAStoryPaste", designed: true },
  { id: "5-3-add-a-story-review", title: "Review your story", shell: "app", nav: "stories", group: "stories", name: "AddAStoryReview", designed: true },
  { id: "5-4-story", title: "Story, onboarding drop-off", shell: "app", nav: "stories", group: "stories", name: "Story", designed: true },
  { id: "5-5-methods", title: "How you work", shell: "app", nav: "stories", group: "stories", name: "Methods", designed: true },
  { id: "6-1-applications", title: "Applications", shell: "app", nav: "applications", group: "applications", name: "Applications", designed: true },
  { id: "6-2-new-application", title: "New application", shell: "app", nav: "applications", group: "applications", name: "NewApplication", designed: true },
  { id: "6-3-application-overview", title: "Kestrel Pay, overview", shell: "app", nav: "applications", group: "applications", name: "ApplicationOverview", designed: true },
  { id: "6-4-application-edit-details", title: "Application, edit details", shell: "app", nav: "applications", group: "applications", name: "ApplicationEditDetails", designed: true },
  { id: "6-5-application-the-resume-you-sent", title: "Application, resume", shell: "app", nav: "applications", group: "applications", name: "ApplicationTheResumeYouSent", designed: true },
  { id: "6-6-application-stages-and-night-before", title: "Kestrel Pay, stages and night before", shell: "app", nav: "applications", group: "applications", name: "ApplicationStagesAndNightBefore", designed: true },
  { id: "6-7-cue-sheet", title: "Cue sheet", shell: "focus", group: "applications", name: "CueSheet", designed: true },
  { id: "6-8-application-what-you-ve-said", title: "Kestrel Pay, what you've said", shell: "app", nav: "applications", group: "applications", name: "ApplicationWhatYouVeSaid", designed: true },
  { id: "7-1-progress-habits", title: "Progress, habits", shell: "app", nav: "progress", group: "settings", name: "ProgressHabits", designed: true },
  { id: "7-2-progress-sessions", title: "Progress, sessions", shell: "app", nav: "progress", group: "settings", name: "ProgressSessions", designed: true },
  { id: "8-1-settings-profile", title: "Settings, profile", shell: "app", nav: "settings", group: "settings", name: "SettingsProfile", designed: true },
  { id: "8-2-settings-practice", title: "Settings, practice", shell: "app", nav: "settings", group: "settings", name: "SettingsPractice", designed: true },
  { id: "8-3-settings-voice", title: "Settings, voice", shell: "app", nav: "settings", group: "settings", name: "SettingsVoice", designed: true },
  { id: "8-4-settings-speech", title: "Settings, speech", shell: "app", nav: "settings", group: "settings", name: "SettingsSpeech", designed: true },
  { id: "8-5-settings-ai", title: "Settings, AI", shell: "app", nav: "settings", group: "settings", name: "SettingsAi", designed: true },
  { id: "8-6-settings-privacy", title: "Settings, privacy", shell: "app", nav: "settings", group: "settings", name: "SettingsPrivacy", designed: true },
  { id: "8-7-settings-check-setup", title: "Settings, check setup", shell: "app", nav: "settings", group: "settings", name: "SettingsCheckSetup", designed: true },
  { id: "9-1-feedback", title: "Feedback", shell: "app", nav: "feedback", group: "settings", name: "Feedback", designed: true },
]
