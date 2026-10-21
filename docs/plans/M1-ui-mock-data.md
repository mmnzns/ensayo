# M1 UI with Mock Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every one of the 46 designed screens, plus the extra states the Build Plan lists, built as React screens that Miguel can click through in the browser and in the Tauri app, reading all data from one mock store interface.

**Architecture:** The design export is plain HTML plus one shared stylesheet. A script converts each design page to a React component (faithful markup), the shared pieces (sidebar, wordmark, links, layouts) become components, and each screen then reads its content from a typed `Store` instead of hard-coded sample text. A tiny hash router maps the design's screen ids to components so links between screens work as in the HTML mockups. Later milestones replace `mockStore` with the real store behind the same interface.

**Tech Stack:** React 19, TypeScript, Vite, the design's `ensayo.css` classes on top of the Tailwind theme from M0, Vitest, `parse5` (dev only, for the converter).

**Source of truth for looks:** `Design/screens/png` (pictures) and `Design/screens/html` (clickable pages) in Miguel's Drive folder; `Design/styles/ensayo.css`; Notion "Ensayo v0 Features and Screens". Where a screen and Notion disagree, follow Notion and flag it.

---

## Decisions made while planning

1. **Route = the design's screen id.** `#/2-1-home`, `#/3-2-practice-recording`, and so on. A design link `href="5-1-stories.html"` becomes `<Link to="5-1-stories">`, so the conversion is mechanical and a test can prove every link resolves. `#/` opens `2-1-home` (or `1-1-welcome` while the profile is not set up). Pretty routes can come later.
2. **Use the design's CSS classes as they are.** `ensayo.css` (`e-card`, `e-btn`, `e-h1`...) is copied into the app unchanged, plus a dark-mode block. The Tailwind theme from M0 stays for new code. Fonts are already bundled; the design's Google Fonts links are dropped.
3. **Scripted conversion, then wiring.** `scripts/html-to-tsx.mjs` turns each design page into a `.tsx` draft (class to className, inline styles to objects, SVG attributes to camelCase, `.html` links to `<Link>`, the repeated sidebar to `<AppShell>`, the wordmark to `<Wordmark>`). Agents then replace hard-coded sample content with store reads and add the interactions.
4. **One mock store.** `src/data/store.ts` defines `Store` (types match the Build Plan data model and the prompt examples: story fields from `prompts/examples/story-bank.json`). `mockStore` holds Dana Ortiz's sample data from the design. Screens call `useStore()`; nothing imports sample data directly.
5. **Dark mode is proposed, not designed.** The design export is light only. `ensayo.css` gets a dark palette under `prefers-color-scheme: dark` and `[data-theme="dark"]`/`"light"` overrides, derived from the light tokens. **Flag at the 🛑 for Miguel to approve or change.** Auto is the default (Settings › Profile will expose it later).
6. **The M0 check screen stays reachable** at `#/m0` (and from Settings › Developer) until Miguel has verified M0 on both machines.
7. **No browser use by parallel agents.** One shared browser pane cannot serve eight agents. Agents verify with type-check, unit tests and the render test; Opus/Sonnet lead does the side-by-side visual check against the PNGs afterwards.

## Screen groups (one agent each, disjoint files)

| Group | Design screens | Extra to build in the same style (from the Build Plan) | Folder |
| --- | --- | --- | --- |
| first-run | 1-1 to 1-7 | onboarding step 8 ("That's the loop" card, reuses practice screens) | `src/screens/first-run/` |
| home | 2-1, 2-2, 2-3 | empty and error states of Home and the session sheet | `src/screens/home/` |
| practice | 3-1 to 3-8 | Mock follow-up (the follow-up screen with the Mock label, no note) | `src/screens/practice/` |
| results | 4-1 to 4-5 | none | `src/screens/results/` |
| stories | 5-1 to 5-5 | empty and error states | `src/screens/stories/` |
| applications | 6-1 to 6-8 | the application Questions tab | `src/screens/applications/` |
| settings | 7-1, 7-2, 8-1 to 8-7, 9-1 | Settings › About, Settings › Developer (hidden unless turned on) | `src/screens/settings/` |
| states | none | dialogs: Closed reason, delete confirmations, night-before lock warning, scanned-PDF paste box, sync-conflict picker; generic error and empty states | `src/screens/states/` |

