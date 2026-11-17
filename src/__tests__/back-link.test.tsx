import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BackLink from "../components/BackLink";

describe("the shared back link", () => {
  it("reads Back to Stories and links to the Stories screen", () => {
    const html = renderToString(<BackLink to="5-1-stories" label="Stories" />);
    expect(html).toContain("Back to <!-- -->Stories");
    expect(html).toContain("←");
    expect(html).toMatch(/href="[^"]*5-1-stories"/);
    expect(html).toContain('class="e-back"');
  });

  it("keeps the full name on hover for a long company", () => {
    const html = renderToString(<BackLink to="6-3-application" label="A Very Long Company Name Incorporated" />);
    expect(html).toContain('title="Back to A Very Long Company Name Incorporated"');
  });
});
