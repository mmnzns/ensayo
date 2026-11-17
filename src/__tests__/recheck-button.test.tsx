import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecheckButton } from "../screens/applications/RecheckButton";

describe("the Recheck button", () => {
  it("says Recheck with the circling arrows", () => {
    const html = renderToString(<RecheckButton busy={false} onClick={() => {}} />);
    expect(html).toContain("Recheck");
    expect(html).toContain('data-icon="recheck"');
    expect(html).not.toContain("disabled");
    expect(html).not.toContain("—");
  });

  it("says Rechecking and cannot be pressed while it runs", () => {
    const html = renderToString(<RecheckButton busy onClick={() => {}} />);
    expect(html).toContain("Rechecking");
    expect(html).toContain("disabled");
  });
});
