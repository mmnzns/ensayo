import { describe, expect, it } from "vitest";
import { editPiece, firstLine, foundLine, mergeNext, piecesFromFiles, piecesFromPaste, removePiece, splitAt, splitPaste, titleFromFileName } from "../screens/stories/bulkSplit";

describe("splitting a paste into stories", () => {
  it("splits at # headings", () => {
    const got = splitPaste("# Win back\nWe lost people.\n\n# Onboarding\nWe fixed it.");
    expect(got).toEqual(["# Win back\nWe lost people.", "# Onboarding\nWe fixed it."]);
  });

  it("uses ## headings when there is no # and keeps ### as sections inside a story", () => {
    const got = splitPaste("## One\n### Situation\nA\n### Result\nB\n## Two\nC");
    expect(got).toHaveLength(2);
    expect(got[0]).toContain("### Result");
  });

  it("uses the highest level: ## inside a # story do not split it", () => {
    const got = splitPaste("# One\n## Situation\nA\n# Two\nB");
    expect(got).toHaveLength(2);
    expect(got[0]).toContain("## Situation");
  });

  it("keeps text before the first heading as its own block", () => {
    expect(splitPaste("Some intro words\n# One\nA")).toHaveLength(2);
  });

  it("ignores # lines inside code fences", () => {
    expect(splitPaste("# One\n```\n# not a title\n```\nmore")).toHaveLength(1);
  });

  it("splits at lines of three or more dashes and drops the dashes", () => {
    const got = splitPaste("First story\nline\n---\nSecond story\n-----\nThird story");
    expect(got).toEqual(["First story\nline", "Second story", "Third story"]);
  });

  it("splits at two or more blank lines when there are no headings or dashes", () => {
    const got = splitPaste("First story\nstill first\n\n\nSecond story\n\nstill second\n\n\n\nThird");
    expect(got).toEqual(["First story\nstill first", "Second story\n\nstill second", "Third"]);
  });

  it("one blank line does not split", () => {
    expect(splitPaste("one\n\ntwo")).toHaveLength(1);
  });

  it("handles Windows line endings and drops empty blocks", () => {
    expect(splitPaste("---\r\n# A\r\nx\r\n---\r\n---\r\n# B\r\ny")).toHaveLength(2);
    expect(splitPaste("   \n\n\n  ")).toEqual([]);
  });

  it("gives every piece its own id", () => {
    const ids = piecesFromPaste("# A\nx\n# B\ny").map((p) => p.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("files", () => {
  it("makes one story per file whatever is inside, and skips empty files", () => {
    const got = piecesFromFiles([{ name: "a.md", text: "# One\n# Two" }, { name: "b.md", text: "  \n" }, { name: "c.txt", text: "plain" }]);
    expect(got.map((p) => p.source)).toEqual(["a.md", "c.txt"]);
    expect(got[0].text).toContain("# Two");
  });

  it("cleans a Notion file name", () => {
    expect(titleFromFileName("Win back emails 0123456789abcdef0123456789abcdef.md")).toBe("Win back emails");
    expect(titleFromFileName("Plain.txt")).toBe("Plain");
  });
});

describe("editing the split", () => {
  const base = piecesFromPaste("# A\none two\n# B\nthree four\n# C\nfive six");
  it("joins a piece with the next", () => {
    const got = mergeNext(base, 0);
    expect(got).toHaveLength(2);
    expect(got[0].text).toContain("# B");
    expect(mergeNext(base, 2)).toBe(base);
  });
  it("cuts a piece in two where asked", () => {
    const text = base[1].text;
    const got = splitAt(base, 1, text.indexOf("three"));
    expect(got).toHaveLength(4);
    expect(got[1].text).toBe("# B");
    expect(got[2].text).toBe("three four");
    expect(got[1].id).not.toBe(got[2].id);
  });
  it("does not cut at the very start or end", () => {
    expect(splitAt(base, 0, 0)).toBe(base);
    expect(splitAt(base, 0, base[0].text.length)).toBe(base);
  });
  it("removes and edits", () => {
    expect(removePiece(base, 1).map((p) => p.text[2])).toEqual(["A", "C"]);
    expect(editPiece(base, 0, "new")[0].text).toBe("new");
  });
});

describe("the lines shown", () => {
  it("names a story by its first line without marks", () => {
    expect(firstLine("\n## **Win back** series\nbody")).toBe("Win back series");
    expect(firstLine("- a bullet")).toBe("a bullet");
    expect(firstLine("x".repeat(100)).length).toBeLessThanOrEqual(80);
  });
  it("counts", () => {
    expect(foundLine(12)).toBe("We found 12 stories");
    expect(foundLine(1)).toBe("We found 1 story");
  });
});
