import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFS,
  PREFS_KEY,
  chooseVoice,
  readPrefs,
  speechRate,
  stageIdOf,
  stageLabelOf,
  updatePractice,
  updateSpeech,
  updateVoice,
  voiceChoices,
  type VoiceLike,
} from "../screens/settings/prefs";

function fakeStorage(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(PREFS_KEY, initial);
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe("saved settings", () => {
  it("starts from the defaults when nothing is saved", () => {
    expect(readPrefs(fakeStorage())).toEqual(DEFAULT_PREFS);
  });

  it("keeps everything under one key", () => {
    const s = fakeStorage();
    updatePractice({ questions: 10 }, s);
    updateVoice({ speed: "Faster" }, s);
    expect([...s.data.keys()]).toEqual([PREFS_KEY]);
    const back = readPrefs(s);
    expect(back.practice.questions).toBe(10);
    expect(back.voice.speed).toBe("Faster");
  });

  it("keeps the speech model choice with the rest", () => {
    const s = fakeStorage();
    expect(readPrefs(s).speech.model).toBe("");
    updateSpeech({ model: "whisper-small" }, s);
    expect(readPrefs(s).speech.model).toBe("whisper-small");
    expect(readPrefs(s).practice).toEqual(DEFAULT_PREFS.practice);
  });

  it("changes one setting and leaves the rest", () => {
    const s = fakeStorage();
    const next = updatePractice({ followUps: false }, s);
    expect(next.practice).toEqual({ ...DEFAULT_PREFS.practice, followUps: false });
    expect(next.voice).toEqual(DEFAULT_PREFS.voice);
  });

  it("falls back to the default for a single bad field and keeps the good ones", () => {
    const s = fakeStorage(JSON.stringify({ practice: { stage: "nonsense", questions: 7, tries: 2, timer: "yes", followUps: false }, voice: { speed: "Warp", readAloud: false } }));
    const p = readPrefs(s);
    expect(p.practice.stage).toBe(DEFAULT_PREFS.practice.stage);
    expect(p.practice.questions).toBe(DEFAULT_PREFS.practice.questions);
    expect(p.practice.tries).toBe(2);
    expect(p.practice.timer).toBe(DEFAULT_PREFS.practice.timer);
    expect(p.practice.followUps).toBe(false);
    expect(p.voice.speed).toBe("Normal");
    expect(p.voice.readAloud).toBe(false);
  });

  it("survives damaged text and storage that throws", () => {
    expect(readPrefs(fakeStorage("{not json"))).toEqual(DEFAULT_PREFS);
    expect(readPrefs(fakeStorage("null"))).toEqual(DEFAULT_PREFS);
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readPrefs(blocked)).toEqual(DEFAULT_PREFS);
    expect(updatePractice({ tries: 2 }, blocked).practice.tries).toBe(2);
  });

  it("matches the sample defaults the screens were designed with", () => {
    expect(DEFAULT_PREFS.practice).toEqual({ stage: "hiring_manager", questions: 5, tries: 3, timer: true, followUps: true, autoStop: false });
    expect(DEFAULT_PREFS.voice).toMatchObject({ readAloud: true, voiceUri: "", speed: "Normal", readTrySaying: true });
  });
});

describe("stages", () => {
  it("goes between the label in the list and the id the session uses", () => {
    expect(stageIdOf("Hiring manager")).toBe("hiring_manager");
    expect(stageLabelOf("leadership")).toBe("Leadership");
    expect(stageIdOf("Somewhere else")).toBe("hiring_manager");
  });
});

describe("voice", () => {
  const voices: VoiceLike[] = [
    { voiceURI: "com.apple.voice.Karen", name: "Karen", lang: "en-AU", localService: true },
    { voiceURI: "com.apple.voice.Samantha", name: "Samantha", lang: "en-US", localService: true },
    { voiceURI: "com.apple.voice.Amelie", name: "Amélie", lang: "fr-CA", localService: true },
    { voiceURI: "net.cloud", name: "Cloud Voice", lang: "en-GB", localService: false },
  ];

  it("lists English voices first by name, then the rest, with the language in the label", () => {
    const list = voiceChoices(voices);
    expect(list.map((v) => v.value)).toEqual(["net.cloud", "com.apple.voice.Karen", "com.apple.voice.Samantha", "com.apple.voice.Amelie"]);
    expect(list[0].label).toBe("Cloud Voice · British English");
  });

  it("finds the saved voice, and gives nothing for automatic or a voice that went away", () => {
    expect(chooseVoice(voices, "com.apple.voice.Samantha")?.name).toBe("Samantha");
    expect(chooseVoice(voices, "")).toBeUndefined();
    expect(chooseVoice(voices, "gone")).toBeUndefined();
  });

  it("maps the three speeds to a speaking rate", () => {
    expect(speechRate("Slower")).toBeLessThan(speechRate("Normal"));
    expect(speechRate("Normal")).toBe(1);
    expect(speechRate("Faster")).toBeGreaterThan(speechRate("Normal"));
  });
});
