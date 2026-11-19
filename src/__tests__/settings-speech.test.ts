import { describe, expect, it } from "vitest";
import { SPEECH_MODELS } from "../practice/api";
import { aboutModel, candidateModels, ratingOf, speedWhere, deleteQuestion, deletedLine, hiddenCount, inUseModel, modelRows, modelsSize, progressPercent, speechOrder, visibleRows, type SpeechModelEntry } from "../screens/settings/speechModels";

const entry = (id: string, state: SpeechModelEntry["state"], size_mb = 100): SpeechModelEntry => ({ id, name: id, maker: "OpenAI", note: "", languages: "", size_mb, state });

describe("which speech model is in use", () => {
  it("starts with Parakeet Ultra on Windows and Whisper Turbo on the Mac, with the same models in both", () => {
    expect(speechOrder("windows")[0]).toBe("parakeet-ultra");
    expect(speechOrder("mac")[0]).toBe("whisper-turbo");
    expect(speechOrder("other")[0]).toBe("whisper-turbo");
    expect([...speechOrder("windows")].sort()).toEqual([...speechOrder("mac")].sort());
  });

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
    expect(rows[1]).toMatchObject({ canUse: true, fetch: null, canDelete: true });
    expect(rows[2]).toMatchObject({ canUse: false, fetch: "Download", canDelete: false });
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

describe("a model that is partly downloaded, being fetched, or being fetched by another app", () => {
  const partial = { ...entry("whisper-small", "partial"), fraction: 0.4 };
  const elsewhere = { ...entry("parakeet-v3", "downloading_elsewhere"), fraction: 0.5 };
  const here = { ...entry("whisper-base", "downloading"), fraction: 0.25 };

  it("offers Resume for an interrupted download and says how much is there", () => {
    const [row] = modelRows([partial], "");
    expect(row).toMatchObject({ fetch: "Resume", status: "Partly downloaded, 40%", canUse: false, canDelete: false });
  });

  it("waits, with no button, for a download another Craft Concepts app is running", () => {
    const [row] = modelRows([elsewhere], "");
    expect(row).toMatchObject({ fetch: null, elsewhere: true, status: "Another Craft Concepts app is downloading it", canUse: false, canDelete: false });
  });

  it("shows a download running here as downloading, from the backend state or from this window's own download", () => {
    expect(modelRows([here], "")[0]).toMatchObject({ downloadingHere: true, fetch: null, status: "Downloading" });
    const [row] = modelRows([entry("whisper-base", "missing")], "", "whisper-base");
    expect(row).toMatchObject({ downloadingHere: true, fetch: null });
  });

  it("is never counted as on this computer until it is complete", () => {
    expect(modelsSize([partial, elsewhere, here])).toBe(0);
    expect(inUseModel([partial, elsewhere, here], "whisper-small")).toBe("");
  });
});

describe("recommended models first, the rest behind Show all models", () => {
  const rec = (id: string, state: SpeechModelEntry["state"] = "missing") => ({ ...entry(id, state), recommended: true });
  const more = (id: string, state: SpeechModelEntry["state"] = "missing") => ({ ...entry(id, state), recommended: false });
  const list = [rec("whisper-turbo", "ready"), rec("parakeet-v3"), more("whisper-medium-en"), more("whisper-tiny-en", "on_this_computer"), more("whisper-base-en", "partial")];

  it("lists only the picks, and any other model that is here or half downloaded, until Show all models", () => {
    const rows = modelRows(list, "whisper-turbo");
    expect(visibleRows(rows, false).map((r) => r.id)).toEqual(["whisper-turbo", "parakeet-v3", "whisper-tiny-en", "whisper-base-en"]);
    expect(hiddenCount(rows)).toBe(1);
  });

  it("lists everything, in the order given, when asked", () => {
    expect(visibleRows(modelRows(list, ""), true).map((r) => r.id)).toEqual(list.map((m) => m.id));
  });

  it("treats a backend that sends no recommended flag as every model being a pick", () => {
    expect(visibleRows(modelRows([entry("a", "missing")], ""), false)).toHaveLength(1);
  });
});

describe("deleting a model", () => {
  it("asks in plain words that name the model and say other apps keep it", () => {
    expect(deleteQuestion("Whisper Large Turbo")).toBe("Delete Whisper Large Turbo? Other Craft Concepts apps that use it keep it.");
  });

  it("says what happened for each answer", () => {
    expect(deletedLine("Whisper Small", "erased")).toBe("Whisper Small is deleted from this computer.");
    expect(deletedLine("Whisper Small", "kept")).toContain("Another Craft Concepts app still uses it");
    expect(deletedLine("Whisper Small", "not_using")).toBe("Ensayo wasn't using Whisper Small.");
  });
});

describe("ratings and where a model runs", () => {
  const model = (over: Partial<SpeechModelEntry> = {}): SpeechModelEntry => ({ ...entry("whisper-turbo", "missing", 574), languages: "99 languages", speed: 2, accuracy: 3, english_only: false, kind: "whisper", runs_on: "card", card_path: true, ...over });

  it("keeps a rating between 1 and 3 dots and has none for a model without one", () => {
    expect(ratingOf(2)).toBe(2);
    expect(ratingOf(7)).toBe(3);
    expect(ratingOf(0)).toBeNull();
    expect(ratingOf(undefined)).toBeNull();
  });

  it("puts the ratings on the row only when the backend gave both", () => {
    expect(modelRows([model()], "")[0].ratings).toEqual({ speed: 2, accuracy: 3 });
    expect(modelRows([model({ speed: undefined })], "")[0].ratings).toBeNull();
    expect(modelRows([entry("qwen", "missing")], "")[0]).toMatchObject({ ratings: null, speedWhere: null, about: null });
  });

  it("says where the speed applies on this computer", () => {
    expect(speedWhere(model())).toBe("on the graphics card");
    expect(speedWhere(model({ runs_on: "processor", card_path: false }))).toBe("on the processor");
    expect(speedWhere(model({ runs_on: "processor", card_path: true }))).toBe("on the processor here, faster on a graphics card");
    expect(speedWhere(entry("a", "missing"))).toBeNull();
  });

  it("describes the model: languages, punctuation, size and where it does best", () => {
    expect(aboutModel(model())).toBe("99 languages, adds punctuation, a mid-size download, best on a graphics card.");
    expect(aboutModel(model({ english_only: true, size_mb: 142 }))).toBe("English only, adds punctuation, a small download, best on a graphics card.");
    expect(aboutModel(model({ kind: "nemotron", languages: "35 languages", size_mb: 2400, card_path: false }))).toBe("35 languages, a large download, works well on the processor.");
    expect(aboutModel(entry("a", "missing"))).toBeNull();
  });

  it("uses no long dashes in what it says", () => {
    for (const k of ["whisper", "parakeet", "nemotron"]) {
      expect(aboutModel(model({ kind: k }))).not.toMatch(/[\u2013\u2014]/);
    }
    expect(speedWhere(model({ runs_on: "processor" }))).not.toMatch(/[\u2013\u2014]/);
  });
});
