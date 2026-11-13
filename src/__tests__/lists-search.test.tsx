import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { matchesAny, nothingMatches, searchApplications, searchSessions, searchStories, searchTerm } from "../screens/search";
import { NoMatch } from "../ui/SearchBox";
import type { SessionSummary, Story } from "../data/types";

const story = (o: Partial<Story>) => ({ id: "s", title: "", employer: "", competencies: [], ...o }) as Story;
const stories = [
  story({ id: "a", title: "Cut onboarding churn", employer: "Northwind", year: "2023", competencies: ["Ownership", "Data"] }),
  story({ id: "b", title: "Migrated billing", employer: "Contoso", year: "2021", competencies: ["Leadership"] }),
];

describe("matching", () => {
  it("ignores case and spaces around the search, and an empty search matches everything", () => {
    expect(matchesAny(["Northwind"], "  NORTH ")).toBe(true);
    expect(matchesAny(["Northwind"], "south")).toBe(false);
    expect(matchesAny([], "")).toBe(true);
    expect(matchesAny([undefined, null, 2023], "2023")).toBe(true);
    expect(searchTerm("  Hi ")).toBe("hi");
  });
});

describe("stories", () => {
  it("match on title, employer, year and competencies", () => {
    expect(searchStories(stories, "churn").map((s) => s.id)).toEqual(["a"]);
    expect(searchStories(stories, "CONTOSO").map((s) => s.id)).toEqual(["b"]);
    expect(searchStories(stories, "2021").map((s) => s.id)).toEqual(["b"]);
    expect(searchStories(stories, "ownership").map((s) => s.id)).toEqual(["a"]);
    expect(searchStories(stories, "").length).toBe(2);
    expect(searchStories(stories, "zzz")).toEqual([]);
  });
});

describe("applications", () => {
  it("match on company and role", () => {
    const apps = [
      { company: "Acme", role: "Product Manager" },
      { company: "Globex", role: "Designer" },
    ];
    expect(searchApplications(apps, "acme")).toEqual([apps[0]]);
    expect(searchApplications(apps, "DESIGN")).toEqual([apps[1]]);
    expect(searchApplications(apps, "engineer")).toEqual([]);
  });
});

describe("sessions", () => {
  const sessions = [
    { id: "x1", applicationId: "app1", title: "Drill" },
    { id: "x2", title: "Drill" },
  ] as SessionSummary[];
  const reps = [
    { session_id: "x1", stage: "hiring_manager", question_text: "Tell me about a time you led a migration" },
    { session_id: "x2", stage: "recruiter", question_text: "Why this company?" },
  ];
  const apps = [{ id: "app1", company: "Initech" }];
  it("match on question text, stage and the application's company", () => {
    expect(searchSessions(sessions, reps, apps, "migration").map((s) => s.id)).toEqual(["x1"]);
    expect(searchSessions(sessions, reps, apps, "recruiter").map((s) => s.id)).toEqual(["x2"]);
    expect(searchSessions(sessions, reps, apps, "Hiring manager").map((s) => s.id)).toEqual(["x1"]);
    expect(searchSessions(sessions, reps, apps, "initech").map((s) => s.id)).toEqual(["x1"]);
    expect(searchSessions(sessions, reps, apps, "nope")).toEqual([]);
    expect(searchSessions(sessions, reps, apps, "")).toBe(sessions);
  });
});

describe("an empty result", () => {
  it("says what was searched and offers Clear", () => {
    expect(nothingMatches(" zzz ")).toBe("Nothing matches “zzz”.");
    const html = renderToString(<NoMatch query="zzz" onClear={() => {}} />);
    expect(html).toContain("Nothing matches “zzz”.");
    expect(html).toContain("Clear");
    expect(html).not.toContain("—");
  });
});
