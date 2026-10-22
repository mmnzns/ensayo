import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import { StoreProvider, type Store } from "../data/store";
import { TrashContext } from "../data/real";
import { answersIn, deletePracticeText, deleteSessionText, GONE_LINE, keptUntil, KEEP_DAYS, liveBlock, LIVE_BLOCK, NO_LONGER_HERE, previewRestore, previewTrash, recentlyDeletedLine, restoreHint, trashedTitle, type TrashedSession } from "../data/trash";
import { routes as settingsRoutes } from "../screens/settings";
import { DeleteSessionFor } from "../screens/results/DeleteSession";
import { FlashLine, clearFlash, setFlash } from "../ui/flash";

function render(id: string, trashed: TrashedSession[] = [], store: Store = mockStore): string {
  return renderToStaticMarkup(createElement(StoreProvider, { store, children: createElement(TrashContext.Provider, { value: trashed, children: createElement(settingsRoutes[id]) }) }));
}
const strip = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const trashedRow = (id: string, over: Partial<TrashedSession> = {}): TrashedSession => ({ id, deleted_at: "2026-10-21T09:00:00Z", started: "2026-10-20T10:00:00Z", stage: "recruiter", application_id: null, reps: 5, ...over });

describe("deleting history with a way back: the words", () => {
  it("asks the way the spec words it, with the count", () => {
    expect(deleteSessionText(5)).toBe("Delete this session? Its 5 answers and recordings go too. Answers you labelled for the eval set stay in the eval folder.");
    expect(deleteSessionText(1)).toContain("Its 1 answer and recordings go too.");
    expect(deleteSessionText(0)).toContain("Its answers and recordings go too.");
    expect(deletePracticeText("Kestrel Pay", 3, 14)).toBe("Delete Kestrel Pay's practice? Its 3 sessions, 14 answers and recordings go too. Answers you labelled for the eval set stay in the eval folder.");
    expect(recentlyDeletedLine(2)).toBe("Recently deleted (2)");
    expect(GONE_LINE).toBe("That session was deleted");
    expect(NO_LONGER_HERE).toBe("That session is no longer here");
    expect(KEEP_DAYS).toBe(7);
    expect(restoreHint(2)).toContain("7 days to restore them");
  });

  it("says the last day a trashed session can come back, seven days after the stamp", () => {
    expect(keptUntil("2026-10-21T12:00:00Z")).toBe("kept until Oct 28");
  });

  it("names a trashed session by its stage and application, or general questions", () => {
    const company = (id: string) => (id === "app_a" ? "Kestrel Pay" : undefined);
    expect(trashedTitle(trashedRow("s", { stage: "hiring_manager", application_id: "app_a" }), company)).toBe("Hiring manager · Kestrel Pay");
    expect(trashedTitle(trashedRow("s"), company)).toBe("Recruiter · general questions");
    expect(trashedTitle(trashedRow("s", { application_id: "app_deleted" }), company)).toBe("Recruiter · general questions");
  });

  it("counts a session's answers, not its follow-ups", () => {
    const reps = [
      { session_id: "a", follow_up: false },
      { session_id: "a", follow_up: true },
      { session_id: "a", follow_up: false },
      { session_id: "b", follow_up: false },
    ];
    expect(answersIn(reps, "a")).toBe(2);
    expect(answersIn(reps, "zzz")).toBe(0);
  });
});

describe("a live session cannot be deleted until it ends", () => {
  const live = { active: true, sessionId: "ses_now", applicationId: "app_a" };
  it("blocks the session being practised and the application it is for", () => {
    expect(liveBlock(live, { sessionId: "ses_now" })).toBe(LIVE_BLOCK);
    expect(liveBlock(live, { applicationId: "app_a" })).toMatch(/Finish that session first/);
  });
  it("lets everything else go, and everything once it has ended", () => {
    expect(liveBlock(live, { sessionId: "ses_other" })).toBeNull();
    expect(liveBlock(live, { applicationId: "app_b" })).toBeNull();
    expect(liveBlock({ ...live, active: false }, { sessionId: "ses_now" })).toBeNull();
  });
});

describe("the browser preview trashes and restores the sample sessions in memory", () => {
  const now = new Date("2026-10-22T09:00:00Z");
  it("round trips", () => {
    const one = previewTrash([], mockStore.sessions, ["s_today"], now);
    expect(one.map((t) => t.id)).toEqual(["s_today"]);
    expect(one[0].application_id).toBe("app_kestrel");
    expect(one[0].stage).toBe("hiring_manager");
    const two = previewTrash(one, mockStore.sessions, ["s_today", "s_oct19"], now);
    expect(two.map((t) => t.id).sort()).toEqual(["s_oct19", "s_today"]);
    expect(previewRestore(two, "s_today").map((t) => t.id)).toEqual(["s_oct19"]);
    expect(() => previewRestore([], "s_today")).toThrow(NO_LONGER_HERE);
  });
});

describe("where the delete sits", () => {
  it("every row in the Sessions list has a trash button, and the list ends with nothing when the trash is empty", () => {
    const html = render("7-2-progress-sessions");
    const text = strip(html);
    expect(html.match(/aria-label="Delete the [^"]+ session"/g)?.length).toBe(mockStore.sessions.length);
    expect(text).not.toContain("Recently deleted");
    // The row link is still there and is not inside the button.
    expect(html).toContain("#/4-3-session-results-drill");
  });

  it("ends with 'Recently deleted (2) · Restore' while the trash has anything", () => {
    const text = strip(render("7-2-progress-sessions", [trashedRow("a"), trashedRow("b")]));
    expect(text).toContain("Recently deleted (2) · Restore");
  });

  it("puts 'Delete this session' as a quiet link on a results screen", () => {
    const html = renderToStaticMarkup(createElement(StoreProvider, { store: mockStore, children: createElement(DeleteSessionFor, { sessionId: "s_today" }) }));
    expect(html).toContain("Delete this session");
    expect(html).not.toContain("alertdialog");
  });

  it("shows no delete link on the sample walk-through, which has no session of its own", async () => {
    const { routes } = await import("../screens/results");
    const html = renderToStaticMarkup(createElement(StoreProvider, { store: mockStore, children: createElement(routes["4-3-session-results-drill"]) }));
    expect(html).not.toContain("Delete this session");
  });
});

describe("the line that follows you home", () => {
  it("shows once set and goes when cleared", () => {
    clearFlash();
    expect(renderToStaticMarkup(createElement(FlashLine))).toBe("");
    setFlash(GONE_LINE);
    expect(strip(renderToStaticMarkup(createElement(FlashLine)))).toContain("That session was deleted");
    clearFlash();
    expect(renderToStaticMarkup(createElement(FlashLine))).toBe("");
  });
});
