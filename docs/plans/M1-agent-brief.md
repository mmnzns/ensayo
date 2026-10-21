# M1 screen-group brief (read this first)

You are finishing one group of Ensayo screens. The repo is `~/Developer/Ensayo` (Tauri 2 + React + TypeScript). Ensayo is an interview rehearsal app: answer out loud, get one fix, answer again. M1 builds **every designed screen with mock data so Miguel can click through it**. No real logic, no persistence, no AI, no audio.

## What exists already (do not rebuild it)

- `src/screens/<group>/<Name>.tsx` are **faithful drafts generated from the design HTML** (`Design/screens/html/<id>.html`). They already match the design pixel for pixel but are static: sample text is hard-coded and nothing responds to clicks. The design pictures are `Design/screens/png/<id>.png`.
- Design folder (Miguel's Drive): `/Users/miguel.monzones/My Drive (mikeymonzones@gmail.com)/MAIN DRIVE - Miguel/FILES - Projects & Work/Ensayo/Design` (`screens/html`, `screens/png`, `styles/ensayo.css`).
- Spec for what each screen does: Notion page "Ensayo v0 Features and Screens" (id `4004dc1744e18114b554e972747ec78f`) and the Build Plan (`4004dc1744e181e0916fc277e646d8e7`). Read the Notion pages with the `notion-fetch` tool if you need more than the design shows. Where a screen and Notion disagree, follow Notion and say so in your report.
- Shared code (**read-only for you**): `src/ui/` (`Link`, `router` with `go(id)`, `AppShell`, `FocusShell`, `Sidebar`, `Wordmark`, `Icons`), `src/data/types.ts`, `src/data/store.tsx` (`useStore()`, selectors `nextInterview`, `applicationsByTab`, `storyGaps`, `habitStatus`, `daysUntil`, `greeting`), `src/data/mock.ts` and `src/data/mock/*.ts` (Dana Ortiz's profile, 8 habits, 6 stories, 6 methods, 8 applications with Kestrel Pay in full, session list), `src/screens/manifest.ts`, `src/screens/registry.ts`, `src/styles/*`.
- Screen ids are the design file names without `.html` (`3-4-result-attempt-1-details-open`). `<Link to="5-1-stories">` links to a screen; `go("5-1-stories")` navigates from code; external URLs go through `<Link to="https://...">` and open in the browser.

## What you own

Only these paths: `src/screens/<your group>/` (all files in it, including `index.ts`) and `src/data/screens/<your group>.ts` (put sample data that only your screens show here, with its own types, exposed as `useStore().screens.<yourGroup>`). You may add test files named `src/__tests__/<your group>-*.test.ts`.

Do **not** edit anything else (shared types, `mock/*.ts`, `store.tsx`, `ui/*`, `manifest.ts`, `registry.ts`, other groups, existing tests). If you need a shared change, make a local workaround in your folder and describe the change you want in your report. Do not run `scripts/html-to-tsx-cli.mjs` (it would overwrite hand work). Do not commit; the lead commits. Do not push.

## The job, for every screen in your group

1. **Compare first.** Look at the PNG and read the draft. Read the matching Notion section if the behaviour is unclear.
2. **Wire the data.** Replace hard-coded content that is data (names, lists, dates, numbers, counts, badges, progress bars, tables) with reads from `useStore()` so a different store gives a different screen. Static copy (labels, explanations, microcopy) stays as in the design. Keep markup, classes and inline styles exactly; change content, not looks. Use selectors where they exist (`greeting(now)`, `nextInterview`, `habitStatus`, `storyGaps`...). Format dates and numbers in code from the data (for example "Friday, 2:00 PM"), not as strings in the mock.
3. **Make it clickable.** Every button, chip, tab, card and link does something sensible: navigate with `<Link>`/`go()`, or change local `useState` (selected chips, toggles, tabs, expand and collapse such as Details, form fields that hold what the user types). Nothing persists in M1. The two or three screens in a flow must chain the way the real flow would (Notion describes each flow). `href="#"` placeholders in drafts must become real actions (a link test fails on them).
4. **Build the extra screens** listed for your group in the lead's message, in the same style from the design classes (`e-card`, `e-btn`, `e-h1`...). Register each in your group's `index.ts` under `routes` and describe it in `extras` (`{ id, title, shell, nav?, group, name, designed: false }`, ids prefixed with your group, for example `states-closed-reason`).
5. **Keep it themeable.** Use the CSS variables (`var(--e-ink)`, `var(--e-primary)`...) for any colour you add. Where a draft has a hard-coded brand colour in an inline SVG or style (for example `stroke="#B8432C"`), switch it to the variable (`style={{ stroke: "var(--e-primary)" }}` or `currentColor`) when that is easy. A dark palette exists (`:root[data-theme="dark"]`).
6. **Plain words.** UI copy: plain, warm, specific; no exclamation marks in system copy; no em dashes; never name the story or answer frameworks (no STAR, CAAR, CAR, PREP) or say "rubric", "criterion", "score" or "fail" to the user. English only.

## Interaction conventions

- Local state with `useState`/`useReducer`; no new libraries.
- Practice-style keyboard shortcuts (Space to start and stop, Enter for Again, N next, L listen, R hear it again, Esc end) are wired **only** on the practice screens, with a small hook in the practice folder, and only while that screen is the active route.
- Forms use the design's controls (`e-input`, `e-chip`, `e-check`, `e-field`). Uncontrolled `defaultValue` in drafts should become controlled state where the value matters to another element on the screen.
- A screen must never crash when a list is empty or a field is missing; show the design's empty wording where the design has one.

## How to check your work (do this repeatedly)

- Types: `npx tsc --noEmit 2>&1 | grep "src/screens/<your group>\|src/data/screens/<your group>"` (other groups are being edited at the same time; ignore their errors).
- Tests: `npx vitest run src/__tests__/screens-render.test.ts -t "<screen id>"` for each of your ids, and the link test: `npx vitest run src/__tests__/screens-render.test.ts -t "every link"` should show no failure that names one of your ids (other groups' failures are not yours). Your own tests: `npx vitest run src/__tests__/<your group>-*.test.ts`. Do not run the whole suite in a loop.
- **Visual check with headless Chrome** (safe to run in parallel; the dev server at `http://localhost:1420` is already running with hot reload; if `curl -s -o /dev/null -w "%{http_code}" http://localhost:1420/` is not 200, run `npm run dev` in the background):

```bash
OUT=/private/tmp/claude-502/-Users-miguel-monzones--claude-spares-spare-5kW5Zh/e05ad67b-ee24-4c4f-b524-328463770f9e/scratchpad/shots/<your group>; mkdir -p $OUT
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=5000 --window-size=1280,<height of the PNG> --screenshot=$OUT/<screen id>.png "http://localhost:1420/#/<screen id>" 2>&1 | grep -v task_policy
```
  Then open that PNG and the design PNG with the Read tool and compare. Match the PNG's height (read it from the file; most are about 990). Skip dark-mode screenshots; the lead checks those, so just use the CSS variables.
- Do not use the shared browser pane (several agents work at once).

## What to report (short, in this order)

1. Files created or changed (paths).
2. Extra screens built (ids and what each shows).
3. Anything where the design and Notion disagree, or the design is internally inconsistent, and what you did.
4. Shared changes you wanted but did not make.
5. Anything you could not finish and why.
