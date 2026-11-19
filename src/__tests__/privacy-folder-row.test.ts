import { describe, expect, it } from "vitest";
import { readSource } from "./helpers/readSource";

describe("the data folder row in Privacy settings", () => {
  const src = readSource("src/screens/settings/SettingsPrivacy.tsx");
  it("gives the text column a real basis and keeps Show and Move from shrinking", () => {
    expect(src).toMatch(/flex: "1 1 220px",\s*display: "flex",\s*flexDirection: "column",\s*gap: "2px",\s*minWidth: "0"\s*\}\}>\s*Data folder/);
    expect(src).toMatch(/<div style=\{\{ display: "flex", gap: "8px", flex: "none" \}\}>\s*<button[\s\S]*?>Show</);
  });
});
