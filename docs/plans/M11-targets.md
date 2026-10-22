# M11 Targets (v0.1) Implementation Plan

**Goal:** One person, several kinds of job. You (name, habits, stories, history, engines) stay one; a **target** holds the job-specific things (role, who you sell to, pitch, what you lead with, story pins and angles, default stages, base resume, pay range). Every application and session points to a target; practice outside an application uses the active target.

**Source of truth:** Notion page "Ensayo v0.1: Targets" (id 4014dc1744e1815d812acba29f08c29c), designed 2026-10-22; boards copied to `docs/design/v0.1/` (read `README.md` there). Notion wins over this file, this file wins over the boards.

**Decisions taken for the three open questions (Miguel can reverse):**
1. Name: **Targets** (it is what the boards say: "Practicing for", Settings › Targets).
2. New application: the target picker is preselected (the active target before the posting is read; the posting's best fit after) and Ensayo shows a one-tap banner when another target fits better.
3. Pay range: **kept per target**, optional, never sent to an AI.

**Architecture:** `profile.json` is replaced by `you.json` + `targets/<id>.json`. To keep every v0 screen working, the app still exposes a merged `profile` (you + the active target) and the old `save_profile` command keeps working (it writes `you` and the active target, creating target 1 when none exists), so onboarding and old code need no change. New screens use `you`, `targets`, `activeTarget`.

## Data (disk, JSON, `schema_version`)

`you.json`: `{ name, fullName, focusHabits: HabitId[], activeTargetId: string|null, targetsNotePending: boolean }`.

`targets/<id>.json` (camelCase, like the old profile):
```
{ id, name, color: "coral"|"slate"|"green"|"gold"|"plum", role, roleFamily: "lifecycle"|"marketing_ops"|"growth"|"product_marketing"|"other",
  seniority: "early"|"mid"|"senior"|"lead"|"director", industry, sellsTo: "b2b"|"b2c"|"both",
  companyStage: "startup"|"growth"|"enterprise"|"any", pitch: string, leadWith: string[] (max 3),
  pinnedStoryIds: string[], hiddenStoryIds: string[], defaultProcess: StageId[],
  baseResume: { path: string, fileName: string } | null, payRange: { low: number, high: number, currency: string } | null,
  archived: boolean, createdAt: string }
```
Colours are assigned in order coral, slate, green, gold, plum, then repeat.

Stories gain `angles: [{ targetId, headline, emphasis: string[], leadBranch: string|null }]` (snake_case on disk like the rest of the story: `target_id`, `lead_branch`; the TS side reads the same names as the Story type already does). **An angle headline may only contain numbers that are in the story's proof points** (compare with `metrics::numbers`, same value any wording; compound adjectives like "seven-day" are not numbers); otherwise saving fails with a plain line: `The opening sentence for <target> says 52%, which is not one of this story's numbers.`

Applications gain `target_id`; sessions gain `target_id`. Missing means "the first target" (the migrated one), applied at read time, so old files need no rewrite.

**Migration** (first launch with `profile.json` and no `you.json`): create `you.json` (`targetsNotePending: true`) and target 1 named from role and sells-to ("B2C lifecycle", "B2B marketing ops", "Both lifecycle", falling back to the role text), `color: coral`, `roleFamily` guessed from the role words (lifecycle/crm → lifecycle; "marketing ops"/"operations" → marketing_ops; growth; product marketing; else other), `companyStage: any`, `pitch` = the old `identityStatement`, `defaultProcess` the four default stages (recruiter, hiring_manager, technical, panel; leadership only for startup), no pins. Move the old file to `profile.v0.json` (kept as a backup, never deleted by the app, removed by Delete all). Test with a v0 data folder fixture (`src-tauri/tests/fixtures/v0-data/`). Delete all data must cover `you.json`, `targets/`, `profile.v0.json`.

## Rust commands (all async, `spawn_blocking`; params are camelCase from JS)

- `load_all` returns, in addition to today's fields: `you: You|null`, `targets: Target[]` (archived included), `profile` (merged view, as today's shape, or null before setup), `targetsNotePending: boolean`.
- `load_targets()` → `{ you, targets, targetsNotePending }` (the frontend calls it after every target command to take what the backend now holds).
- `save_you(you)` → You. `save_profile(profile)` (legacy, merged semantics above).
- `save_target(target)` → Target (empty `id` creates). `duplicate_target(id, name?)` → Target (copies everything, `archived` false, pins and angles copied: angles are copied onto the same stories for the new target id). `set_active_target(id)` → You. `archive_target(id, moveApplicationsTo?)`: fails with `"This target has applications. Move them to another target first."` unless `moveApplicationsTo` is given (then moves them); the last unarchived target cannot be archived; archiving the active target switches active to the first unarchived. `restore_target(id)` → Target. `ack_targets_note()` clears `targetsNotePending`.
- `set_story_priority(targetId, storyId, priority: "pin"|"hide"|"none")` → Target (a story is in at most one of the two lists).
- `save_story` keeps its shape and now validates angles as above.
- Applications: `create_application`'s `new` takes optional `targetId` (default: the active target); `update_application` patch takes `targetId` and `rebuildQuestions: boolean` (when the target changes and true, regenerate the question set of the application the way a posting re-read does, keeping edited questions); `ApplicationView` has `targetId` and `targetFit: TargetFit | null`.
- `analyse_jd` result (`JdOutcome`) gains `targetFit`: `{ sellsTo, roleFamily, seniority, bestTargetId: string|null, mismatchNotes: string[], perTarget: { targetId, fit: "strong"|"ok"|"weak", why }[] }` (from prompt 09; with no engine, a keyword fallback that guesses `sellsTo`, `roleFamily` and `seniority` from the posting words and compares to each target). Saved on the application as `target_fit`. `sellsTo: "both"` targets fit any posting kind.
- `target_from_posting(applicationId)` → `Target` draft (not saved): prefilled from the posting's `targetFit` and the closest target (role, family, seniority, sellsTo, companyStage, industry, defaultProcess, lead-with empty); the closest target's pitch is copied as `pitch` and the response includes `pitchCopied: true` (the screen warns it needs a rewrite; **Ensayo never writes the pitch**).
- `FinishArgs.target_id?: string` (default: the application's target, else the active target); sessions and `RepSummary` carry `target_id`.
- Scoring plumbing (after the prompt agent's changes land): prompt 02 gets the target's pitch when the question is tell-me-about-yourself and, per matched story with an angle for this target, the angle headline and emphasis; prompt 03 may use the angle headline in a rewrite (never-invent rule unchanged); prompt 09 gets the list of targets (id, name, sellsTo, roleFamily, seniority, pitch) and returns `target_fit`; prompt 11 gets the target's `leadWith` points and the posting summary and returns which fit; code adds fitting points to the application's must-say list as `ms-lw-1`, `ms-lw-2`…; the Mock debrief checks them like resume points.

## TypeScript contract (src/data/types.ts, store.tsx, real.tsx)

```
type RoleFamily = "lifecycle"|"marketing_ops"|"growth"|"product_marketing"|"other";
type CompanyStage = "startup"|"growth"|"enterprise"|"any";
interface Target { id; name; color: TargetColor; role; roleFamily; seniority; industry; sellsTo; companyStage; pitch; leadWith: string[];
  pinnedStoryIds: string[]; hiddenStoryIds: string[]; defaultProcess: StageId[]; baseResume: {path; fileName}|null;
  payRange: {low; high; currency}|null; archived: boolean; createdAt: string }
interface You { name; fullName; focusHabits: HabitId[]; activeTargetId: string|null }
interface StoryAngle { target_id; headline; emphasis: string[]; lead_branch: string|null }   // Story.angles?: StoryAngle[]
interface TargetFit { sellsTo; roleFamily; seniority; bestTargetId: string|null; mismatchNotes: string[]; perTarget: {targetId; fit: "strong"|"ok"|"weak"; why: string}[] }
Application gains: targetId: string; targetFit: TargetFit|null.   SessionSummary gains: targetId?: string.
Store gains: you: You; targets: Target[]; activeTarget: Target | undefined.   store.profile stays (merged compat view).
Actions gain: saveYou, saveTarget, duplicateTarget, archiveTarget, restoreTarget, setActiveTarget, setStoryPriority, ackTargetsNote, targetFromPosting.
```
Pure helpers in `src/data/targets.ts` (tested): `colorFor(index)`, `targetName(role, sellsTo)`, `visibleStories(stories, target)` (hidden removed, pinned first), `readiness(target, ...)` for Progress, `fitLabel`. Browser mock: two sample targets (B2C lifecycle, B2B marketing ops) and in-memory actions.

## Work split

1. **Prompts (Opus):** versions bumped for 02, 03, 09, 11, with schemas and examples updated; nothing else in `prompts/`.
2. **Rust (Sonnet):** data split, migration, commands, applications/sessions `target_id`, angles validation, fit, plumbing; `cargo test --workspace` green.
3. **Frontend A (Sonnet):** data layer actions, sidebar switcher, Settings You / Targets / Target editor (replacing Settings Profile), Start a session target line, migration note, question pack by role family, story selection with pins and hidden, `target_id` on sessions.
4. **Frontend B (Sonnet):** Applications (target picker, list filter, fit banner, new target from posting), Story angles tab, Progress target filter and readiness, Sessions target filter.

**Done when:** a v0 data folder migrates with nothing lost (test); two targets give different pitches, question packs and lead stories in practice; a B2B posting suggests the B2B target and offers to create one when missing; habits stay combined across targets; angles never change a number (test).

## Known gaps to tell Miguel

- The question bank has a lifecycle pack only; the marketing ops pack ("70 questions" on the board) does not exist yet, so marketing ops practice uses the general set until Opus drafts it.
- The design shows a target colour marker; the five colours above are my choice.

## Already in main (the shared TypeScript contract, written first so the agents agree)

`src/data/types.ts` (Target, You, StoryAngle, TargetFit, Application.targetId/targetFit, SessionSummary.targetId), `src/data/targets.ts` (helpers, tested), `src/data/targetState.ts` (in-memory reducers for the browser preview, tested), `src/data/real.tsx` (state, `Actions` for every target command incl. `targetFromPosting`, store fields `you`, `targets`, `activeTarget`, merged `profile`, `useTargetsNotePending()`), mock targets in `src/data/mock/profile.ts`. The Actions call the Rust commands named above (`load_targets`, `save_you`, `save_target`, `duplicate_target`, `set_active_target`, `archive_target`, `restore_target`, `set_story_priority`, `ack_targets_note`, `target_from_posting`); the Rust agent implements exactly those names and shapes.
