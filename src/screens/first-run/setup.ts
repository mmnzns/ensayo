// The setup steps in the app: plain functions between what the backend reports and what the screens say.
// Nothing here talks to the backend; the screens do, and these decide what to show.

import type { HabitId, Profile, SellsTo, Seniority, Story } from "../../data/types";

// ---------- About you ----------

export interface AboutFields {
  name: string;
  role: string;
  industry: string;
  seniority: Seniority;
  sellsTo: SellsTo;
  who: string;
}

export interface AboutProblems {
  name?: string;
  role?: string;
}

export const ROLE_PROBLEM = "Add the role you're going for, so the questions fit it.";
export const NAME_PROBLEM = "Add your first name so Ensayo can say hello.";

/** What still needs filling in before Continue saves. Industry and the sentence about you are optional. */
export function aboutProblems(f: AboutFields): AboutProblems {
  const out: AboutProblems = {};
  if (!f.name.trim()) out.name = NAME_PROBLEM;
  if (!f.role.trim()) out.role = ROLE_PROBLEM;
  return out;
}

/** The profile to save: the fields trimmed over `base`, which keeps what this step does not ask (full name, focus habits). */
export function profileFromAbout(base: Profile, f: AboutFields): Profile {
  return { ...base, name: f.name.trim(), targetRole: f.role.trim(), industry: f.industry.trim(), seniority: f.seniority, sellsTo: f.sellsTo, identityStatement: f.who.trim() };
}

// ---------- What to work on ----------

/** The design says "one or two", and Settings keeps the same limit. */
export const MAX_PICKS = 2;

/** Picks are kept in the order made; "Not sure yet" saves none (Ensayo suggests one after a few answers). */
export function habitsToSave(picked: HabitId[], notSure: boolean): HabitId[] {
  return notSure ? [] : picked.slice(-MAX_PICKS);
}

export const withHabits = (base: Profile, picked: HabitId[], notSure: boolean): Profile => ({ ...base, focusHabits: habitsToSave(picked, notSure) });

// ---------- Microphone ----------

export interface MicView {
  state: "allowed" | "ask" | "blocked" | "unclear";
  /** The words on the little badge. */
  badge: string;
  /** One plain line under it. */
  line: string;
  /** The step lets the user go on once the computer allows it (or cannot say, and the test can settle it). */
  canContinue: boolean;
}

/** `mic_permission` says "granted", "denied", "restricted", "undetermined" or "unknown". */
export function micView(permission: string): MicView {
  switch (permission) {
    case "granted":
      return { state: "allowed", badge: "Allowed", line: "Ensayo can hear this computer's microphone.", canContinue: true };
    case "undetermined":
      return { state: "ask", badge: "Not asked yet", line: "Press Allow and your computer will ask once. Say yes, and Ensayo can hear your answers.", canContinue: false };
    case "denied":
      return { state: "blocked", badge: "Blocked", line: "Your computer is not letting Ensayo use the microphone. It takes a minute to turn on.", canContinue: false };
    case "restricted":
      return { state: "blocked", badge: "Blocked", line: "This computer is set up so apps can't use the microphone. If it belongs to your work or school, ask the administrator to allow it.", canContinue: false };
    default:
      return { state: "unclear", badge: "Not sure", line: "Ensayo can't tell whether the microphone is allowed. Say a few words below and you will see.", canContinue: true };
  }
}

export type Os = "mac" | "windows" | "other";

/** From `navigator.userAgent` or `navigator.platform`. */
export function osOf(text: string): Os {
  if (/mac/i.test(text)) return "mac";
  if (/win/i.test(text)) return "windows";
  return "other";
}

/** How to turn the microphone on, one step per line, for this computer. */
export function micFix(os: Os): string[] {
  if (os === "mac") return ["Open System Settings, then Privacy and Security, then Microphone.", "Turn on the switch next to Ensayo.", "Come back here and press Check again."];
  if (os === "windows") return ["Open Settings, then Privacy, then Microphone.", "Turn on Microphone access, and let desktop apps use your microphone.", "Come back here and press Check again."];
  return ["Open your system's privacy settings and allow Ensayo to use the microphone.", "Come back here and press Check again."];
}

