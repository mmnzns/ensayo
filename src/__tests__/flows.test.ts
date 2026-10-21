import { describe, expect, it } from "vitest";
import { nextQuestion, startFirstRep } from "../screens/practice/practiceFlow";

describe("cross-group flows", () => {
  it("ends the first run on the loop card, then shows the clarifying question once, then asks normally", () => {
    startFirstRep();
    expect(nextQuestion()).toBe("first-run-loop");
    expect(nextQuestion()).toBe("3-7-clarifying-question");
    expect(nextQuestion()).toBe("3-1-practice-interviewer-asking");
    expect(nextQuestion()).toBe("3-1-practice-interviewer-asking");
  });
});
