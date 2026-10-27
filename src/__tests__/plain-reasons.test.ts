// Every verdict, count or status says what it is based on, or what to do next. These are the lines that used to be vague.
import { describe, expect, it } from "vitest";
import { TIMING_ONLY_MISSING } from "../data/engine";
import { HABIT_MEASURE } from "../practice/habits";
import { notAnAnswerNotice } from "../practice/live";
import { matchText, MATCH_LABEL } from "../screens/applications/format";
import { FOCUS_HINT, followUpHint } from "../screens/home/state";
import { judgeLines } from "../screens/practice/PracticeThinking";
import { WRONG_SAVED } from "../screens/practice/Result";
import { CAP_HINT } from "../screens/settings/SettingsAi";
import { passText } from "../screens/settings/ProgressHabits";

describe("who judges the answer, while it is being read", () => {
  it("names the provider and the key, the local AI on this computer, or timing only", () => {
    expect(judgeLines({ label: "Claude Sonnet 5.5", kind: "key", offline: false }, true)).toEqual({
      step: "Picking the one thing to fix",
      where: "Claude Sonnet 5.5 with your key",
      footer: "Your audio stays on this computer. Only the text goes to Claude Sonnet 5.5.",
    });
    expect(judgeLines({ label: "Built-in model", kind: "local", offline: false }, true).where).toBe("Built-in model, on this computer");
    expect(judgeLines({ label: "Timing only", kind: "timing", offline: false }, false)).toMatchObject({ step: "Picking the fix from timing only", where: "No AI engine set up, so no AI picks a fix" });
    expect(judgeLines({ label: "Claude Sonnet 5.5", kind: "key", offline: false }, false).where).toContain("so no AI picks a fix");
    expect(judgeLines({ label: "Claude Sonnet 5.5", kind: "key", offline: true }, true).where).toContain("offline");
  });
});

describe("an answer that was not an answer", () => {
  it("quotes the first dozen words heard and says what an answer needs", () => {
    const line = notAnAnswerNotice("so um I was thinking about the weather today and also my lunch plans and then some more");
    expect(line).toContain('Heard: "so um I was thinking about the weather today and also my..."');
    expect(line).toContain("say your answer first");
    expect(notAnAnswerNotice(null)).not.toContain("Heard");
  });
});

describe("claim statuses name what they were compared with", () => {
  it("says where else it was said, or that there is nothing to compare yet", () => {
    expect(matchText("consistent", ["Resume", "Recruiter call", "Recruiter call"])).toBe("Same in the Resume and Recruiter call");
    expect(matchText("said_once", ["Recruiter call"])).toBe("Said once, in the Recruiter call. Nothing to compare yet");
    expect(matchText("said_once", [])).toBe("Said once, nothing to compare yet");
    expect(MATCH_LABEL.differs).toBe("Differs from your stories");
  });
});

describe("settings and start lines say what a switch changes", () => {
  it("follow-ups say when they come, and that they need an AI engine", () => {
    expect(followUpHint("timing", false)).toContain("need an AI engine");
    expect(followUpHint("key", false)).toContain("After each answer");
    expect(followUpHint("local", true)).toContain("up to 2 follow-ups");
  });

  it("the focus and the spending cap say what they change and what is lost", () => {
    expect(FOCUS_HINT).toContain("doesn't change which fix");
    expect(CAP_HINT).toContain("no coach note");
    expect(CAP_HINT).toContain("Try saying");
  });
});

describe("progress counts", () => {
  it("shows passes out of answers, and no answers is not 0%", () => {
    expect(passText([true, false, true])).toBe("2 of 3");
    expect(passText([])).toBe("No answers yet");
    expect(passText(undefined)).toBe("No answers yet");
  });

  it("defines every habit by what a pass means", () => {
    expect(Object.values(HABIT_MEASURE).every((l) => l.startsWith("Passes "))).toBe(true);
  });
});

describe("house style", () => {
  it("has no em dashes in these lines", () => {
    for (const line of [TIMING_ONLY_MISSING, WRONG_SAVED, CAP_HINT, FOCUS_HINT, followUpHint("timing", false), ...Object.values(HABIT_MEASURE), ...Object.values(MATCH_LABEL)]) expect(line).not.toContain("—");
  });

  it("says what marking a note wrong does", () => {
    expect(WRONG_SAVED).toContain("Your progress still counts it");
    expect(TIMING_ONLY_MISSING).toContain("whether you answered the question first");
  });
});
