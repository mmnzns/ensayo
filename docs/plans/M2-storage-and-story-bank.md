# M2 Storage, Data Model and Basic Story Bank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The user's profile, stories and methods are saved as plain JSON files in a data folder (safe to point at a synced drive), through Rust storage commands, and the Stories screens in the app use them; tests cover create, read, update, delete, delete-all and migration from a version 0 file.

**Architecture:** A `storage` module in the Rust backend owns the data folder: atomic writes, one small file per record, a `schema_version` on every file with a migration step on read, sync-conflict detection, a machine lock file, and a clear error when the folder is missing. Tauri commands expose it. On the frontend a `DataProvider` replaces the fixed mock store: in the app it loads from the commands, in the browser it falls back to the mock, and both expose the same `Store` plus a small `actions` object (save story, delete story, verify, save method). The Stories screens call those actions.

**Tech Stack:** Rust (serde, serde_json, chrono, gethostname, tempfile for tests), Tauri commands, React context.

**Source of truth:** Notion Build Plan sections "Data model" (including **Sync-safe rules**), "Story Bank (CAAR)", "Milestones: M2", "Scenarios and edge cases: Data and history". Field names follow the Build Plan and `prompts/examples/story-bank.json`; `src/data/types.ts` mirrors them.

---

## Decisions made while planning

