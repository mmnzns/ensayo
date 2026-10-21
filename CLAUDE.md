# Ensayo: guide for Claude Code

> Generated from the Notion pages **Ensayo (Interview Practice App)**, **Interview Practice App v0 Build Plan** and **Ensayo v0 Features and Screens** (Vibe Coding Journey). Notion is the source of truth: when a decision changes, update Notion first, then regenerate this file. Never the reverse.

## What Ensayo is

An interview rehearsal app for Mac and Windows. The app asks a question, you answer out loud, and it gives you one note on the most important fix plus a better first sentence. Then you answer again. Everything stays on the user's computer; AI feedback comes from a local model, the user's own API key, or not at all (timing and filler words only). v0 is a free prototype for Miguel and a few testers; no monetization, accounts, sync or analytics.

## Build rules (follow exactly)

1. **Original work: built on the Talaan engine only.** Talaan is Miguel's own MIT code. Never paste, copy or translate code from Parlato or any other app. Other apps may be read to understand an approach, then Ensayo's own version is written.
2. **Credit only libraries and models** that actually ship, in `THIRD_PARTY_NOTICES.md`. No credits for reference apps.
3. **Prompts, the rubric, thresholds and the question bank** (`prompts/`, `questions/`) are drafted by Opus. Change none of them without Miguel. A test validates them against their schemas.
4. **Everything under Decisions, Scoring and Scenarios and edge cases in the Build Plan is decided.** Implement it, do not redesign it.
5. **Milestones M0 to M10 in order.** Each starts with a plan written with `superpowers:writing-plans` in `docs/plans/`, then tests and a commit per task. Stop at every 🛑 checkpoint for Miguel's OK.
6. **Notion first:** decisions and the Build Log are updated in Notion as work happens.
7. **Commit after every change that builds and works.** Ask before pushing to GitHub.
8. **No new answer framework.** Never introduce STAR, PREP or any acronym in prompts, UI copy or feedback. English only, no em dashes, no consultant phrasing.

## When to stop and ask, and when to switch to Opus

Ask Miguel instead of deciding: anything listed under **Open decisions** in the Build Plan, any change to a prompt, the rubric or a threshold, any situation not covered in **Scenarios and edge cases** (add it to the Build Log with a proposed handling and wait).

Switch to Opus for prompt or rubric design, and for any bug that survives two attempts.

## Where things live

- Notion: parent page "Ensayo (Interview Practice App)" holds the why and the Build Log; "Interview Practice App v0 Build Plan" is the only spec; "Ensayo v0 Features and Screens" is what the user sees.
- Miguel's Drive folder (Mac and PC, synced): `MAIN DRIVE - Miguel / FILES - Projects & Work / Ensayo` with `Design/` (screens, `ensayo.css`, logo), `Data/` (Miguel's personal data folder, never in the repo) and `Handoff/` (the original prompt and question-bank drafts).
- Code: this repo, cloned **outside Google Drive**: `~/Developer/Ensayo` on the Mac, `C:\Dev\Ensayo` on the PC. GitHub moves code between machines; Drive moves data.
- Machine-local at runtime (never in the data folder): speech models, answer audio, API keys, logs. See `src-tauri/src/paths.rs`.

## Commands

```bash
npm install
npm run tauri dev                                  # run the app (real native commands)
npm run dev                                        # UI in a browser (no native commands)
npm test                                           # frontend tests (Vitest)
cargo test --manifest-path src-tauri/Cargo.toml    # Rust tests
npm run build                                      # type-check + build frontend
sh scripts/build-signed-debug.sh                   # Mac: signed debug .app, for real microphone permission
ENSAYO_SMOKE_WAV=<16 kHz mono wav> ENSAYO_SMOKE_MODEL=whisper-turbo cargo test --manifest-path src-tauri/Cargo.toml smoke_real_model -- --ignored --nocapture
```

Windows: dot-source `scripts/cpu-baseline.ps1` before release builds (whisper.cpp for the AVX2 baseline); `.cargo/config.toml` already forces `-O2` for whisper.cpp. `npm run tauri dev` needs no signing.

`npm run tauri dev` attributes the microphone permission to the terminal; check recording on the signed `.app` (`src-tauri/target/debug/bundle/macos/Ensayo.app`).

## Carried over from Talaan

- **Tauri commands that build a window or run long must be `async`** (use `spawn_blocking`), or the app freezes on Windows (WebView2).
- **Windows whisper.cpp** must build with speed optimisations (`.cargo/config.toml`) and the AVX2 baseline (`scripts/cpu-baseline.ps1`); the Windows CI job fails if a CMake cache shows NATIVE or AVX-512 on.
- **Whisper Large Turbo** is the default speech model, with Silero voice detection first. Thread counts: about three quarters of the threads on Windows, all (2 to 8) on the Mac.
- Speech models already downloaded by Talaan are reused read-only and shown as "On this computer".
- **Claude-launched dev builds on Windows** save settings in Claude's sandbox folder. Test settings and data from a normally launched app.
- One design for Mac and Windows; platform-neutral words ("this computer", "your system's secure key storage").
- A "Delete all Ensayo data" button removes models, data, settings, logs and saved keys (M10).
- Dependencies are optimized even in debug builds (`[profile.dev.package."*"]`), or whisper.cpp is 10x slower.

## Architecture (after M0)

Tauri 2 desktop app; Rust backend in focused modules behind commands; React + TypeScript frontend that talks only to those commands.

Exists now: `recorder` (cpal mic, 16 kHz mono WAV, `Capture` for one answer), `speech` (model catalog and downloads, Silero VAD, Whisper and Parakeet engines returning words with times, `transcribe_wav`), `keys` (Keychain / Credential Manager), `ai::providers` (cloud provider table, auth, error wording, model lists), `commands`, `platform` (microphone permission).

Later milestones add: `storage`, `metrics` (rules), `ai` routing and prompts, `bank`, `jd`, `drill`, `habits`, `eval`.

Code is the orchestrator, the data folder is the memory, and each AI call is a small stateless job (see "How the pieces fit" in the Build Plan).
