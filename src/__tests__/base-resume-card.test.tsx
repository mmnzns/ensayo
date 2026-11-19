import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BaseResumeCard from "../components/BaseResumeCard";

const name = "Jordan_Rivera_Resume_Acme_Marketing_Operations_Final_v7.docx";
const html = renderToString(<BaseResumeCard fileName={name} onReplace={() => {}} onRemove={() => {}} />);

describe("the base resume card on a target", () => {
  it("cuts a long name on one line with an ellipsis and keeps the full name on hover", () => {
    expect(html).toContain("text-overflow:ellipsis");
    expect(html).toContain("white-space:nowrap");
    expect(html).toContain("overflow:hidden");
    expect(html).toContain(`title="${name}"`);
    expect(html).not.toContain("overflow-wrap:anywhere");
  });
  it("never shrinks Replace or Remove", () => {
    expect(html).toMatch(/<button[^>]*style="flex:none"[^>]*>Replace<\/button>/);
    expect(html).toMatch(/<button[^>]*style="flex:none"[^>]*>Remove<\/button>/);
  });
  it("wraps the row and gives the text column a real flex basis", () => {
    expect(html).toContain("flex-wrap:wrap");
    expect(html).toContain("flex:1 1 200px");
    expect(html).toContain("min-width:0");
  });
  it("is what the target editor uses", () => {
    const src = readFileSync("src/screens/settings/TargetEditor.tsx", "utf8");
    expect(src).toContain("<BaseResumeCard");
    expect(src).not.toMatch(/overflowWrap: "anywhere"/);
  });
});
