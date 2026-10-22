import { describe, expect, it } from "vitest";
import { hashParam, withParams } from "../data/selection";
import { parseRoute } from "../ui/router";

describe("which application a screen is about", () => {
  it("reads a parameter after the screen id", () => {
    expect(hashParam("#/6-3-application-overview?app=app_x&stage=stg_2", "app")).toBe("app_x");
    expect(hashParam("#/6-3-application-overview?app=app_x&stage=stg_2", "stage")).toBe("stg_2");
  });

  it("gives undefined when there is none, or it is empty", () => {
    expect(hashParam("#/6-3-application-overview", "app")).toBeUndefined();
    expect(hashParam("#/6-3-application-overview?app=", "app")).toBeUndefined();
    expect(hashParam("#/6-3-application-overview?stage=a", "app")).toBeUndefined();
    expect(hashParam("", "app")).toBeUndefined();
  });

  it("decodes what withParams encodes", () => {
    const to = withParams("6-3-application-overview", { app: "a b&c", stage: "stg_1" });
    expect(hashParam(`#/${to}`, "app")).toBe("a b&c");
    expect(hashParam(`#/${to}`, "stage")).toBe("stg_1");
  });

  it("leaves out empty values and the question mark with them", () => {
    expect(withParams("6-1-applications", {})).toBe("6-1-applications");
    expect(withParams("6-1-applications", { app: undefined, stage: null })).toBe("6-1-applications");
    expect(withParams("6-7-cue-sheet", { app: "x", stage: undefined })).toBe("6-7-cue-sheet?app=x");
  });

  it("does not disturb the route", () => {
    expect(parseRoute("#/6-3-application-overview?app=app_x")).toBe("6-3-application-overview");
  });

  it("survives a damaged escape", () => {
    expect(hashParam("#/x?app=%E0%A4%A", "app")).toBeUndefined();
  });
});
