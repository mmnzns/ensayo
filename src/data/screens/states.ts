// Screen-specific sample data for the "states" group (dialogs, errors, empty states). Owned by that group's agent; shared entities live in ../mock/.
import type { ClosedReason } from "../types";

export interface ClosedReasonOption {
  id: ClosedReason;
  label: string;
  hint: string;
}

export interface StatesData {
  closedReasons: ClosedReasonOption[];
  /** The answer shown in "Delete this answer?". `at` is a local date-time. */
  deleteRep: { question: string; attempt: number; of: number; at: string };
  /** What "Delete all Ensayo data" removes, in the order it is listed. */
  deleteAll: { confirmWord: string; removes: { label: string; detail: string }[] };
  /** The set locked the night before the Kestrel Pay hiring manager stage. */
  lockedSet: { opener: string; storyTitle: string; questions: string[] };
  /** A resume PDF that is only a picture of text. */
  scannedPdf: { fileName: string };
  /** Two copies of one file after a sync clash. */
  syncConflict: {
    fileName: string;
    versions: { fileName: string; at: string; machine: string; summary: string[] }[];
  };
  dataFolderMissing: { path: string; localPath: string };
  otherMachine: { machine: string; lastSeen: string };
  speechModel: { name: string; sizeMb: number };
  keyRejected: { provider: string };
  didntCatch: { heardSeconds: number; neededSeconds: number };
  genericError: { version: string; system: string; at: string; message: string };
}

export const statesData: StatesData = {
  closedReasons: [
    { id: "no_response", label: "No response", hint: "They went quiet and I stopped waiting." },
    { id: "rejected", label: "Rejected", hint: "They told me it's a no." },
    { id: "withdrew", label: "I withdrew", hint: "I decided to stop this one." },
    { id: "accepted", label: "I accepted", hint: "I took the offer." },
  ],
  deleteRep: {
    question: "Tell me about a time you turned around a metric that was heading the wrong way.",
    attempt: 2,
    of: 3,
    at: "2026-10-21T21:12:00",
  },
  deleteAll: {
    confirmWord: "DELETE",
    removes: [
      { label: "Speech and local AI models", detail: "The downloads on this computer. You can download them again." },
      { label: "Everything in your data folder", detail: "Stories, applications, resumes, sessions, answers and notes." },
      { label: "Your settings", detail: "Profile, practice choices, voice and privacy choices." },
      { label: "Logs", detail: "Anything Ensayo wrote about itself on this computer." },
      { label: "Saved keys", detail: "API keys held in your computer's key store." },
    ],
  },
  lockedSet: {
    opener: "Tell me about yourself",
    storyTitle: "Onboarding drop-off",
    questions: ["What does success look like in the first 90 days?", "How does lifecycle work with product here?"],
  },
  scannedPdf: { fileName: "Dana Ortiz, Resume, Kestrel.pdf" },
  syncConflict: {
    fileName: "story.json",
    versions: [
      {
        fileName: "story.json",
        at: "2026-10-20T16:42:00",
        machine: "MacBook Pro",
        summary: ["Result says 44% after the change", "Two follow-up angles"],
      },
      {
        fileName: "story (1).json",
        at: "2026-10-21T08:15:00",
        machine: "Home desktop",
        summary: ["Result says 40% after the change", "Added a number for team size", "Three follow-up angles"],
      },
    ],
  },
  dataFolderMissing: { path: "Google Drive/Ensayo", localPath: "Documents/Ensayo (local)" },
  otherMachine: { machine: "Home desktop", lastSeen: "2026-10-21T21:26:00" },
  speechModel: { name: "Whisper Large Turbo", sizeMb: 575 },
  keyRejected: { provider: "Anthropic" },
  didntCatch: { heardSeconds: 1.8, neededSeconds: 3 },
  genericError: {
    version: "0.0.1",
    system: "macOS",
    at: "2026-10-21T21:30:00",
    message: "Could not read sessions/s_today/session.json: unexpected end of file",
  },
};