Screen ids and design file names are listed in `src/screens/manifest.ts` (Task 5).

## File structure (foundation)

```
scripts/html-to-tsx.mjs            converter (Task 5)
src/styles/ensayo.css              design stylesheet + dark mode (Task 1)
src/ui/Link.tsx  router.ts         hash router and <Link> (Task 2)
src/ui/AppShell.tsx FocusShell.tsx Sidebar.tsx Wordmark.tsx Icons.tsx   (Task 2)
src/data/types.ts store.ts mock.ts Store interface, context, Dana's data (Task 3)
src/screens/manifest.ts            id, title, shell, group for all 46 screens (Task 5)
src/screens/registry.ts            id -> component, aggregates the groups' index files (Task 5)
src/screens/<group>/index.ts       exports `routes`, owned by that group
src/__tests__/router.test.ts store.test.ts converter.test.ts screens.test.ts
```

---

### Task 1: Stylesheet and dark mode

**Files:** Create `src/styles/ensayo.css`; Modify `src/main.tsx`; Test `src/__tests__/ensayo-css.test.ts`

- [ ] **Step 1: Failing test** — the CSS carries every design colour, has a dark block, and loads no remote fonts.

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../styles/ensayo.css", import.meta.url), "utf8").toLowerCase();

describe("ensayo.css", () => {
  it("keeps the light palette from the design", () => {
    for (const c of ["#f6f6f7", "#b8432c", "#2b2722", "#fceee6"]) expect(css).toContain(c);
  });
  it("has a dark palette for auto and forced themes", () => {
    expect(css).toContain("prefers-color-scheme: dark");
    expect(css).toContain('[data-theme="dark"]');
    expect(css).toContain('[data-theme="light"]');
  });
  it("loads nothing from the internet", () => {
    expect(css).not.toContain("http");
    expect(css).not.toContain("@import url");
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (`npm test`, file missing).
- [ ] **Step 3: Implement.** Copy `Design/styles/ensayo.css` to `src/styles/ensayo.css`; delete its header comment line about "sage"; then append the dark block below. Dark values keep the brand coral readable (brighter primary, same hue), keep wins gold, and never use pure black:

```css
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --e-ground:#17161A; --e-surface:#211F25; --e-tint:#3A2620; --e-line:#34323A;
    --e-ink:#F2EFEA; --e-muted:#B3AFB8; --e-primary:#E2634A; --e-primary-ink:#1A0E0B;
    --e-primary-dark:#F08A74; --e-pen:#F08A74; --e-win:#F2B25C; --e-highlight:#2B2F3A;
    --e-warn-ink:#C9D0E0; --e-danger:#F27A6E; --e-ok:#6CC59A; --e-ok-tint:#1F3329;
    --e-gold:#F2A33A; --e-mark:#4A4120;
    --e-glow:linear-gradient(135deg,#3A2620 0%,#3A3120 100%);
    --e-shadow:0 1px 2px rgba(0,0,0,.4);
  }
}
:root[data-theme="dark"] {
  --e-ground:#17161A; --e-surface:#211F25; --e-tint:#3A2620; --e-line:#34323A;
  --e-ink:#F2EFEA; --e-muted:#B3AFB8; --e-primary:#E2634A; --e-primary-ink:#1A0E0B;
  --e-primary-dark:#F08A74; --e-pen:#F08A74; --e-win:#F2B25C; --e-highlight:#2B2F3A;
  --e-warn-ink:#C9D0E0; --e-danger:#F27A6E; --e-ok:#6CC59A; --e-ok-tint:#1F3329;
  --e-gold:#F2A33A; --e-mark:#4A4120;
  --e-glow:linear-gradient(135deg,#3A2620 0%,#3A3120 100%);
  --e-shadow:0 1px 2px rgba(0,0,0,.4);
}
:root[data-theme="light"] { color-scheme: light; }
:root[data-theme="dark"] { color-scheme: dark; }
```
Also make `tokens.css` body colours follow the same variables: change `body { background: var(--color-background); color: var(--color-text); }` to `background: var(--e-ground); color: var(--e-ink);`. In `src/main.tsx` import `./styles/ensayo.css` after `./styles/tokens.css`.
- [ ] **Step 4: Run, expect PASS** (`npm test && npm run build`).
- [ ] **Step 5: Commit** `feat: design stylesheet and a proposed dark palette`.

### Task 2: Router, links, shells, wordmark, icons

**Files:** Create `src/ui/router.ts`, `src/ui/Link.tsx`, `src/ui/Wordmark.tsx`, `src/ui/Icons.tsx`, `src/ui/Sidebar.tsx`, `src/ui/AppShell.tsx`, `src/ui/FocusShell.tsx`; Test `src/__tests__/router.test.ts`; Copy logo SVGs to `src/assets/logo/`

- [ ] **Step 1: Failing test** for the pure router logic (`parseRoute`, `hrefFor`, `resolve`):

```ts
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
```
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `router.ts`:

```ts
import { useSyncExternalStore } from "react";

export function parseRoute(hash: string): string {
  const m = /^#\/([A-Za-z0-9._-]*)/.exec(hash);
  return m ? m[1] : "";
}
export const hrefFor = (id: string) => `#/${id}`;

function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}
export function useRoute(): string {
  return useSyncExternalStore(subscribe, () => parseRoute(window.location.hash), () => "");
}
export function go(id: string) {
  window.location.hash = hrefFor(id);
}
```
`Link.tsx`: `<Link to="id" className style children>` renders `<a href="#/id">`; external links (`to` starting `http`, `mailto:`) render a plain `<a target="_blank" rel="noreferrer">` (the Tauri opener is wired in M8; in the browser it opens a tab).
`Wordmark.tsx`: `<Wordmark size={26} />`, the exact span+SVG from the design (`Design/screens/html/2-1-home.html`, the `.e-brand` anchor), with the gradient id made unique per instance (`useId`). `Icons.tsx`: one named component per icon used in the sidebar (`Home, Stories, Applications, Progress, Settings, Feedback`) taking `size`; screens add theirs as they need (keep each icon a small function component).
`Sidebar.tsx`: the design's `<nav class="e-side">`: wordmark, six nav links (ids `2-1-home`, `5-1-stories`, `6-1-applications`, `7-1-progress-habits`, `8-1-settings-profile`, `9-1-feedback`), spacer, the yellow Buy me a coffee button (`https://www.buymeacoffee.com/mnmnzns`, Poppins 500, links out, no script), and the engine chip linking to `8-5-settings-ai`. Props: `active: "home" | "stories" | "applications" | "progress" | "settings" | "feedback"`. Reads the engine label from the store (Task 3), falling back to "Timing only".
`AppShell.tsx`: `<div className="e-app"><Sidebar active/><main className="e-main">{children}</main></div>`. `FocusShell.tsx`: `<div className="e-focus">{children}</div>` (no sidebar).
Copy `Design/logo/svg/*.svg` to `src/assets/logo/` for the icon uses (welcome, favicon).
- [ ] **Step 4: Run tests and `npm run build`, expect PASS.**
- [ ] **Step 5: Commit** `feat: hash router, shells, sidebar and wordmark`.

### Task 3: Mock store

**Files:** Create `src/data/types.ts`, `src/data/store.ts`, `src/data/mock.ts`; Test `src/__tests__/store.test.ts`

- [ ] **Step 1: Failing tests** for the selectors the screens share (plain functions in `store.ts`, no React):

```ts
import { describe, expect, it } from "vitest";
import { mockStore } from "../data/mock";
import { nextInterview, habitStatus, storyGaps, applicationsByTab } from "../data/store";

describe("mock store", () => {
  const s = mockStore;
  it("has a profile and a focus habit", () => {
    expect(s.profile.name).toBeTruthy();
    expect(s.profile.focusHabits.length).toBeGreaterThan(0);
  });
  it("picks the earliest upcoming stage as the next interview", () => {
    const n = nextInterview(s.applications, new Date("2026-10-21T20:00:00"));
    expect(n?.application.company).toBe("Kestrel Pay");
    expect(n?.stage.stage).toBe("hiring_manager");
  });
  it("splits applications into active and closed", () => {
    const { active, closed } = applicationsByTab(s.applications);
    expect(active.every((a) => a.status !== "closed")).toBe(true);
    expect(closed.every((a) => a.status === "closed")).toBe(true);
  });
  it("flags story gaps in plain words", () => {
    const gaps = storyGaps({ ...s.stories[0], approach: "", proof_points: [] });
    expect(gaps).toContain("No strategy yet");
    expect(gaps).toContain("No number");
  });
  it("reports a habit as graduating at 8 of the last 10", () => {
    expect(habitStatus([true, true, true, true, true, true, true, true, false, false]).graduated).toBe(true);
    expect(habitStatus([true, false, true]).trend).toBe(false); // no trend before 5 reps
  });
});
```
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** `types.ts` mirrors the Build Plan data model (field names win over invention): `Profile` (name, targetRole, seniority, industry, sellsTo `"b2b"|"b2c"|"both"`, identityStatement, focusHabits: HabitId[]), `HabitId` (the eight ids in the Habit table), `Story` (id, title, employer, best_for[], direct_answer, context, approach, action, ownership, result, proof_points[] {label, metric, before, after, unit, approximate, verified}, scale, competencies[], great_eight[], branches[], verified), `Method` (situation, spoken, storyIds), `Application` (the `application.json` example in the Build Plan, plus `resume` {fileName, attachedOn, claims[], mustSay[], suggestions[]}, `analysis` {priorities[], beliefs[], gaps[], echoPhrases[]}, `questions` by stage, `claims[]`), `Stage` ids (`recruiter | hiring_manager | technical | panel | leadership`), `Session` (id, mode `"drill"|"mock"`, applicationId?, stage, startedAt, reps, headline, cost), `Rep` (question, attempt, transcript words, note, tryLine, criteria rows), `Settings` (practice, voice, speech, ai, privacy), `EngineStatus` (label, offline).
`store.ts`: `export interface Store { profile; stories; methods; applications; sessions; habits; settings; engine; now(): Date }`, a `StoreContext`, `useStore()`, `StoreProvider`, and the pure selectors `nextInterview`, `applicationsByTab`, `storyGaps`, `habitStatus` (pass rate over last 10, graduation at 8 of 10, trend only after 5 reps), `daysUntil`, `greeting(now)`.
`mock.ts`: Dana Ortiz (a fictional lifecycle manager at Fernhill, a made-up neobank), with the values the design shows: Kestrel Pay (hiring manager, Friday 2:00 PM, `2026-10-23T14:00`), her stories (use `prompts/examples/story-bank.json` for `st_onboarding` and add the ones the Stories screens show), methods for the six situations, the habit table (labels from the Build Plan), sessions, settings, the resume-sent claims. Pull exact strings from the design HTML when a screen shows them.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat: mock store with Dana's data and shared selectors`.

### Task 4: App wiring and the route registry

**Files:** Create `src/screens/manifest.ts`, `src/screens/registry.ts`, `src/screens/<group>/index.ts` (stubs), `src/screens/NotFound.tsx`; Modify `src/App.tsx`

- [ ] **Step 1: Failing test** (`src/__tests__/screens.test.ts`) — the manifest lists exactly the design's 46 screens, every screen has a component, and ids are unique.

```ts
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { manifest } from "../screens/manifest";
import { registry } from "../screens/registry";

const DESIGN = "/Users/miguel.monzones/My Drive (mikeymonzones@gmail.com)/MAIN DRIVE - Miguel/FILES - Projects & Work/Ensayo/Design/screens/html";

describe("screens", () => {
  it("has 46 designed screens with unique ids", () => {
    const ids = manifest.filter((m) => m.designed).map((m) => m.id);
    expect(ids.length).toBe(46);
    expect(new Set(ids).size).toBe(46);
  });
  it("matches the design folder when it is available", () => {
    let files: string[];
    try { files = readdirSync(DESIGN).filter((f) => f.endsWith(".html") && f !== "ensayo-logo.html"); } catch { return; }
    expect(manifest.filter((m) => m.designed).map((m) => `${m.id}.html`).sort()).toEqual(files.sort());
  });
  it("registers a component for every manifest entry", () => {
    for (const m of manifest) expect(registry[m.id], m.id).toBeTruthy();
  });
});
```
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** `manifest.ts` is an array of `{ id, title, shell: "app" | "focus", nav?, group, designed }` for the 46 design files (ids = file names without `.html`) plus the extras each group adds (marked `designed: false`). `registry.ts` merges each group's `routes: Record<string, ComponentType>` from `src/screens/<group>/index.ts`; until a group is finished its index exports a stub that renders the screen id (`<ScreenStub id>`). `App.tsx`: wraps in `StoreProvider`, reads `useRoute()`, renders `registry[id]` or `NotFound`, `""` redirects to `2-1-home`, `m0` renders `M0Check`.
- [ ] **Step 4: Run, expect PASS** (stubs satisfy the registry test).
- [ ] **Step 5: Commit** `feat: screen manifest, registry and app routing`.

### Task 5: HTML to TSX converter, and the drafts

**Files:** Create `scripts/html-to-tsx.mjs`, `src/__tests__/converter.test.ts`; Generate `src/screens/<group>/<Name>.tsx` drafts

- [ ] **Step 1: Failing tests** (the converter exports `convertHtml(html, ctx)` and pure helpers):

```ts
import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS module
import { styleToObject, attrName, convertFragment } from "../../scripts/html-to-tsx.mjs";

describe("html-to-tsx", () => {
  it("turns inline styles into a React style object literal", () => {
    expect(styleToObject("display: flex; gap: 12px; font-family: 'Outfit', sans-serif; --x: 1")).toBe(
      `{ display: "flex", gap: "12px", fontFamily: "'Outfit', sans-serif", "--x": "1" }`);
  });
  it("renames attributes for React", () => {
    expect(attrName("class")).toBe("className");
    expect(attrName("stroke-width")).toBe("strokeWidth");
    expect(attrName("for")).toBe("htmlFor");
    expect(attrName("aria-label")).toBe("aria-label");
  });
  it("rewrites screen links to <Link> and keeps external links as anchors", () => {
    expect(convertFragment(`<a href="5-1-stories.html" class="e-nav">Stories</a>`)).toBe(`<Link to="5-1-stories" className="e-nav">Stories</Link>`);
    expect(convertFragment(`<a href="https://x.test/">x</a>`)).toContain(`href="https://x.test/"`);
  });
  it("self-closes void elements and escapes braces in text", () => {
    expect(convertFragment(`<input class="e-input" value="a">`)).toBe(`<input className="e-input" defaultValue="a" />`);
    expect(convertFragment(`<p>use {braces}</p>`)).toBe(`<p>{"use {braces}"}</p>`);
  });
  it("replaces the repeated sidebar with the shell and the wordmark with a component", () => {
    const out = convertFragment(`<nav class="e-side"><a href="2-1-home.html" class="e-brand"></a></nav>`, { shell: true });
    expect(out).toBe("");
  });
});
```
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** with `parse5` (dev dependency): parse, walk the body, emit JSX text. Rules: `class`→`className`; `style` string → object literal via `styleToObject` (camelCase, quote custom properties, keep values as strings); SVG attributes kebab→camel (`stroke-width`, `stroke-linecap`, `stroke-linejoin`, `fill-rule`, `clip-rule`, `stop-color`, `viewbox`→`viewBox`, `gradienttransform`...); `for`→`htmlFor`; `value`/`checked`/`selected` on form controls → `defaultValue`/`defaultChecked`/`defaultSelected`; void elements self-closed; text with `{ } < >` emitted as a JSX string expression; HTML entities decoded; `<a href="x.html">` → `<Link to="x">` (also `x.html#frag`); `<nav class="e-side">...</nav>` dropped when `shell` is set (the shell supplies it) and the matching `e-nav-on` item decides `nav=`; the brand span with `font-family: 'Outfit'` and an inline `<svg viewBox="5 0 54 61">` → `<Wordmark size={N} />` where N is its `font-size`; `<link>`, `<script>`, `<style>` dropped. CLI: `node scripts/html-to-tsx.mjs <screen-id>...` writes `src/screens/<group>/<PascalName>.tsx` exporting `export default function <PascalName>()` wrapped in `AppShell`/`FocusShell` per manifest. Component names come from the id without the number prefix (`2-1-home` → `Home`, `3-2-practice-recording` → `PracticeRecording`).
- [ ] **Step 4: Run tests, expect PASS; run the converter for all 46 ids; `npm run build` must type-check the drafts.** Fix converter rules (not the outputs) until the build is clean.
- [ ] **Step 5: Add each group's `index.ts` exporting its screens, run `npm test`, commit** `feat: converter and static drafts of all 46 screens`.

### Task 6: Finish each screen group (one agent per group)

Each agent owns only its group's folder and `index.ts`. For every screen in the group:

- [ ] Open the PNG and the HTML in `Design/screens`, and the matching section of Notion "Ensayo v0 Features and Screens".
- [ ] Replace hard-coded sample content with `useStore()` data (names, lists, dates, numbers, badges). Static copy (labels, explanations, microcopy) stays as written in the design.
- [ ] Add the interactions that make the flow clickable: buttons and chips that navigate with `<Link>`/`go()`, toggles and selections held in local state, tabs, collapsed Details, the Again/Next flow, Drill vs Mock selection, form fields that edit local state (nothing persists in M1).
- [ ] Keep the design's keyboard hints as visible `e-kbd` labels; wire Space/Enter/N/L/Esc only on the practice screens with a small `useKeys` hook in the group folder.
- [ ] Build the group's extra screens listed in the table above, in the same style from the design classes, and register them in the group's `index.ts` with ids `x-<name>` (for example `states-closed-reason`); add them to `manifest.ts` entries marked `designed: false` through the group's own exported `extras` array (the lead merges them).
- [ ] No new shared components outside the group folder. If something shared is missing, create it inside the group folder and report it.
- [ ] Verify: `npx tsc --noEmit`, `npm test`, and the render test (Task 7) all pass. Commit the group's files only, with a message `feat: <group> screens`.

### Task 7: Render and link tests, visual check, hand-off

- [ ] **Step 1: Tests** (`src/__tests__/screens-render.test.ts`): render every registered screen to a string with `react-dom/server` inside `StoreProvider` + the mock store (must not throw, must not contain the text `undefined` or `NaN` or `[object Object]`); collect every `href="#/…"` in the output and assert it resolves to a registered id; assert no screen output contains `fonts.googleapis.com`.
- [ ] **Step 2: Visual check (lead, sequential).** With `npm run dev` open each screen in the browser pane at the PNG's width and compare with `Design/screens/png`; fix differences in the screen files. Check dark mode on at least Home, Practice, Result and Settings.
- [ ] **Step 3: Developer links.** Settings › Developer links to `#/m0`.
- [ ] **Step 4: Build Log entry in Notion** (what was built, flagged decisions including the proposed dark palette, anything that differed from the design or Notion, extra screens built, what the converter could not handle).
- [ ] **Step 5: 🛑 Stop.** Miguel clicks through every screen and approves the flow and the dark palette before any logic (M2).
