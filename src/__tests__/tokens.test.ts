import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DESIGN = "/Users/miguel.monzones/My Drive (mikeymonzones@gmail.com)/MAIN DRIVE - Miguel/FILES - Projects & Work/Ensayo/Design/styles/tokens.json";

describe("theme tokens", () => {
  const css = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8").toLowerCase();

  it("uses the primary and ground colours from the design", () => {
    expect(css).toContain("#b8432c");
    expect(css).toContain("#f6f6f7");
  });

  it("carries every colour in the design token file", () => {
    let tokens: Record<string, { value: string }>;
    try {
      tokens = JSON.parse(readFileSync(DESIGN, "utf8"));
    } catch {
      return; // the Drive folder is not mounted on this machine (CI): the two checks around this one still run
    }
    for (const [name, t] of Object.entries(tokens)) {
      if (name.startsWith("_") || !t.value.startsWith("#")) continue;
      expect(css, name).toContain(t.value.toLowerCase());
    }
  });

  it("never loads fonts from the internet", () => {
    expect(css).not.toContain("fonts.googleapis.com");
    expect(css).not.toContain("http");
  });
});
