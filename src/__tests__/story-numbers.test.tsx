import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Numbers, { type NumberRow } from "../screens/stories/Numbers";

const noop = () => {};
const count = (html: string, s: string) => html.split(s).length - 1;

describe("Story numbers", () => {
  it("shows an empty row to type into when there are no numbers yet, with nothing to remove", () => {
    const html = renderToString(<Numbers rows={[]} setRows={noop} />);
    expect(count(html, 'aria-label="What the number is"')).toBe(1);
    expect(count(html, 'aria-label="The number"')).toBe(1);
    expect(html).not.toContain("Remove this number");
    expect(html).toContain("+ Add a number");
  });

  it("gives every row an X to take it out", () => {
    const rows: NumberRow[] = [
      { id: "signups", label: "signups processed per day", value: "~300", checked: false },
      { id: "new1", label: "", value: "", checked: false, isNew: true },
    ];
    const html = renderToString(<Numbers rows={rows} setRows={noop} />);
    expect(count(html, 'aria-label="Remove this number"')).toBe(2);
    expect(count(html, 'aria-label="What the number is"')).toBe(1);
  });
});
