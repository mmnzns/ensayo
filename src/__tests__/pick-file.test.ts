import { beforeEach, describe, expect, it, vi } from "vitest";

const open = vi.fn();
let broken = false;
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (o: unknown) => {
    if (broken) throw new Error("no dialog");
    return open(o);
  },
}));

import { pickFolder, pickResumePath, RESUME_FILTER } from "../ui/pickFile";

beforeEach(() => {
  open.mockReset();
  broken = false;
});

describe("the system file picker", () => {
  it("asks for one PDF or Word file and returns its path", async () => {
    open.mockResolvedValue("/Users/me/Resume.pdf");
    expect(await pickResumePath()).toBe("/Users/me/Resume.pdf");
    expect(open).toHaveBeenCalledWith({ multiple: false, directory: false, filters: [RESUME_FILTER], title: "Choose your resume" });
    expect(RESUME_FILTER.extensions).toEqual(["pdf", "doc", "docx"]);
  });
  it("asks for one folder", async () => {
    open.mockResolvedValue("/Users/me/Drive/Ensayo");
    expect(await pickFolder()).toBe("/Users/me/Drive/Ensayo");
    expect(open).toHaveBeenCalledWith({ multiple: false, directory: true, title: "Choose the data folder" });
  });
  it("returns null when the person cancels, and when the picker is not there", async () => {
    open.mockResolvedValue(null);
    expect(await pickResumePath()).toBeNull();
    broken = true;
    await expect(pickFolder()).resolves.toBeNull();
  });
});
