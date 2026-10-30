// Settings, Check setup in the app: plain functions from what the backend reports to the rows on the screen. The screen
// asks the backend (microphone, speech models, feedback engine, data folder); these decide the words and the fix.

import type { DataStatus } from "../../data/real";
import type { SetupCheck } from "../../data/screens/settings";
import { micFix, micView, type Os } from "../first-run/setup";
import type { AiView, LocalAiView } from "./aiSettings";
import { kindOfProvider, localModelOf } from "./aiSettings";
import { inUseModel, type SpeechModelEntry } from "./speechModels";
import { browserSource, loadNativeVoices } from "../../practice/voice";
import { NO_BROWSER_VOICE, NO_VOICE, probeBrowserVoices, voiceMode } from "../../practice/voiceEngine";

const SPEECH = "8-4-settings-speech";
const AI = "8-5-settings-ai";
const PRIVACY = "8-6-settings-privacy";

export function micCheck(permission: string, os: Os): SetupCheck {
  const v = micView(permission);
  const base = { id: "mic", label: "Microphone" };
  if (v.state === "allowed") return { ...base, detail: "Allowed. " + v.line, state: "ready" };
  if (v.state === "unclear") return { ...base, detail: "Ensayo can't tell whether the microphone is allowed. You will find out in your first session.", state: "ready" };
  if (v.state === "ask") return { ...base, detail: v.line, state: "fix", fixLabel: "Allow it", fixTo: "1-4-microphone" };
  return { ...base, detail: v.line, state: "fix", fixLabel: "How to fix", fixHelp: micFix(os).join(" ") };
}

/** The model a session will use, or the way to get one. */
export function speechCheck(models: SpeechModelEntry[], preferred: string): SetupCheck {
  const id = inUseModel(models, preferred);
  const base = { id: "speech", label: "Speech to text" };
  if (!id) return { ...base, detail: "No speech model on this computer yet, so Ensayo can't turn your answers into text.", state: "fix", fixLabel: "Get a model", fixTo: SPEECH };
  const name = models.find((m) => m.id === id)?.name ?? id;
  return { ...base, detail: `${name} is on this computer.`, state: "ready" };
}

/** `state` is what `model_status` says for the voice detection model; null when it could not be read. */
export function voiceDetectionCheck(state: string | null): SetupCheck {
  const base = { id: "vad", label: "Voice detection" };
  if (state === "ready" || state === "on_this_computer") return { ...base, detail: "The small model that finds where you start and stop talking is here.", state: "ready" };
  return { ...base, detail: "The small model that finds where you start and stop talking is missing. It comes with a speech model.", state: "fix", fixLabel: "Get it", fixTo: SPEECH };
}

/** The result of the test call: `ok` with nothing more to say, or the plain sentence the backend gave. */
export interface TestOutcome {
  ok: boolean;
  text: string;
}

export function aiCheck(view: AiView, local: LocalAiView | null, test: TestOutcome | null): SetupCheck {
  const base = { id: "ai", label: "Feedback engine" };
  const s = view.settings;
  const fix = (detail: string, fixLabel = "Open AI settings"): SetupCheck => ({ ...base, detail, state: "fix", fixLabel, fixTo: AI });
  const kind = kindOfProvider(s.provider);
  if (kind === "timing") return { ...base, detail: "No feedback engine. You get timing and filler words only.", state: "ready" };
  const name = view.providers.find((p) => p.id === s.provider)?.name ?? "The feedback engine";
  if (s.provider === "local") {
    const m = localModelOf(local, s);
    if (local && !local.helper_found) return fix("The built-in local AI can't start, because part of the app is missing. Reinstall Ensayo, or choose another engine.");
    if (!m || (m.state !== "ready" && m.state !== "on_this_computer")) return fix("The built-in local AI needs its model. Download it in Settings, AI.", "Download it");
    return { ...base, detail: `${m.name} is ready on this computer.`, state: "ready" };
  }
  if (kind === "key" && !view.providers.find((p) => p.id === s.provider)?.has_key) return fix(`There is no ${name} API key saved yet.`, "Add a key");
  if (!test) return fix(`${name} has not been tested yet.`, "Open AI settings");
  if (!test.ok) return fix(test.text || `${name} did not answer the test call.`);
  return { ...base, detail: `${kind === "local" ? "Your local server" : name} answered the test call.`, state: "ready" };
}

