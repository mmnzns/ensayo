import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("the data folder row in Privacy settings", () => {
  const src = readFileSync("src/screens/settings/SettingsPrivacy.tsx", "utf8");
  it("gives the text column a real basis and keeps Show and Move from shrinking", () => {
    expect(src).toContain('flex: "1 1 220px", display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>\n              Data folder');
    expect(src).toMatch(/<div style=\{\{ display: "flex", gap: "8px", flex: "none" \}\}>\s*<button[\s\S]*?>Show</);
  });
});
