import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../styles/ensayo.css", import.meta.url), "utf8").toLowerCase();

describe("ensayo.css", () => {
  it("keeps the light palette from the design", () => {
    for (const c of ["#f6f6f7", "#b8432c", "#2b2722", "#fceee6"]) expect(css).toContain(c);
  });

  it("has a dark palette for auto and forced themes", () => {
    expect(css).toContain("prefers-color-scheme: dark");
    expect(css).toContain('[data-theme="dark"]');
    expect(css).toContain('[data-theme="light"]');
  });

  it("loads nothing from the internet", () => {
    expect(css).not.toContain("http");
    expect(css).not.toContain("@import url");
  });
});
