import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import StageRow, { uniqueStageLabel } from "../components/StageRow";

const row = (label: string, extra: Partial<Parameters<typeof StageRow>[0]> = {}) =>
  renderToString(<StageRow name={<span>{label}</span>} label={label} date="" time="" onDate={() => {}} onTime={() => {}} onUp={() => {}} onDown={() => {}} onRemove={() => {}} {...extra} />);

describe("an interview stage row in a narrow card", () => {
  it("puts date, time and remove on a second line under the name", () => {
    const html = row("Technical");
    const nameAt = html.indexOf("Technical</span>");
    expect(html.indexOf('aria-label="Technical date"')).toBeGreaterThan(nameAt);
    expect(html.indexOf('aria-label="Technical time"')).toBeGreaterThan(html.indexOf('aria-label="Technical date"'));
    expect(html.indexOf('aria-label="Remove Technical"')).toBeGreaterThan(html.indexOf('aria-label="Technical time"'));
    // The first line is the arrows and the name; the date line is a separate wrapping row.
    expect(html).toContain("flex-direction:column");
    expect(html).toContain("flex-wrap:wrap");
  });

  it("has nothing with a fixed width wider than the card", () => {
    const html = row("Panel");
    expect(html).not.toMatch(/[^-]width:1[0-9]{2}px/);
    expect(html).not.toContain("150px");
    expect(html).toContain("min-width:0");
    expect(html).toContain("flex:1 1 118px");
  });

  it("gives every row the same date and time boxes, so they line up", () => {
    const grab = (h: string) => [...h.matchAll(/<input type="(?:date|time)"[^>]*style="([^"]*)"/g)].map((m) => m[1]);
    expect(grab(row("Panel"))).toEqual(grab(row("A much longer stage name that wraps onto two lines")));
  });

  it("disables the arrows at the ends and drops the divider on the last row", () => {
    const html = row("Panel", { onUp: null, onDown: null, last: true });
    expect(html.match(/disabled=""/g)?.length).toBe(2);
    expect(html).toContain("border-bottom:none");
  });

  it("shows a note under the boxes", () => {
    expect(row("Panel", { note: <span>Moved from Oct 3.</span> })).toContain("Moved from Oct 3.");
  });
});

describe("naming a stage added to the list", () => {
  it("keeps the plain name for the first of a kind", () => {
    expect(uniqueStageLabel("technical", ["Recruiter call", "Panel"])).toBe("Technical");
  });
  it("numbers the second and third", () => {
    expect(uniqueStageLabel("technical", ["Technical"])).toBe("Technical 2");
    expect(uniqueStageLabel("technical", ["Technical", "Technical 2"])).toBe("Technical 3");
    expect(uniqueStageLabel("panel", ["panel"])).toBe("Panel 2");
  });
  it("fills a gap and ignores case and spaces", () => {
    expect(uniqueStageLabel("technical", [" technical ", "Technical 3"])).toBe("Technical 2");
  });
});
