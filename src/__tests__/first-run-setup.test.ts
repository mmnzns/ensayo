import { describe, expect, it } from "vitest";
import { BLANK_PROFILE } from "../data/real";
import { emptyStory } from "../data/actions";
import type { Profile } from "../data/types";
import {
  MAX_PICKS,
  NAME_PROBLEM,
  ROLE_PROBLEM,
  aboutProblems,
  downloadErrorLine,
  foundSummary,
  habitsToSave,
  levelVerdict,
  micFix,
  micView,
  osOf,
  parseProblemLine,
  profileFromAbout,
  pushLevel,
  speechPlan,
  withHabits,
  type AboutFields,
  type SpeechModelStatus,
} from "../screens/first-run/setup";

const fields = (over: Partial<AboutFields> = {}): AboutFields => ({ name: "Sam", role: "Product manager", industry: "", seniority: "mid", sellsTo: "b2b", who: "", ...over });

describe("About you", () => {
  it("asks for a role in plain words", () => {
    expect(aboutProblems(fields({ role: "   " })).role).toBe(ROLE_PROBLEM);
    expect(aboutProblems(fields({ role: "Designer" })).role).toBeUndefined();
  });

  it("asks for a first name too, because Home says hello by name", () => {
    expect(aboutProblems(fields({ name: "" })).name).toBe(NAME_PROBLEM);
    expect(aboutProblems(fields({ name: "  " })).name).toBe(NAME_PROBLEM);
    expect(aboutProblems(fields())).toEqual({});
  });

  it("words the problems without alarm, pressure or exclamation", () => {
    for (const line of [ROLE_PROBLEM, NAME_PROBLEM]) {
      expect(line).not.toContain("!");
      expect(line).not.toContain("—");
      expect(line.toLowerCase()).not.toMatch(/invalid|error|required|fail/);
    }
  });

  it("builds the profile from the fields, trimmed, keeping what this step does not ask", () => {
    const base: Profile = { ...BLANK_PROFILE, focusHabits: ["numbers"], fullName: "Sam Reyes" };
    const p = profileFromAbout(base, fields({ name: "  Sam ", role: " Product manager ", industry: " Fintech ", who: " I turn messy problems into plans. " }));
    expect(p).toMatchObject({ name: "Sam", fullName: "Sam Reyes", targetRole: "Product manager", industry: "Fintech", seniority: "mid", sellsTo: "b2b", identityStatement: "I turn messy problems into plans.", focusHabits: ["numbers"] });
  });
});

describe("What to work on", () => {
  it("keeps the limit the design and Settings use", () => {
    expect(MAX_PICKS).toBe(2);
  });

  it("saves the picks in the order made, at most the limit", () => {
    expect(habitsToSave(["numbers", "ownership"], false)).toEqual(["numbers", "ownership"]);
    expect(habitsToSave(["numbers", "ownership", "why_first"], false)).toEqual(["ownership", "why_first"]);
  });

  it("saves nothing for Not sure yet", () => {
    expect(habitsToSave(["numbers"], true)).toEqual([]);
    expect(habitsToSave([], false)).toEqual([]);
  });

  it("changes only the habits on the profile", () => {
    const base: Profile = { ...BLANK_PROFILE, name: "Sam", targetRole: "PM" };
    expect(withHabits(base, ["numbers"], false)).toEqual({ ...base, focusHabits: ["numbers"] });
    expect(withHabits({ ...base, focusHabits: ["numbers"] }, [], true).focusHabits).toEqual([]);
  });
});

