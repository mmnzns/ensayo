import type { ComponentType } from "react";
import type { ManifestEntry } from "../manifest";
import ClosedReason from "./ClosedReason";
import DataFolderMissing from "./DataFolderMissing";
import DeleteAllData from "./DeleteAllData";
import DeleteApplication from "./DeleteApplication";
import DeleteRep from "./DeleteRep";
import DeleteStory from "./DeleteStory";
import DidntCatchThat from "./DidntCatchThat";
import ErrorKeyRejected from "./ErrorKeyRejected";
import ErrorMicDenied from "./ErrorMicDenied";
import ErrorNoSpeechModel from "./ErrorNoSpeechModel";
import ErrorOfflineEngine from "./ErrorOfflineEngine";
import GenericError from "./GenericError";
import NightBeforeLockWarning from "./NightBeforeLockWarning";
import OtherMachineOpen from "./OtherMachineOpen";
import ScannedPdf from "./ScannedPdf";
import SyncConflict from "./SyncConflict";

export { default as Dialog, useQuietConfirm } from "./Dialog";
export { ClosedReasonDialog } from "./ClosedReason";
export { DeleteStoryDialog } from "./DeleteStory";
export { DeleteApplicationDialog } from "./DeleteApplication";
export { DeleteRepDialog } from "./DeleteRep";
export { DeleteAllDataDialog } from "./DeleteAllData";
export { NightBeforeLockWarningDialog } from "./NightBeforeLockWarning";
export { ScannedPdfDialog } from "./ScannedPdf";
export { SyncConflictDialog } from "./SyncConflict";
export { DataFolderMissingDialog } from "./DataFolderMissing";
export { OtherMachineOpenDialog } from "./OtherMachineOpen";

/** Screen id to component, for this group's screens. */
export const routes: Record<string, ComponentType> = {
  "states-closed-reason": ClosedReason,
  "states-delete-story": DeleteStory,
  "states-delete-application": DeleteApplication,
  "states-delete-rep": DeleteRep,
  "states-delete-all-data": DeleteAllData,
  "states-night-before-lock-warning": NightBeforeLockWarning,
  "states-scanned-pdf": ScannedPdf,
  "states-sync-conflict": SyncConflict,
  "states-data-folder-missing": DataFolderMissing,
  "states-other-machine-open": OtherMachineOpen,
  "states-error-offline-engine": ErrorOfflineEngine,
  "states-error-mic-denied": ErrorMicDenied,
  "states-error-no-speech-model": ErrorNoSpeechModel,
  "states-error-key-rejected": ErrorKeyRejected,
  "states-didnt-catch-that": DidntCatchThat,
  "states-generic-error": GenericError,
};

const extra = (id: string, title: string, name: string): ManifestEntry => ({ id, title, shell: "focus", group: "states", name, designed: false });

/** Extra screens (states, dialogs) this group adds beyond the 46 in the design export. */
export const extras: ManifestEntry[] = [
  extra("states-closed-reason", "Dialog, why did this close", "ClosedReason"),
  extra("states-delete-story", "Dialog, delete story", "DeleteStory"),
  extra("states-delete-application", "Dialog, delete application", "DeleteApplication"),
  extra("states-delete-rep", "Dialog, delete answer", "DeleteRep"),
  extra("states-delete-all-data", "Dialog, delete all data", "DeleteAllData"),
  extra("states-night-before-lock-warning", "Dialog, night-before set is locked", "NightBeforeLockWarning"),
  extra("states-scanned-pdf", "Dialog, PDF has no text", "ScannedPdf"),
  extra("states-sync-conflict", "Dialog, two versions of a file", "SyncConflict"),
  extra("states-data-folder-missing", "Dialog, data folder missing", "DataFolderMissing"),
  extra("states-other-machine-open", "Dialog, open on another computer", "OtherMachineOpen"),
  extra("states-error-offline-engine", "Error, AI engine unreachable", "ErrorOfflineEngine"),
  extra("states-error-mic-denied", "Error, microphone blocked", "ErrorMicDenied"),
  extra("states-error-no-speech-model", "Error, no speech model", "ErrorNoSpeechModel"),
  extra("states-error-key-rejected", "Error, key not accepted", "ErrorKeyRejected"),
  extra("states-didnt-catch-that", "Didn't catch that", "DidntCatchThat"),
  extra("states-generic-error", "Error, something went wrong", "GenericError"),
];
