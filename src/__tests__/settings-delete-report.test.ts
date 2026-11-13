import { describe, expect, it } from "vitest";
import { leftBehindLine } from "../screens/settings/privacy";

describe("what Delete all Ensayo data says it left behind", () => {
  it("says nothing when everything went", () => {
    expect(leftBehindLine({ left_behind: [] })).toBeNull();
    expect(leftBehindLine(undefined)).toBeNull();
    expect(leftBehindLine(null)).toBeNull();
  });

  it("names what is still there, with no em dash", () => {
    const line = leftBehindLine({ left_behind: ["Recordings", "The saved claude key"] }) ?? "";
    expect(line).toContain("Recordings, The saved claude key");
    expect(line).not.toContain("—");
  });
});
