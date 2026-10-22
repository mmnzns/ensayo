import { describe, expect, it } from "vitest";
import { SPEECH_MODELS } from "../practice/api";
import { candidateModels, inUseModel, modelRows, modelsSize, progressPercent, type SpeechModelEntry } from "../screens/settings/speechModels";

const entry = (id: string, state: SpeechModelEntry["state"], size_mb = 100): SpeechModelEntry => ({ id, name: id, maker: "OpenAI", note: "", languages: "", size_mb, state });

describe("which speech model is in use", () => {
  it("tries the one chosen first, then Ensayo's usual order, without repeats", () => {
    expect(candidateModels("")).toEqual(SPEECH_MODELS);
    expect(candidateModels("parakeet-v3")).toEqual(["parakeet-v3", ...SPEECH_MODELS]);
    expect(candidateModels("whisper-small")).toEqual(["whisper-small", ...SPEECH_MODELS.filter((x) => x !== "whisper-small")]);
  });

  it("uses the chosen model when it is on this computer", () => {
    const list = [entry("whisper-turbo", "ready"), entry("whisper-small", "ready")];
    expect(inUseModel(list, "whisper-small")).toBe("whisper-small");
  });

  it("falls back to the usual order when the chosen one is gone or was never downloaded", () => {
    const list = [entry("whisper-turbo", "missing"), entry("whisper-small", "ready"), entry("whisper-base", "on_this_computer")];
    expect(inUseModel(list, "whisper-turbo")).toBe("whisper-small");
    expect(inUseModel(list, "")).toBe("whisper-small");
  });

  it("says nothing is in use before any model is here", () => {
    expect(inUseModel([entry("whisper-turbo", "missing")], "")).toBe("");
  });
});

describe("the model list", () => {
  const list = [entry("whisper-turbo", "ready", 574), entry("parakeet-v3", "on_this_computer", 670), entry("whisper-small", "missing", 488)];

  it("labels each row in plain words", () => {
    const rows = modelRows(list, "whisper-turbo");
    expect(rows.map((r) => r.status)).toEqual(["In use", "Found, from another app on this computer", "Not downloaded"]);
    expect(rows[0].inUse).toBe(true);
    expect(rows[1]).toMatchObject({ canUse: true, canDownload: false });
    expect(rows[2]).toMatchObject({ canUse: false, canDownload: true });
  });

  it("an own copy that is not in use can be picked", () => {
    const rows = modelRows([entry("a", "ready"), entry("b", "ready")], "a");
    expect(rows[1].status).toBe("Downloaded");
    expect(rows[1].canUse).toBe(true);
    expect(rows[0].canUse).toBe(false);
  });

  it("adds up only what is on this computer", () => {
    expect(modelsSize(list)).toBe(574 + 670);
  });

  it("turns a download fraction into a whole percent held between 0 and 100", () => {
    expect(progressPercent(0.426)).toBe(43);
    expect(progressPercent(2)).toBe(100);
    expect(progressPercent(-1)).toBe(0);
    expect(progressPercent(Number.NaN)).toBe(0);
  });
});
