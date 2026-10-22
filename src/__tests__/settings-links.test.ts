import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Link from "../ui/Link";
import { externalClick, isExternal } from "../ui/openExternal";

describe("external links", () => {
  it("knows web and email addresses from screen ids", () => {
    expect(isExternal("https://buymeacoffee.com/mnmnzns")).toBe(true);
    expect(isExternal("mailto:miguel@mnmonzones.com?subject=Hi")).toBe(true);
    expect(isExternal("8-1-settings-profile")).toBe(false);
  });

  it("opens through the system in the app, and stops the dead anchor click", async () => {
    const open = vi.fn().mockResolvedValue(undefined);
    const preventDefault = vi.fn();
    externalClick("https://example.com", true, open)?.({ preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith("https://example.com");
  });

  it("leaves the plain anchor alone in the browser and for screen links", () => {
    expect(externalClick("https://example.com", false)).toBeUndefined();
    expect(externalClick("8-1-settings-profile", true)).toBeUndefined();
  });

  it("does not throw when the system cannot open it", async () => {
    const open = vi.fn().mockRejectedValue(new Error("no"));
    expect(() => externalClick("mailto:a@b.co", true, open)?.({ preventDefault() {} })).not.toThrow();
    await Promise.resolve();
  });

  it("still draws a normal anchor in the browser", () => {
    const web = renderToStaticMarkup(createElement(Link, { to: "https://example.com" }, "Out"));
    expect(web).toContain('href="https://example.com"');
    expect(web).toContain('target="_blank"');
    expect(renderToStaticMarkup(createElement(Link, { to: "mailto:a@b.co" }, "Mail"))).toContain('href="mailto:a@b.co"');
  });
});
