import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BackupSection from "../screens/settings/BackupSection";

describe("Settings, Backup in the browser preview", () => {
  it("explains what is and is not included, and hides the buttons", () => {
    const html = renderToString(<BackupSection />);
    expect(html).toContain("Recordings, speech models and saved keys are not included.");
    expect(html).toContain("Backup works in the Ensayo app.");
    expect(html).not.toContain("Back up now");
    expect(html).not.toContain("Restore from a backup");
    expect(html).not.toContain("—");
  });
});
