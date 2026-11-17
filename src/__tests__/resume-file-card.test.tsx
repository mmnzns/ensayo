import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ResumeFileCard from "../components/ResumeFileCard";

describe("the resume file card on New application", () => {
  const name = "MiguelMonzones_Resume_Anatta_Marketing_Operations_Final_v7.docx";
  const html = renderToString(<ResumeFileCard fileName={name} pages={2} onReplace={() => {}} />);

  it("lets the name column shrink and cuts a long name with an ellipsis", () => {
    expect(html).toContain("min-width:0");
    expect(html).toContain("text-overflow:ellipsis");
    expect(html).toContain("white-space:nowrap");
    expect(html).toContain("overflow:hidden");
  });

  it("keeps the full name on hover", () => {
    expect(html).toContain(`title="${name}"`);
  });

  it("never shrinks the Replace button", () => {
    expect(html).toMatch(/<button[^>]*style="flex:none"[^>]*>Replace<\/button>/);
  });

  it("shows the type badge and pages", () => {
    expect(html).toContain("DOC");
    expect(html).toContain("2 pages");
    expect(renderToString(<ResumeFileCard fileName="cv.PDF" pages={null} onReplace={() => {}} />)).toContain("PDF");
  });
});