1. **What is stored in M2:** `profile.json`, `bank/stories/<id>.json`, `bank/methods/<situation>.json`. Applications, sessions, reps, claims and eval files arrive with the milestones that use them (M3, M8, M9, M5), reusing the same storage core.
2. **Data folder:** machine-local setting `settings.json` in the app's local folder (never inside the data folder). Default `<app local>/data`; `ENSAYO_DATA_DIR` overrides it (tests, and Miguel pointing at his Drive `Data/` folder). A folder that does not exist is **never created implicitly**: `Storage::open` fails with `Unavailable`; only `Storage::init` creates one. This is the "never create an empty bank over the missing one" rule.
3. **Version 0:** the shape stories would have had before `schema_version` existed. Defined here and kept as a fixture (`src-tauri/tests/fixtures/story-v0.json`): no `schema_version`, `numbers[]` instead of `proof_points[]`, no `branches`, `competencies`, `great_eight`, `usage` or `scale`. Migration fills them; the card `headline` is rebuilt from the first number.
4. **A file from a newer Ensayo is never touched or rewritten** (error `TooNew`), so a second machine on an older build cannot corrupt data.
5. **Verified rule (Build Plan):** a story is `verified` only when it has at least one proof point and every proof point is verified. `save_story` recomputes it; the user ticks proof points, not the story.
6. **Names on disk.** Stories use the Build Plan and prompt-example names (`direct_answer`, `proof_points`, ...). Profile and methods use the UI's own names (`fullName`, `targetRole`, `storyIds`, ...), so no translation layer sits between the files and the screens. A method file is `{ schema_version, situation, spoken, storyIds }`; the UI-only `label` and `prompt` stay constants keyed by situation.
7. **Delete all** removes only what Ensayo wrote (the profile, `bank/`, and the other known folders, the lock file), never the data folder itself and never unrelated files in it (it may be a user's synced Drive folder). The command also removes machine-local settings, audio, models and saved keys.
8. **Browser fallback:** `npm run dev` (no Tauri) keeps working on the mock data, with edits held in memory only.

## File structure

```
src-tauri/src/storage/
  mod.rs        Storage handle, StorageError, init/open, delete_all
  io.rs         atomic_write, read_text, list_json, new_id
  versioned.rs  load_record/save_record with schema_version and migration
  migrate.rs    story v0 -> v1
  model.rs      Profile, Story, ProofPoint, Branch, Method (serde, same names as the TS types)
  bank.rs       story and method operations on Storage
  conflicts.rs  find and resolve sync conflict copies
  lock.rs       lock file: who has the data folder open
  settings.rs   machine-local settings.json and data folder resolution
src-tauri/tests/fixtures/story-v0.json
src-tauri/src/commands.rs      (modify) data commands
src/data/real.tsx              DataProvider, actions, tauri adapter
src/data/actions.ts            pure reducers for stories and methods (shared by mock and real)
src/__tests__/data-actions.test.ts
```

---

### Task 1: Storage core (atomic writes, listing, ids)

**Files:** Create `src-tauri/src/storage/mod.rs`, `io.rs`; Modify `src-tauri/Cargo.toml` (`chrono`, `gethostname`)

- [ ] **Step 1: Failing tests** in `io.rs`: `atomic_write` creates parent folders and the file; overwriting replaces the whole content; no `.tmp` files are left after success; a write into a path whose parent is a file fails and leaves nothing; `list_json` returns only `*.json`, sorted by name, skipping temp files and sub-folders; `read_text` of a missing file is `Ok(None)`; `new_id("st")` returns `st_` plus lower-case letters and digits and 1000 ids are unique.
- [ ] **Step 2: Run, expect FAIL** (`cargo test storage::io`).
- [ ] **Step 3: Implement.** `atomic_write(path, bytes)`: write to `<name>.<random>.tmp` in the same folder, `sync_all`, then `rename` over the target. `new_id(prefix)` from the clock nanoseconds in base 36 plus a process-wide counter. `StorageError` (`thiserror`): `Unavailable(PathBuf)`, `Io`, `Json`, `TooNew{file, found, supported}`, `NotFound(String)`, `Invalid(String)`.
- [ ] **Step 4: Run, expect PASS.** **Step 5: Commit** `feat: storage core with atomic writes`.

### Task 2: Versioned records and migration

**Files:** Create `versioned.rs`, `migrate.rs`, `tests/fixtures/story-v0.json`

- [ ] **Step 1: Failing tests:** (a) the v0 fixture migrates to a v1 `Story`: `proof_points` has the numbers with `verified: false`, `usage` is `{practiced: 0, fits: 0}`, `headline` reads like "Sender score 62 → 94", `schema_version` is 1; (b) saving a story writes `"schema_version": 1`; (c) a file with `schema_version: 99` fails with `TooNew` and is left byte for byte unchanged; (d) a v1 file passes through unchanged; (e) a file that is not JSON gives `Json`, not a panic.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement** `load_record::<T>(path, migrate)` (reads, reads the version, runs migrations up to the current one, deserialises) and `save_record(path, &T)` (pretty JSON with the current `schema_version`, atomic). Migration is a pure function on `serde_json::Value`.
- [ ] **Step 4: Run, expect PASS.** **Step 5: Commit** `feat: versioned records and the story v0 migration`.

### Task 3: Profile, stories and methods

**Files:** Create `model.rs`, `bank.rs`; Modify `mod.rs`

- [ ] **Step 1: Failing tests** (temp folder): `Storage::init` creates the folder and sub-folders; `open` on a missing folder is `Unavailable` and creates nothing; profile round trip; story create, read, update (same id), list (sorted by title), delete; deleting a missing story is `NotFound`; saving a story whose proof points are all verified marks it verified, and one unverified or none marks it not; `set_proof_verified` flips one point and recomputes the story; methods round trip and list in the six-situation order; `delete_all` empties Ensayo's folders but keeps the data folder and an unrelated `notes.txt` placed beside them.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement** the types (serde field names identical to `src/data/types.ts`: `best_for`, `direct_answer`, `proof_points`, `great_eight`, `usage`, `headline`, and so on) and the operations. Story file name is `<id>.json`; method file name is `<situation>.json`; an id from outside (`../x`) is rejected with `Invalid`.
- [ ] **Step 4: Run, expect PASS.** **Step 5: Commit** `feat: profile, story and method storage`.

### Task 4: Sync safety (conflicts, lock file, missing folder)

**Files:** Create `conflicts.rs`, `lock.rs`

- [ ] **Step 1: Failing tests:** conflict copies are found next to their original for the names a synced drive makes (`story (1).json`, `story (Miguel's conflicted copy 2026-10-21).json`) and not for ordinary names; `resolve(KeepOriginal)` deletes the copy; `resolve(KeepCopy)` replaces the original with the copy and removes the copy; nothing is ever merged; a copy with no original is reported as an orphan and keepable. Lock: with no lock file the state is `Free`; `acquire` writes the machine name and times; the same machine sees `Mine`; another machine's lock newer than 10 minutes is `Other { machine, age }`; older than 10 minutes is `Stale`; `release` removes only our own lock; `heartbeat` refreshes the time.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement** with an injectable clock (`now: DateTime<Utc>` parameter) and machine name (`gethostname`). **Step 4: PASS.** **Step 5: Commit** `feat: sync conflict detection and the data folder lock`.

### Task 5: Machine-local settings, data folder resolution, commands

**Files:** Create `settings.rs`; Modify `commands.rs`, `lib.rs`, `paths.rs`

- [ ] **Step 1: Failing tests:** `ENSAYO_DATA_DIR` beats the saved setting, which beats the default; saving the setting round trips and keeps unknown keys; changing the folder to a missing path is `Unavailable`; the default folder is inside the app-local folder.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement** settings and the Tauri commands (all `async`, blocking work through `spawn_blocking`): `data_status` (folder, state `ready | missing | other_machine`, conflicts), `load_all` (profile, stories, methods), `save_profile`, `save_story`, `delete_story`, `set_proof_verified`, `save_method`, `set_data_folder`, `resolve_conflict`, `delete_all_data` (data folder contents, then audio, models, machine-local settings, `keys::clear_all`).
- [ ] **Step 4: Run, expect PASS.** **Step 5: Commit** `feat: data folder setting and storage commands`.

### Task 6: Frontend data layer and the Stories screens

**Files:** Create `src/data/actions.ts`, `src/data/real.tsx`, `src/__tests__/data-actions.test.ts`; Modify `src/App.tsx`, `src/screens/stories/*`

- [ ] **Step 1: Failing tests** for the pure reducers in `actions.ts`: `saveStory` adds or replaces by id and recomputes `verified`; `deleteStory` removes it and unlinks it from methods; `setProofVerified` flips one point; `saveMethod` replaces the sentence for a situation; `newStory` makes an empty story with a unique id; nothing mutates its input.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement** the reducers; `DataProvider` (in the app: `invoke("load_all")` on start, then each action calls its command and updates state; in the browser: starts from `mockStore`, edits in memory) exposing `useStore()` (same shape as before) and `useActions()`. Wire: 5-3 Save and "Save and practice" create the story (blank mode too); 5-4 Save changes, Delete story, and each number's Checked toggle; 5-5 editing a method sentence. The stories list shows real data, with the empty state (`stories-empty`) when there are none.
- [ ] **Step 4: Run all tests and `npm run build`, expect PASS.** **Step 5: Commit** `feat: Stories screens save to the data folder`.

### Task 7: Verify and record

- [ ] `cargo test` and `npm test` green; launch the app with `ENSAYO_DATA_DIR` pointing at a scratch folder, add and delete a story through the UI path as far as can be driven headlessly, and check the files on disk; confirm a missing folder shows the data-folder-missing state's data (status `missing`).
- [ ] Build Log entry in Notion; push; check CI.
