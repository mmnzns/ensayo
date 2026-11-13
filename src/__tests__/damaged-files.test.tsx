import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DamagedFilesBanner, damagedFileLine } from "../data/damagedFiles";

describe("the banner for a data file that could not be read", () => {
  it("names the file only, with no folder and no em dash", () => {
    const line = damagedFileLine({ name: "you.json", path: "/Users/someone/Drive/Ensayo/you.json" });
    expect(line).toContain("you.json");
    expect(line).not.toContain("/Users");
    expect(line).not.toContain("—");
  });

  it("shows nothing when every file loaded", () => {
    expect(renderToStaticMarkup(<DamagedFilesBanner files={[]} />)).toBe("");
  });

  it("has a Show file button for each damaged file and keeps the path out of the text", () => {
    const html = renderToStaticMarkup(<DamagedFilesBanner files={[{ name: "you.json", path: "/private/folder/you.json" }, { name: "influence.json", path: "/private/folder/bank/methods/influence.json" }]} reveal={vi.fn()} />);
    expect(html.match(/Show file/g)).toHaveLength(2);
    expect(html).toContain("you.json");
    expect(html).toContain("influence.json");
    expect(html).not.toContain("/private/folder");
    expect(html).toContain('role="alert"');
  });
});
