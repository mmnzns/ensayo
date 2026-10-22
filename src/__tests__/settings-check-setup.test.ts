import { describe, expect, it } from "vitest";
import { aiCheck, folderCheck, micCheck, speechCheck, voiceDetectionCheck, summaryLine } from "../screens/settings/setupChecks";
import type { AiView, LocalAiView } from "../screens/settings/aiSettings";
import type { SpeechModelEntry } from "../screens/settings/speechModels";

const model = (id: string, state: SpeechModelEntry["state"]): SpeechModelEntry => ({ id, name: id === "whisper-turbo" ? "Whisper Large Turbo" : id, maker: "", note: "", languages: "", size_mb: 800, state });
const view = (provider: string, hasKey = false, over: Partial<AiView["settings"]> = {}): AiView => ({
  settings: { provider, fast_model: "", strong_model: "", base_url: "", cost_cap_usd: 0.25, ...over },
  providers: [{ id: "claude", name: "Claude", models: [], fast_default: "", strong_default: "", has_key: hasKey, needs_key: true, base_default: "" }],
});
const local = (state: "ready" | "missing", helper = true): LocalAiView => ({ models: [{ id: "q", name: "Qwen", maker: "", note: "", licence: "", size_mb: 2000, recommended: true, state }], selected: "q", helper_found: helper });

describe("microphone check", () => {
  it("is ready when allowed", () => {
    expect(micCheck("granted", "mac")).toMatchObject({ id: "mic", state: "ready", detail: "Allowed. Ensayo can hear this computer's microphone." });
  });
  it("says how to fix it when blocked, for this computer", () => {
    const c = micCheck("denied", "windows");
    expect(c.state).toBe("fix");
    expect(c.fixHelp).toContain("Settings, then Privacy, then Microphone");
  });
  it("points to the microphone step when it has not been asked yet", () => {
    expect(micCheck("undetermined", "mac")).toMatchObject({ state: "fix", fixTo: "1-4-microphone" });
  });
  it("is honest when the computer cannot say", () => {
    expect(micCheck("unknown", "mac").detail).toMatch(/can't tell/);
  });
});

describe("speech check", () => {
  it("names the model a session will use", () => {
    expect(speechCheck([model("whisper-turbo", "ready")], "")).toMatchObject({ state: "ready", detail: "Whisper Large Turbo is on this computer." });
  });
  it("follows the model chosen in Settings", () => {
    expect(speechCheck([model("whisper-turbo", "ready"), model("whisper-small", "on_this_computer")], "whisper-small").detail).toContain("whisper-small");
  });
  it("links to Settings, Speech when none is here", () => {
    expect(speechCheck([model("whisper-turbo", "missing")], "")).toMatchObject({ state: "fix", fixTo: "8-4-settings-speech" });
  });
});

describe("voice detection check", () => {
  it("is ready when the small model is here", () => {
    expect(voiceDetectionCheck("ready").state).toBe("ready");
    expect(voiceDetectionCheck("on_this_computer").state).toBe("ready");
  });
  it("links to Settings, Speech when missing", () => {
    expect(voiceDetectionCheck("missing")).toMatchObject({ state: "fix", fixTo: "8-4-settings-speech" });
    expect(voiceDetectionCheck(null).state).toBe("fix");
  });
});

describe("feedback engine check", () => {
  it("with no engine, says timing and filler words only, and that is fine", () => {
    expect(aiCheck(view(""), null, null)).toMatchObject({ state: "ready", detail: "No feedback engine. You get timing and filler words only." });
  });
  it("a cloud engine without a key needs one", () => {
    expect(aiCheck(view("claude", false), null, null)).toMatchObject({ state: "fix", fixTo: "8-5-settings-ai" });
  });
  it("a cloud engine with a key is ready when the test call worked, and says how many models answered", () => {
    expect(aiCheck(view("claude", true), null, { ok: true, text: "" })).toMatchObject({ state: "ready", detail: "Claude answered the test call." });
  });
  it("shows the plain sentence when the test call failed", () => {
    const c = aiCheck(view("claude", true), null, { ok: false, text: "Claude didn't accept the API key. Check it in Settings › AI." });
    expect(c).toMatchObject({ state: "fix", detail: "Claude didn't accept the API key. Check it in Settings › AI.", fixTo: "8-5-settings-ai" });
  });
  it("the built-in local AI needs its model and helper", () => {
    expect(aiCheck(view("local"), local("ready"), null)).toMatchObject({ state: "ready" });
    expect(aiCheck(view("local"), local("missing"), null)).toMatchObject({ state: "fix", fixTo: "8-5-settings-ai" });
    expect(aiCheck(view("local"), local("ready", false), null).state).toBe("fix");
  });
  it("another local server is ready when it answered", () => {
    expect(aiCheck(view("compatible", false, { base_url: "http://localhost:11434" }), null, { ok: true, text: "" }).state).toBe("ready");
    expect(aiCheck(view("compatible"), null, { ok: false, text: "Ensayo can't reach it." }).state).toBe("fix");
  });
});

describe("data folder check", () => {
  it("is ready when open here", () => {
    expect(folderCheck({ folder: "/Users/me/Ensayo", state: "ready", machine: null, age_secs: null })).toMatchObject({ state: "ready", detail: "/Users/me/Ensayo is open here." });
  });
  it("says when it cannot be found", () => {
    expect(folderCheck({ folder: "/x", state: "missing", machine: null, age_secs: null })).toMatchObject({ state: "fix", fixTo: "8-6-settings-privacy" });
  });
  it("names the other computer", () => {
    const c = folderCheck({ folder: "/x", state: "other_machine", machine: "Studio", age_secs: 120 });
    expect(c.state).toBe("fix");
    expect(c.detail).toContain("Studio");
  });
});

describe("summary", () => {
  it("counts the ready ones", () => {
    expect(summaryLine(5, 5)).toBe("5 of 5 ready");
    expect(summaryLine(3, 5)).toBe("3 of 5 ready · you can still practice");
  });
});
