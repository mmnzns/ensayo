import { describe, expect, it } from "vitest";
import { deleteFailedLine, folderChangedLine, folderPathProblem, folderProblemLine, leavesRows } from "../screens/settings/privacy";

describe("choosing a new data folder", () => {
  it("asks for a path before anything is sent", () => {
    expect(folderPathProblem("")).toMatch(/folder/i);
    expect(folderPathProblem("   ")).toMatch(/folder/i);
  });

  it("only takes a full path, from the Mac or from Windows", () => {
    expect(folderPathProblem("Documents/Ensayo")).toMatch(/full path/i);
    expect(folderPathProblem("/Users/sam/Drive/Ensayo")).toBeNull();
    expect(folderPathProblem("  C:\\Users\\Sam\\Drive\\Ensayo ")).toBeNull();
    expect(folderPathProblem("\\\\server\\share\\Ensayo")).toBeNull();
  });

  it("takes a path from Windows' Copy as path, quotes and all", () => {
    expect(folderPathProblem('"C:\\Users\\Sam\\My Drive (sam@example.com)\\Projects & Work\\Ensayo"')).toBeNull();
  });

  it("says what happened in plain words", () => {
    expect(folderChangedLine("copied")).toMatch(/copied/);
    expect(folderChangedLine("copied")).toMatch(/old/i);
    expect(folderChangedLine("existing")).toMatch(/already/);
  });

  it("shows the backend's own sentence when it gives one", () => {
    expect(folderProblemLine("That folder already has other files in it.")).toBe("That folder already has other files in it.");
    expect(folderProblemLine(new Error("The data folder isn't available: /x"))).toBe("The data folder isn't available: /x");
    expect(folderProblemLine("")).toMatch(/didn't change/);
  });

  it("words a failed delete without alarm", () => {
    expect(deleteFailedLine("Couldn't remove /x: busy")).toContain("Couldn't remove");
    expect(deleteFailedLine("")).toMatch(/try again/i);
  });

  it("keeps all the copy free of exclamation marks and em dashes", () => {
    const lines = [folderPathProblem("") ?? "", folderPathProblem("a/b") ?? "", folderChangedLine("copied"), folderChangedLine("existing"), folderProblemLine(""), deleteFailedLine("")];
    for (const l of lines) {
      expect(l).not.toMatch(/!/);
      expect(l).not.toMatch(/—/);
    }
  });
});

describe("what leaves this computer", () => {
  it("names the speech model that runs here", () => {
    const rows = leavesRows({ speech: "Parakeet", speechLocal: true, ai: "local", provider: "", assistant: "the local model" });
    expect(rows[0].detail).toContain("Parakeet runs here");
    expect(rows.filter((r) => !r.stays).map((r) => r.title)).toEqual(["Feedback you send"]);
  });
});