export function folderCheck(status: DataStatus): SetupCheck {
  const base = { id: "folder", label: "Data folder" };
  switch (status.state) {
    case "ready":
      return { ...base, detail: `${status.folder} is open here.`, state: "ready" };
    case "missing":
      return { ...base, detail: `Ensayo can't find ${status.folder}. If it lives in a synced drive, wait for the drive to finish syncing.`, state: "fix", fixLabel: "Choose a folder", fixTo: PRIVACY };
    case "other_machine": {
      const minutes = Math.max(1, Math.round((status.age_secs ?? 0) / 60));
      return {
        ...base,
        detail: `${status.machine ?? "Another computer"} was using this folder ${minutes === 1 ? "a minute" : `${minutes} minutes`} ago.`,
        state: "fix",
        fixLabel: "How to fix",
        fixHelp: "Another computer has Ensayo open on this folder. Close Ensayo there, wait a few seconds, then press Run again.",
      };
    }
    default:
      return {
        ...base,
        detail: `${status.machine ?? "Another computer"} did not close Ensayo cleanly.`,
        state: "fix",
        fixLabel: "How to fix",
        fixHelp: "Quit Ensayo here and open it again, then choose Open anyway. Nothing is lost.",
      };
  }
}

/** The interviewer's voice, from what the probe found. Nothing is spoken here; the row's Play a line button does that. */
export function voiceCheck(browserVoices: number, systemVoices: number, os: Os): SetupCheck {
  const base = { id: "voice", label: "Interviewer voice" };
  switch (voiceMode(browserVoices, systemVoices)) {
    case "list":
      return { ...base, detail: `${browserVoices} ${browserVoices === 1 ? "voice" : "voices"} from the app's browser engine. Press Play a line to hear one.`, state: "ready" };
    case "system":
      return { ...base, detail: `${NO_BROWSER_VOICE} Press Play a line to hear it.`, state: "ready" };
    default:
      return {
        ...base,
        detail: NO_VOICE,
        state: "fix",
        fixLabel: "How to fix",
        fixHelp:
          os === "windows"
            ? "Open Settings, then Time & language, then Speech, and add a voice. Then press Run again."
            : os === "mac"
              ? "Open System Settings, then Accessibility, then Spoken Content, and add a system voice. Then press Run again."
              : "Add a speech voice in your computer's settings, then press Run again.",
      };
  }
}

/** What the voice row needs to know: how many voices each engine has. */
export type VoiceCounts = () => Promise<{ browser: number; system: number }>;

const realVoiceCounts: VoiceCounts = async () => ({
  browser: (await probeBrowserVoices(browserSource())).length,
  system: (await loadNativeVoices()).length,
});

export function summaryLine(ready: number, total: number): string {
  return ready === total ? `${ready} of ${total} ready` : `${ready} of ${total} ready · you can still practice`;
}

// ---------- running them in the app ----------

export interface Checker {
  id: string;
  label: string;
  run: () => Promise<SetupCheck>;
}

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

const errorText = (e: unknown): string => (typeof e === "string" ? e : e instanceof Error ? e.message : "");

/** The checks, in the order they run. `invoke` is the app's command call and `preferred` the speech model chosen in Settings. */
export function checkers(invoke: Invoke, os: Os, preferred: string, voiceCounts: VoiceCounts = realVoiceCounts): Checker[] {
  const failed = (id: string, label: string): SetupCheck => ({ id, label, detail: "Ensayo couldn't run this check.", state: "fix", fixLabel: "Run again", fixHelp: "Press Run again. If it still fails, restart Ensayo." });
  const guard = (id: string, label: string, run: () => Promise<SetupCheck>) => async () => run().catch(() => failed(id, label));
  return [
    { id: "mic", label: "Microphone", run: guard("mic", "Microphone", async () => micCheck(await invoke<string>("mic_permission").catch(() => "unknown"), os)) },
    { id: "speech", label: "Speech to text", run: guard("speech", "Speech to text", async () => speechCheck(await invoke<SpeechModelEntry[]>("speech_models"), preferred)) },
    {
      id: "vad",
      label: "Voice detection",
      run: guard("vad", "Voice detection", async () => voiceDetectionCheck((await invoke<{ state: string }>("model_status", { id: "vad" }).catch(() => null))?.state ?? null)),
    },
    {
      id: "ai",
      label: "Feedback engine",
      run: guard("ai", "Feedback engine", async () => {
        const view = await invoke<AiView>("ai_settings");
        const s = view.settings;
        const local = s.provider === "local" ? await invoke<LocalAiView>("local_ai_status").catch(() => null) : null;
        const needsCall = kindOfProvider(s.provider) !== "timing" && s.provider !== "local" && (kindOfProvider(s.provider) === "local" || !!view.providers.find((p) => p.id === s.provider)?.has_key);
        let test: TestOutcome | null = null;
        if (needsCall) {
          test = await invoke("test_ai", { provider: s.provider, baseUrl: s.base_url || null, key: null }).then(
            () => ({ ok: true, text: "" }),
            (e) => ({ ok: false, text: errorText(e) }),
          );
        }
        return aiCheck(view, local, test);
      }),
    },
    {
      id: "voice",
      label: "Interviewer voice",
      run: guard("voice", "Interviewer voice", async () => {
        const n = await voiceCounts();
        return voiceCheck(n.browser, n.system, os);
      }),
    },
    { id: "folder", label: "Data folder", run: guard("folder", "Data folder", async () => folderCheck(await invoke<DataStatus>("data_status"))) },
  ];
}
