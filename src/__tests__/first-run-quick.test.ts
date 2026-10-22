import { beforeEach, describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import type { RepApi } from "../practice/api";
import { getLive, resetLive, setRepApi } from "../practice/live";
import { FIRST_DRILL, HOME_DRILL, startQuickDrill } from "../practice/quick";

const api = { aiReady: async () => true } as unknown as RepApi;
const ctx = { targetRole: "Product manager", stories: mockStore.stories, methods: mockStore.methods };

beforeEach(() => {
  resetLive();
  setRepApi(null);
});

describe("quick drill", () => {
  it("does nothing where there is no real loop (the browser preview)", () => {
    expect(startQuickDrill(ctx)).toBe(false);
    expect(getLive().active).toBe(false);
  });

  it("starts a Drill of general questions at the asking screen", () => {
    setRepApi(api);
    expect(startQuickDrill(ctx)).toBe(true);
    const s = getLive();
    expect(s).toMatchObject({ active: true, mode: "drill", phase: "asking" });
    expect(s.questions).toHaveLength(HOME_DRILL);
  });

  it("asks fewer for a first run", () => {
    setRepApi(api);
    startQuickDrill(ctx, { count: FIRST_DRILL });
    expect(getLive().questions).toHaveLength(FIRST_DRILL);
  });

  it("can start from one story", () => {
    setRepApi(api);
    expect(startQuickDrill(ctx, { count: FIRST_DRILL, storyId: mockStore.stories[0].id })).toBe(true);
    expect(getLive().active).toBe(true);
    expect(getLive().questions.length).toBeGreaterThan(0);
  });
});