/** Keeps the last `max` readings of the level, each held between 0 and 1, for the bars. */
export function pushLevel(history: number[], level: number, max: number): number[] {
  const v = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  return [...history, v].slice(-max);
}

/** What the loudest moment of the three-second test says. `ok` means a voice was heard. */
export function levelVerdict(peak: number): { ok: boolean; line: string } {
  if (peak >= 0.25) return { ok: true, line: "Sounds clear." };
  if (peak >= 0.05) return { ok: true, line: "Heard you, but it's quiet. Move a little closer or speak up." };
  return { ok: false, line: "Ensayo can't hear anything. Check that the right microphone is picked, and try again." };
}

// ---------- Speech ----------

export interface SpeechModelStatus {
  id: string;
  name: string;
  size_mb: number;
  state: "ready" | "on_this_computer" | "missing";
}

export type SpeechPlan =
  | { kind: "ready"; modelId: string; name: string; fromOtherApp: boolean }
  | { kind: "download"; modelId: string; name: string; sizeMb: number; onlyVoiceDetection: boolean };

const here = (m: SpeechModelStatus) => m.state !== "missing";

/**
 * What the Speech step should offer. `models` are in Ensayo's order of preference (the first one here is used, the same
 * way a practice session picks it); `vad` is the small voice detection model every speech model needs, or null when it
 * could not be read. Null before anything is known.
 */
export function speechPlan(models: SpeechModelStatus[], vad: SpeechModelStatus | null): SpeechPlan | null {
  if (models.length === 0) return null;
  const found = models.find(here);
  if (found) {
    if (vad && !here(vad)) return { kind: "download", modelId: vad.id, name: vad.name, sizeMb: vad.size_mb, onlyVoiceDetection: true };
    return { kind: "ready", modelId: found.id, name: found.name, fromOtherApp: found.state === "on_this_computer" };
  }
  const first = models[0];
  return { kind: "download", modelId: first.id, name: first.name, sizeMb: first.size_mb, onlyVoiceDetection: false };
}

const message = (e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : "");
const OFFLINE = /dns|resolve|connect|error sending request|network is unreachable|offline|timed out|no route/i;

/** The backend rejects with a plain sentence; a lost connection gets its own, since a first download is when it shows. */
export function downloadErrorLine(e: unknown): string {
  const text = message(e).trim();
  if (!text) return "The download didn't finish. Try again in a moment.";
  if (/^Couldn't download/i.test(text) && OFFLINE.test(text)) {
    return "Ensayo couldn't reach the internet to download the speech model. Check your connection and try again, or press Skip and finish it later. Home reminds you until it is done. Nothing is lost; a download picks up where it stopped.";
  }
  return text;
}

// ---------- Your first story ----------

export interface FoundSummary {
  headline: string;
  /** The card headline with the number, or "" when the text had none. */
  proof: string;
  employer: string;
  gap: string;
  footnote: string;
}

const GAP_LINES: Record<string, string> = {
  approach: "Missing: what you noticed and why you chose that fix.",
  ownership: "Missing: what was yours, and who else helped.",
  proof_points: "Missing: a number that shows the change.",
  result: "Missing: what changed in the end.",
  scale: "Missing: how big it was, in people, money or time.",
};

/** What "What Ensayo found" shows for a draft the engine made from pasted text. */
export function foundSummary(draft: { story: Story; missing: string[]; dropped: string[] }): FoundSummary {
  const first = draft.missing.find((m) => GAP_LINES[m]);
  return {
    headline: draft.story.direct_answer.trim(),
    proof: draft.story.headline.trim(),
    employer: draft.story.employer.trim(),
    gap: first ? GAP_LINES[first] : "Nothing is missing. Every part is filled in.",
    footnote: draft.dropped.length > 0 ? "Some details were left out because they are not in your text. You will see which on the next screen." : "Nothing was added that isn't in your text.",
  };
}

/** The backend rejects with a plain sentence (no engine set up, offline, an answer it could not use); never show an empty one. */
export function parseProblemLine(e: unknown): string {
  const text = message(e).trim();
  return text || "Ensayo couldn't read that one. You can fill the story in yourself, or skip this and add one later.";
}
