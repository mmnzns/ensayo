import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MOVE_BODY, MOVE_DONE, MOVE_TITLE, MoveDataCardView, type MoveOffer } from "../screens/home/MoveDataCard";
import { MOVE_CARD_HIDDEN_DAYS, MOVE_CARD_KEY, clearPrefs, hideMoveCard, moveCardHidden } from "../screens/settings/prefs";

const DAY = 24 * 60 * 60 * 1000;

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), removeItem: (k: string) => void delete data[k] };
}

const offer: MoveOffer = { state: "offer", legacy: "/old/data", target: "/Docs/Ensayo" };

describe("Move your data card", () => {
  it("offers Move it and Not now with the agreed words", () => {
    const html = renderToString(<MoveDataCardView offer={offer} />);
    expect(html).toContain("Move your data to Documents › Ensayo");
    expect(MOVE_TITLE).toBe("Move your data to Documents › Ensayo");
    expect(html).toContain(MOVE_BODY.replace("'", "&#x27;"));
    expect(html).toContain("Move it");
    expect(html).toContain("Not now");
    expect(html).not.toContain("—");
  });

  it("with data already in Documents, offers both folders and no move", () => {
    const html = renderToString(<MoveDataCardView offer={{ ...offer, state: "both" }} />);
    expect(html).toContain("Show both folders");
    expect(html).toContain("already has data");
    expect(html).not.toContain("Move it");
  });

  it("shows nothing when there is nothing to offer, and the success line after a move", () => {
    expect(renderToString(<MoveDataCardView offer={{ ...offer, state: "none" }} />)).toBe("");
    const done = renderToString(<MoveDataCardView offer={offer} done />);
    expect(done).toContain(MOVE_DONE.replace("'", "&#x27;"));
    expect(done).not.toContain("Not now");
  });

  it("Not now hides the card for 30 days, then it comes back", () => {
    const store = memory();
    const now = Date.UTC(2026, 10, 13);
    expect(moveCardHidden(now, store)).toBe(false);
    const until = hideMoveCard(now, store);
    expect(until).toBe(now + MOVE_CARD_HIDDEN_DAYS * DAY);
    expect(MOVE_CARD_HIDDEN_DAYS).toBe(30);
    expect(moveCardHidden(now + 29 * DAY, store)).toBe(true);
    expect(moveCardHidden(now + 30 * DAY + 1, store)).toBe(false);
  });

  it("blocked or damaged storage never breaks it", () => {
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(moveCardHidden(Date.now(), blocked)).toBe(false);
    expect(() => hideMoveCard(Date.now(), blocked)).not.toThrow();
    expect(moveCardHidden(Date.now(), memory({ [MOVE_CARD_KEY]: "garbage" }))).toBe(false);
  });

  it("Delete all Ensayo data forgets the choice", () => {
    const store = memory({ [MOVE_CARD_KEY]: String(Date.now() + DAY) });
    clearPrefs(store);
    expect(store.data[MOVE_CARD_KEY]).toBeUndefined();
  });
});
