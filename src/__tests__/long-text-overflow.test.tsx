import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TargetLabel } from "../screens/applications/TargetMark";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("long user text stays inside its card", () => {
  it("cuts a long target name with an ellipsis and keeps it in the title", () => {
    const name = "A very long target name that keeps going well past the edge of any card";
    const html = renderToString(<TargetLabel target={{ name, color: "blue" } as never} />);
    expect(html).toContain(`title="${name}"`);
    expect(html).toContain("text-overflow:ellipsis");
    expect(html).toContain("min-width:0");
  });

  it("styles the shared text classes to wrap anywhere, and badges to stay inside their parent", () => {
    const css = read("../styles/ensayo.css");
    expect(css).toMatch(/\.e-h3[^{]*\{overflow-wrap:anywhere\}/);
    expect(css).toMatch(/\.e-badge\{max-width:100%;min-width:0/);
  });

  it("gives the resume page file name an ellipsis, a title and buttons that never shrink", () => {
    const src = read("../screens/applications/ApplicationTheResumeYouSent.tsx");
    expect(src).toMatch(/title=\{resume\.fileName\}[^>]*textOverflow: "ellipsis"/);
    expect(src).toMatch(/style=\{\{ flex: "none" \}\} disabled=\{fileRun\.busy\} onClick=\{\(\) => void open\(\)\}>Open/);
    expect(src).toMatch(/style=\{\{ flex: "none" \}\} disabled=\{fileRun\.busy\} onClick=\{\(\) => setChooser\(true\)\}>Replace/);
  });

  it("lets the application tabs row wrap inside the page", () => {
    const src = read("../screens/applications/parts.tsx");
    expect(src).toMatch(/flexWrap: "wrap"[^>]*maxWidth: "100%"[^>]*aria-label="Application sections"/);
  });

  it("cuts a story card's employer with an ellipsis and a title", () => {
    const src = read("../screens/stories/Stories.tsx");
    expect(src).toMatch(/title=\{s\.employer\}[^>]*textOverflow: "ellipsis"/);
  });
});
