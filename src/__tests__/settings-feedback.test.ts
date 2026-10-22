import { describe, expect, it } from "vitest";
import { buildFeedbackEmail, describeSystem, fitMailto, FEEDBACK_ADDRESS, MAILTO_LIMIT } from "../screens/settings/feedbackEmail";

const base = { topic: "An idea", message: "Let me practice one follow-up on its own.", pay: null, fair: null, email: "", includeSystem: false, system: "Ensayo 0.1.0 · macOS" };

describe("feedback email", () => {
  it("builds a mailto link to the feedback address with an encoded subject and body", () => {
    const m = buildFeedbackEmail(base);
    expect(m.subject).toBe("Ensayo feedback: An idea");
    expect(m.mailto.startsWith(`mailto:${FEEDBACK_ADDRESS}?subject=`)).toBe(true);
    const url = new URL(m.mailto);
    expect(url.searchParams.get("subject")).toBe(m.subject);
    expect(url.searchParams.get("body")).toBe(m.body);
    expect(m.mailto).not.toContain(" ");
  });

  it("keeps awkward characters intact through the encoding", () => {
    const message = "It broke & I lost 50% of my answer?\nSecond line, with a #hash";
    const m = buildFeedbackEmail({ ...base, message });
    expect(new URL(m.mailto).searchParams.get("body")).toBe(message);
  });

  it("adds the version and system only when ticked", () => {
    expect(buildFeedbackEmail(base).body).not.toContain("Ensayo 0.1.0");
    expect(buildFeedbackEmail({ ...base, includeSystem: true }).body).toContain("Ensayo 0.1.0 · macOS");
  });

  it("adds the pay answer, and the fair price only for Maybe or Yes", () => {
    expect(buildFeedbackEmail(base).body).not.toContain("pay");
    expect(buildFeedbackEmail({ ...base, pay: "No", fair: "$10 to $25" }).body).toContain("Would I pay: No");
    expect(buildFeedbackEmail({ ...base, pay: "No", fair: "$10 to $25" }).body).not.toContain("$10");
    expect(buildFeedbackEmail({ ...base, pay: "Maybe", fair: "$10 to $25" }).body).toContain("Would I pay: Maybe (fair, one time: $10 to $25)");
  });

  it("adds the reply address when one is given", () => {
    expect(buildFeedbackEmail({ ...base, email: " dana@example.com " }).body).toContain("Reply to: dana@example.com");
  });

  it("reads the system from a user agent", () => {
    expect(describeSystem("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("macOS");
    expect(describeSystem("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Windows");
  });
});

import { retentionChoice, retentionLabel } from "../screens/settings/privacy";

describe("recording retention labels", () => {
  it("maps what the backend stores to the list and back", () => {
    for (const [label, choice] of [["7 days", "7"], ["30 days", "30"], ["90 days", "90"], ["Forever", "forever"], ["Don't keep", "none"]]) {
      expect(retentionChoice(label)).toBe(choice);
      expect(retentionLabel(choice)).toBe(label);
    }
    expect(retentionLabel("garbage")).toBe("30 days");
    expect(retentionChoice("garbage")).toBe("30");
  });
});

describe("a long message in the email link", () => {
  const long = "I ran into a problem with the timer. ".repeat(120);

  it("leaves a short message alone", () => {
    const m = buildFeedbackEmail({ ...base, message: "Short and sweet." });
    expect(fitMailto(m)).toEqual({ mailto: m.mailto, cut: false });
  });

  it("cuts a long one to fit an email link, keeping the start and saying so", () => {
    const m = buildFeedbackEmail({ ...base, message: long });
    const fit = fitMailto(m);
    expect(m.mailto.length).toBeGreaterThan(MAILTO_LIMIT);
    expect(fit.cut).toBe(true);
    expect(fit.mailto.length).toBeLessThanOrEqual(MAILTO_LIMIT);
    const body = new URL(fit.mailto).searchParams.get("body") ?? "";
    expect(body.startsWith("I ran into a problem")).toBe(true);
    expect(body).toMatch(/Copy message/);
    expect(new URL(fit.mailto).searchParams.get("subject")).toBe(m.subject);
  });

  it("never cuts in the middle of an encoded character", () => {
    const m = buildFeedbackEmail({ ...base, message: "é".repeat(2000) });
    const fit = fitMailto(m);
    expect(() => decodeURIComponent(fit.mailto.split("body=")[1])).not.toThrow();
  });
});