describe("Microphone", () => {
  it("says allowed in plain words and lets the user go on", () => {
    expect(micView("granted")).toMatchObject({ state: "allowed", badge: "Allowed", canContinue: true });
  });

  it("offers to ask when the computer has not been asked yet", () => {
    const v = micView("undetermined");
    expect(v).toMatchObject({ state: "ask", badge: "Not asked yet", canContinue: false });
    expect(v.line).toMatch(/Allow/);
  });

  it("calls denied and restricted blocked", () => {
    expect(micView("denied")).toMatchObject({ state: "blocked", badge: "Blocked", canContinue: false });
    expect(micView("restricted")).toMatchObject({ state: "blocked", canContinue: false });
    expect(micView("restricted").line).toMatch(/administrator|managed|restrict/i);
  });

  it("does not block when the computer cannot say (the test decides)", () => {
    expect(micView("unknown")).toMatchObject({ state: "unclear", canContinue: true });
    expect(micView("something-new").state).toBe("unclear");
  });

  it("explains the fix per system", () => {
    expect(micFix("mac").join(" ")).toContain("System Settings");
    expect(micFix("mac").join(" ")).toContain("Privacy and Security");
    expect(micFix("mac").join(" ")).toContain("Microphone");
    expect(micFix("windows").join(" ")).toContain("Settings");
    expect(micFix("windows").join(" ")).toContain("Privacy");
    expect(micFix("windows").join(" ")).toContain("Microphone");
    expect(micFix("other").length).toBeGreaterThan(0);
    for (const os of ["mac", "windows", "other"] as const) for (const s of micFix(os)) expect(s).not.toContain("—");
  });

  it("recognises the system from the platform text", () => {
    expect(osOf("MacIntel")).toBe("mac");
    expect(osOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("mac");
    expect(osOf("Win32")).toBe("windows");
    expect(osOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(osOf("Linux x86_64")).toBe("other");
  });

  it("keeps the last bars of the level history", () => {
    expect(pushLevel([], 0.5, 3)).toEqual([0.5]);
    expect(pushLevel([0.1, 0.2, 0.3], 0.4, 3)).toEqual([0.2, 0.3, 0.4]);
    expect(pushLevel([], 5, 3)).toEqual([1]);
    expect(pushLevel([], -1, 3)).toEqual([0]);
    expect(pushLevel([], Number.NaN, 3)).toEqual([0]);
  });

  it("reads the loudest moment of the test", () => {
    expect(levelVerdict(0.6)).toMatchObject({ ok: true, line: "Sounds clear." });
    expect(levelVerdict(0.12)).toMatchObject({ ok: true });
    expect(levelVerdict(0.12).line).toMatch(/quiet/i);
    expect(levelVerdict(0.01)).toMatchObject({ ok: false });
    expect(levelVerdict(0.01).line).toMatch(/can't hear/);
  });
});

const model = (id: string, state: SpeechModelStatus["state"], size_mb = 574): SpeechModelStatus => ({ id, name: id, size_mb, state });

describe("Speech", () => {
  const vad = (state: SpeechModelStatus["state"]) => model("vad", state, 2);

  it("counts a model that is already here as ready, whoever downloaded it", () => {
    expect(speechPlan([model("whisper-turbo", "ready")], vad("ready"))).toMatchObject({ kind: "ready", modelId: "whisper-turbo", fromOtherApp: false });
    expect(speechPlan([model("whisper-turbo", "on_this_computer")], vad("ready"))).toMatchObject({ kind: "ready", fromOtherApp: true });
  });

  it("uses the first model in Ensayo's order that is here", () => {
    const plan = speechPlan([model("whisper-turbo", "missing"), model("parakeet-ultra", "missing"), model("whisper-small", "ready", 190)], vad("ready"));
    expect(plan).toMatchObject({ kind: "ready", modelId: "whisper-small" });
  });

  it("offers the recommended model when none is here", () => {
    expect(speechPlan([model("whisper-turbo", "missing"), model("whisper-small", "missing", 190)], vad("missing"))).toMatchObject({ kind: "download", modelId: "whisper-turbo", sizeMb: 574, onlyVoiceDetection: false });
  });

  it("asks for the small voice detection piece alone when only that is missing", () => {
    const plan = speechPlan([model("whisper-turbo", "ready")], vad("missing"));
    expect(plan).toMatchObject({ kind: "download", modelId: "vad", onlyVoiceDetection: true, sizeMb: 2 });
  });

  it("does not wait on voice detection it could not read", () => {
    expect(speechPlan([model("whisper-turbo", "ready")], null)).toMatchObject({ kind: "ready" });
  });

  it("has no plan until the list is known", () => {
    expect(speechPlan([], null)).toBeNull();
  });

  it("says plainly when the download could not reach the internet", () => {
    const line = downloadErrorLine("Couldn't download ggml-large-v3-turbo-q5_0.bin: error sending request for url (https://huggingface.co/x): dns error");
    expect(line).toMatch(/internet/);
    expect(line).toMatch(/Skip|later/);
    expect(line).not.toContain("ggml");
    expect(line).not.toContain("!");
  });

  it("passes other plain messages through and never shows an empty one", () => {
    expect(downloadErrorLine("The download of x stopped: no data for 30 seconds. Check your connection and try again.")).toContain("no data for 30 seconds");
    expect(downloadErrorLine("Couldn't save the model: disk full")).toBe("Couldn't save the model: disk full");
    expect(downloadErrorLine("")).toMatch(/try again/i);
    expect(downloadErrorLine(new Error("The network sent a web page instead"))).toContain("web page");
  });
});

describe("Your first story", () => {
  const draft = (over: Partial<ReturnType<typeof emptyStory>> = {}, missing: string[] = [], dropped: string[] = []) => ({
    story: { ...emptyStory(), direct_answer: " I moved activation from 31 to 44 percent. ", headline: "7-day activation 31% → 44%", employer: "Fernhill", ...over },
    missing,
    dropped,
  });

  it("summarises what was found, from the draft and nothing else", () => {
    expect(foundSummary(draft())).toEqual({
      headline: "I moved activation from 31 to 44 percent.",
      proof: "7-day activation 31% → 44%",
      employer: "Fernhill",
      gap: "Nothing is missing. Every part is filled in.",
      footnote: "Nothing was added that isn't in your text.",
    });
  });

  it("names the first missing part in plain words", () => {
    expect(foundSummary(draft({}, ["approach", "ownership"])).gap).toMatch(/what you noticed/);
    expect(foundSummary(draft({}, ["scale", "result"])).gap).toMatch(/what changed|how big/);
    expect(foundSummary(draft({}, ["something_new"])).gap).toMatch(/Nothing is missing/);
  });

  it("says when details were left out", () => {
    expect(foundSummary(draft({}, [], ["a number"])).footnote).toMatch(/left out/);
  });

  it("uses no exclamation, em dash or scoring words in its lines", () => {
    const lines = ["approach", "ownership", "proof_points", "result", "scale"].map((m) => foundSummary(draft({}, [m])).gap);
    for (const l of [...lines, parseProblemLine("")]) {
      expect(l).not.toContain("!");
      expect(l).not.toContain("—");
      expect(l.toLowerCase()).not.toMatch(/star|caar|rubric|criterion|score|fail/);
    }
  });

  it("shows the backend's own sentence when a read fails, and a plain one when it gave none", () => {
    expect(parseProblemLine("Reading pasted text needs a feedback engine. Choose one in Settings › AI, or fill the story in yourself.")).toContain("needs a feedback engine");
    expect(parseProblemLine(new Error("Offline"))).toBe("Offline");
    expect(parseProblemLine("  ")).toMatch(/fill the story in yourself/);
  });
});
