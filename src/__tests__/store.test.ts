import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import { applicationsByTab, daysUntil, greeting, habitStatus, nextInterview, storyGaps } from "../data/store";

describe("mock store", () => {
  const s = mockStore;

  it("has a profile, a focus habit and every habit defined", () => {
    expect(s.profile.name).toBeTruthy();
    expect(s.profile.focusHabits.length).toBeGreaterThan(0);
    expect(s.habits.map((h) => h.id)).toEqual(["to_the_point", "clean_stop", "numbers", "ownership", "why_first", "method_first", "conviction", "fillers"]);
    for (const id of s.profile.focusHabits) expect(s.habits.find((h) => h.id === id)).toBeTruthy();
  });

  it("picks the earliest upcoming stage as the next interview", () => {
    const n = nextInterview(s.applications, new Date("2026-10-21T20:00:00"));
    expect(n?.application.company).toBe("Kestrel Pay");
    expect(n?.stage.stage).toBe("hiring_manager");
  });

  it("skips closed applications and stages without a date when picking the next interview", () => {
    const apps = s.applications.map((a) => ({ ...a, status: "closed" as const }));
    expect(nextInterview(apps, new Date("2026-10-21T20:00:00"))).toBeUndefined();
  });

  it("splits applications into active and closed", () => {
    const { active, closed } = applicationsByTab(s.applications);
    expect(active.length).toBe(5);
    expect(closed.length).toBe(3);
    expect(active.every((a) => a.status !== "closed")).toBe(true);
    expect(closed.every((a) => a.status === "closed")).toBe(true);
  });

  it("sorts active applications by next interview date, then most recent", () => {
    const { active } = applicationsByTab(s.applications);
    expect(active[0].company).toBe("Kestrel Pay");
    expect(active[1].company).toBe("Harbourline Bank");
  });

  it("flags story gaps in plain words", () => {
    const base = s.stories[0];
    expect(storyGaps(base)).toEqual([]);
    const gaps = storyGaps({ ...base, approach: "", proof_points: [] });
    expect(gaps).toContain("No strategy yet");
    expect(gaps).toContain("No number");
    expect(storyGaps({ ...base, proof_points: [{ ...base.proof_points[0], verified: false }] })).toContain("Numbers not checked");
  });

  it("has the six stories and six methods the design shows", () => {
    expect(s.stories.length).toBe(6);
    expect(s.methods.map((m) => m.situation)).toEqual(["problem_solving", "disagreement", "influence", "serving_customers", "leading_team", "motivation"]);
  });

  it("reports a habit as graduated at 8 of the last 10", () => {
    const eight = [true, true, true, true, true, true, true, true, false, false];
    expect(habitStatus(eight)).toEqual({ passes: 8, of: 10, graduated: true, trend: true });
    expect(habitStatus([true, true, true, true, true, true, true, false, false, false]).graduated).toBe(false);
  });

  it("shows no trend before 5 reps and never graduates early", () => {
    expect(habitStatus([true, false, true]).trend).toBe(false);
    expect(habitStatus([true, true, true, true, true, true, true, true]).graduated).toBe(false);
  });

  it("counts whole days until a date, by calendar day", () => {
    expect(daysUntil(new Date("2026-10-23T14:00:00"), new Date("2026-10-21T22:00:00"))).toBe(2);
    expect(daysUntil(new Date("2026-10-21T23:00:00"), new Date("2026-10-21T01:00:00"))).toBe(0);
  });

  it("greets by the hour", () => {
    expect(greeting(new Date("2026-10-21T08:00:00"))).toBe("Good morning");
    expect(greeting(new Date("2026-10-21T14:00:00"))).toBe("Good afternoon");
    expect(greeting(new Date("2026-10-21T20:00:00"))).toBe("Good evening");
  });
});
