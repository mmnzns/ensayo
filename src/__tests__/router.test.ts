import { describe, expect, it } from "vitest";
import { hrefFor, parseRoute } from "../ui/router";

describe("router", () => {
  it("reads the screen id from the hash", () => {
    expect(parseRoute("#/5-1-stories")).toBe("5-1-stories");
    expect(parseRoute("#/m0")).toBe("m0");
  });

  it("treats an empty or malformed hash as home", () => {
    for (const h of ["", "#", "#/", "#/%%"]) expect(parseRoute(h)).toBe("");
  });

  it("builds hrefs the same way it reads them", () => {
    expect(hrefFor("6-1-applications")).toBe("#/6-1-applications");
    expect(parseRoute(hrefFor("3-4-result-attempt-1-details-open"))).toBe("3-4-result-attempt-1-details-open");
  });

  it("ignores a query string and trailing slash", () => {
    expect(parseRoute("#/2-1-home/?x=1")).toBe("2-1-home");
  });
});
