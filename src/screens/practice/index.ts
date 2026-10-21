import type { ComponentType } from "react";
import type { ManifestEntry } from "../manifest";
import PracticeInterviewerAsking from "./PracticeInterviewerAsking";
import PracticeRecording from "./PracticeRecording";
import PracticeThinking from "./PracticeThinking";
import ResultAttempt1DetailsOpen from "./ResultAttempt1DetailsOpen";
import ResultAttempt2 from "./ResultAttempt2";
import FollowUp from "./FollowUp";
import ClarifyingQuestion from "./ClarifyingQuestion";
import ResultEverythingWorked from "./ResultEverythingWorked";

/** Screen id to component, for this group's screens. */
export const routes: Record<string, ComponentType> = {
  "3-1-practice-interviewer-asking": PracticeInterviewerAsking,
  "3-2-practice-recording": PracticeRecording,
  "3-3-practice-thinking": PracticeThinking,
  "3-4-result-attempt-1-details-open": ResultAttempt1DetailsOpen,
  "3-5-result-attempt-2": ResultAttempt2,
  "3-6-follow-up": FollowUp,
  "3-7-clarifying-question": ClarifyingQuestion,
  "3-8-result-everything-worked": ResultEverythingWorked,
};

/** Extra screens (states, dialogs) this group adds beyond the 46 in the design export. */
export const extras: ManifestEntry[] = [];
