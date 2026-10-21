# M0 Repo and Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Tauri 2 + React app in `mmnzns/ensayo` that, on both Mac and PC with Wi-Fi off, records a 60-second mic answer and shows a transcript with word-level timestamps, built on a copy of the Talaan engine.

**Architecture:** Copy only the slice of Talaan Ensayo needs: the mic-capture pieces (cpal source, feed, resampler, WAV writer), the speech catalog + downloader + VAD + engines, the key store, and the cloud-provider table. Do not copy Talaan's meeting orchestration, `Storage`, i18n, call detection, GPU helper or summarizer. Add three small new pieces on top: a mic-only `Capture`, word-level output (`Word`) from Whisper and Parakeet, and `transcribe_wav`. A throwaway "M0 check" screen drives it.

**Tech Stack:** Tauri 2, Rust (edition 2024), React 19 + TypeScript + Vite + Tailwind 4, cpal, whisper-rs (whisper.cpp), parakeet-rs (ONNX), keyring, reqwest (blocking), Vitest.

**Source:** `~/Developer/Talaan`, HEAD `932fb91` (2026-10-19). Record this commit in the Build Log.

---

## Rules for the whole milestone

- **Original-work rule.** Ensayo is built on Talaan only (Miguel's own MIT code). Never copy, paste or translate code from Parlato or any other app. While copying Talaan files, scrub comments that mention Parlato or "the way Parlato does it" (they are Talaan's notes, but Ensayo's repo does not carry them). `THIRD_PARTY_NOTICES.md` lists only libraries and model files that actually ship.
- **No i18n layer.** Talaan calls `crate::i18n::tr("key")`. Ensayo is English-only in v0: replace each call with the plain English string it resolves to (look it up in `~/Developer/Talaan/src-tauri/src/i18n.rs` or its string table).
- **Commit after every task that builds and passes.** Commit message ends with the attribution line the harness gives (`Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`).
- **Do not push** until Miguel says so (first push is at the M0 🛑 or when he asks).
- **Commands (Mac):** `cd ~/Developer/Ensayo`. Rust tests: `cargo test --manifest-path src-tauri/Cargo.toml`. Frontend tests: `npm test`.
- Expect compile-fix iteration after each copy task (a stray `crate::` path). That is normal; fix it in the same task and re-run the task's verify step.

## Findings from reading Talaan (decisions made while planning)

1. **Talaan's Whisper path returns segment-level pieces, not words.** M0's done-when needs word timestamps and M3's rules need them. Task 7 adds them (Whisper: `max_len=1` + `split_on_word`; Parakeet: `TimestampMode::Words`).
2. **Talaan's recorder engine is two meeting tracks tied to `Storage`.** Ensayo copies the low-level pieces (`mic`, `feed`, `pipeline`, `resample`, `wav`, `timeline`, `clock`, `levels`, `source`) and writes a thin one-track `Capture` (Task 5) modelled on Talaan's `spawn_writer`. Not copied: `engine.rs`, `session.rs`, `recovery.rs`, `playback.rs`.
3. **Windows GPU speech helper (`talaan-stt-vulkan`) is not brought over.** It is not in the Build Plan. M0 ships CPU Whisper on Windows with the AVX2 baseline and `-O2` flags. Revisit only if Whisper is too slow on the PC. **Flag to Miguel.**
4. **Talaan's model catalog points reuse at Parlato's data folder** (`reuse_dirs: &["Models"]`, `default_reuse_roots`). Ensayo's version reuses **only Talaan's** folder (Task 6).
5. **`ensayo.css` header comment says "Palette: sage"** but sage was rejected; harmless, ignore it. Do not copy that comment into the Tailwind theme.
6. **Process note:** Talaan's own CLAUDE.md assigned its recorder, transcriber and every milestone plan to Opus. Ensayo's Build Plan gives M0 to Sonnet. If a bug survives two attempts, stop and ask Miguel to switch to Opus (this is already the rule).

## File structure (what exists when M0 is done)

```
ensayo/
  README.md  CLAUDE.md  THIRD_PARTY_NOTICES.md  .gitignore  .cargo/config.toml
  package.json  vite.config.ts  tsconfig.json  tsconfig.node.json  index.html
  docs/plans/M0-repo-and-engine.md
  prompts/            (Handoff/prompts copied unchanged: 01-11, rubric-v1.md, schemas/, examples/)
  questions/          (Handoff/question-bank copied unchanged: general.json, pack-*.json, schema.json)
  scripts/            cpu-baseline.ps1  build-signed-debug.sh
  .github/workflows/ci.yml
  src/
    main.tsx  App.tsx  m0/M0Check.tsx  styles/tokens.css  assets/
    __tests__/handoff.test.ts
  src-tauri/
    Cargo.toml  build.rs  tauri.conf.json  tauri.macos.conf.json  Entitlements.plist  Info.plist
    capabilities/default.json   icons/ (from tauri icon)
    src/
      main.rs  lib.rs  paths.rs  commands.rs
      platform/{mod.rs, macos/permissions.rs, windows/permissions.rs}
      recorder/{mod,clock,feed,levels,mic,pipeline,resample,source,timeline,wav,capture}.rs
      speech/{mod,models,download,vad,engine,whisper,words,transcribe}.rs
      keys.rs
      ai/{mod.rs, providers.rs}
```

---

### Task 1: Scaffold the Tauri + React app

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`

- [ ] **Step 1: Copy the build configs that carry no Talaan identity**

```bash
cd ~/Developer/Ensayo
T=~/Developer/Talaan
cp $T/vite.config.ts $T/tsconfig.json $T/tsconfig.node.json $T/src-tauri/build.rs .
mv build.rs src-tauri/build.rs
mkdir -p src src-tauri/src src-tauri/capabilities
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "ensayo",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "test": "vitest run"
  },
  "dependencies": {
    "@tauri-apps/api": "^2",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.3.3",
    "@tauri-apps/cli": "^2",
    "@types/node": "^26.6.5",
    "@types/react": "^19.1.8",
    "@types/react-dom": "^19.1.6",
    "@vitejs/plugin-react": "^6.0.2",
    "tailwindcss": "^4.3.3",
    "typescript": "~6.0.3",
    "vite": "^8.0.16",
    "vitest": "^5.0.4"
  }
}
```

(Same versions as Talaan, which are known to work together.)

- [ ] **Step 3: Write `index.html`, `src/main.tsx`, `src/App.tsx`**

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ensayo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`src/App.tsx`:
```tsx
export default function App() {
  return <main style={{ padding: 32 }}>Ensayo</main>;
}
```

- [ ] **Step 4: Write `src-tauri/Cargo.toml`**

```toml
[package]
name = "ensayo"
version = "0.0.1"
description = "Interview rehearsal app"
authors = ["Miguel Monzones"]
edition = "2024"

[lib]
name = "ensayo_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["image-png", "macos-private-api"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2.0.21"
dirs = "7.0.0"
log = "0.4.34"
cpal = "0.18.2"
rtrb = "0.4.0"
rubato = "5.0.1"
hound = "3.5.1"
whisper-rs = "0.16.0"
parakeet-rs = "0.3.8"
# parakeet-rs 0.3.8 does not build against ort 2.0.0-rc.14; keep rc.13 until it does (same pin as Talaan).
ort = { version = "=2.0.0-rc.13", default-features = false }
reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "blocking", "json"] }
sha2 = "0.10.9"
keyring = "3.6.3"

[dev-dependencies]
tempfile = "3.27.0"
tiny_http = "0.12.0"

[target.'cfg(target_os = "macos")'.dependencies]
keyring = { version = "3.6.3", features = ["apple-native"] }
whisper-rs = { version = "0.16.0", features = ["metal"] }
objc2 = "0.6.5"
objc2-av-foundation = "0.3.2"
objc2-foundation = "0.3.2"
block2 = "0.6.2"

[target.'cfg(target_os = "windows")'.dependencies]
keyring = { version = "3.6.3", features = ["windows-native"] }
winreg = "0.56.0"

[profile.release]
codegen-units = 1
lto = true
opt-level = 3
strip = true

# Dependencies are always optimized, even in debug builds: whisper.cpp (built through CMake, which follows
# opt-level) and the audio math are 10x+ slower unoptimized. Ensayo's own code stays fast to compile.
[profile.dev.package."*"]
opt-level = 3
```

(The `objc2*`/`block2` and `winreg` entries are exactly what Task 12's microphone-permission code needs; widen them there if the compiler asks.)

- [ ] **Step 5: Write `src-tauri/tauri.conf.json`, `capabilities/default.json`, `main.rs`, `lib.rs`**

`src-tauri/tauri.conf.json`:
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Ensayo",
  "version": "0.0.1",
  "identifier": "com.craftconceptsdigital.ensayo",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      { "label": "main", "title": "Ensayo", "width": 1200, "height": 780, "minWidth": 900, "minHeight": 600 }
    ],
    "security": { "csp": null },
    "macOSPrivateApi": true
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"]
  }
}
```

`src-tauri/capabilities/default.json`:
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Main window",
  "windows": ["main"],
  "permissions": ["core:default"]
}
```

`src-tauri/src/main.rs`:
```rust
// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ensayo_lib::run()
}
```

`src-tauri/src/lib.rs`:
```rust
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Ensayo");
}
```

- [ ] **Step 6: Icons need an input file; use the final logo now**

```bash
D="/Users/miguel.monzones/My Drive (mikeymonzones@gmail.com)/MAIN DRIVE - Miguel/FILES - Projects & Work/Ensayo/Design"
npm install
npx tauri icon "$D/logo/png/icon/ensayo-icon-1024.png"
```
Expected: `src-tauri/icons/` now holds `icon.icns`, `icon.ico`, `32x32.png`, `128x128.png`, `128x128@2x.png` and more.

- [ ] **Step 7: Verify it builds**

Run: `npm run build && cargo check --manifest-path src-tauri/Cargo.toml`
Expected: Vite prints `built in …` and cargo ends with `Finished`. (First cargo run compiles whisper.cpp; allow several minutes.)

- [ ] **Step 8: Write `.gitignore` and commit**

```bash
cp ~/Developer/Talaan/.gitignore .gitignore
git add -A
git commit -m "chore: scaffold Tauri 2 + React app with the Ensayo icon

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Repo hygiene, platform folders and notices

**Files:**
- Create: `THIRD_PARTY_NOTICES.md`, `README.md` (overwrite stub), `src-tauri/src/platform/mod.rs`, `src-tauri/src/platform/macos/mod.rs`, `src-tauri/src/platform/windows/mod.rs`

- [ ] **Step 1: Platform module skeleton (filled in Task 12)**

`src-tauri/src/platform/mod.rs`:
```rust
//! Everything that differs between Mac and Windows lives in `macos/` and `windows/`.

#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(target_os = "windows")]
pub mod windows;

#[cfg(target_os = "macos")]
pub use macos::*;
#[cfg(target_os = "windows")]
pub use windows::*;
```

`src-tauri/src/platform/macos/mod.rs` and `windows/mod.rs` each contain only:
```rust
pub mod permissions;
```
(Create empty `permissions.rs` in each for now; Task 12 fills them.)

Add `mod platform;` to `lib.rs`.

- [ ] **Step 2: `THIRD_PARTY_NOTICES.md`**

Start from the library and model entries in `~/Developer/Talaan/THIRD_PARTY_NOTICES.md`. Keep only entries for things Ensayo ships at M0: Tauri, whisper.cpp / whisper-rs, parakeet-rs, ONNX Runtime (`ort`), cpal, rubato, hound, keyring, reqwest, React, Vite, Tailwind, Plus Jakarta Sans, Outfit, Poppins, OpenAI Whisper models, NVIDIA Parakeet (CC-BY-4.0, attribution required), Silero VAD. Drop Qwen, Llama, diarization, llama.cpp (arrive at M4). Do not list Parla, Parlato or any app. Add the line `Talaan engine source commit: 932fb91 (Miguel Monzones, MIT)` at the top.

- [ ] **Step 3: `README.md`**

```markdown
# Ensayo

Interview rehearsal app. Answer out loud, get one fix, answer again. Mac and Windows.

Private repo. Decisions and the build plan live in Notion ("Ensayo (Interview Practice App)").
Code lives here, outside Google Drive: `~/Developer/Ensayo` (Mac), `C:\Dev\Ensayo` (PC).
See `CLAUDE.md` for setup and commands.
```

- [ ] **Step 4: Verify and commit**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: `Finished`.

```bash
git add -A
git commit -m "chore: platform folders, notices, README

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Theme tokens, bundled fonts

**Files:**
- Create: `src/styles/tokens.css`, `src/__tests__/tokens.test.ts`
- Modify: `package.json`, `src/main.tsx`

- [ ] **Step 1: Write the failing test** (`src/__tests__/tokens.test.ts`) — every value in the design's `tokens.json` must appear in `tokens.css`, so the Tailwind theme cannot drift from the design.

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DESIGN = "/Users/miguel.monzones/My Drive (mikeymonzones@gmail.com)/MAIN DRIVE - Miguel/FILES - Projects & Work/Ensayo/Design/styles/tokens.json";

describe("theme tokens", () => {
  const css = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8").toLowerCase();

  it("uses the primary and ground colours from the design", () => {
    expect(css).toContain("#b8432c");
    expect(css).toContain("#f6f6f7");
  });

  it("carries every colour in the design token file", () => {
    let tokens: Record<string, { value: string }>;
    try {
      tokens = JSON.parse(readFileSync(DESIGN, "utf8"));
    } catch {
      return; // the Drive folder is not mounted on this machine (CI): the two checks above still run
    }
    for (const [name, t] of Object.entries(tokens)) {
      if (name.startsWith("_") || !t.value.startsWith("#")) continue;
      expect(css, name).toContain(t.value.toLowerCase());
    }
  });

  it("never loads fonts from the internet", () => {
    expect(css).not.toContain("fonts.googleapis.com");
    expect(css).not.toContain("http");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `npm test`
Expected: FAIL, `ENOENT … tokens.css`.

- [ ] **Step 3: Install the bundled fonts and write `src/styles/tokens.css`**

```bash
npm install @fontsource-variable/plus-jakarta-sans @fontsource-variable/outfit @fontsource/poppins
```

`src/styles/tokens.css` (values copied from `Design/styles/tokens.json`; names are the readable ones):
```css
@import "tailwindcss";
@import "@fontsource-variable/plus-jakarta-sans";
@import "@fontsource-variable/outfit";
@import "@fontsource/poppins/500.css";

@theme {
  --color-background: #F6F6F7;
  --color-card: #FFFFFF;
  --color-brand-tint: #FCEEE6;
  --color-line: #E6E6E9;
  --color-text: #2B2722;
  --color-text-muted: #5B5960;
  --color-brand: #B8432C;
  --color-on-brand: #FFFFFF;
  --color-brand-dark: #9A3622;
  --color-coach-note: #B8432C;
  --color-win-text: #B86A0C;
  --color-to-check-bg: #EEF0F4;
  --color-to-check-text: #3D4555;
  --color-delete: #B42318;
  --color-fixed: #2F7A55;
  --color-fixed-bg: #E7F2EC;
  --color-win-gold: #F2A33A;
  --color-evidence: #FFF1C7;
  --font-ui: "Plus Jakarta Sans Variable", system-ui, sans-serif;
  --font-coach: "Outfit Variable", system-ui, sans-serif;
  --font-coffee: "Poppins", system-ui, sans-serif;
  --radius-lg: 24px;
  --radius-md: 16px;
  --radius-sm: 12px;
  --shadow-card: 0 1px 2px rgba(43, 39, 34, 0.06);
}

:root {
  --sunrise: linear-gradient(135deg, #E8603C 0%, #F2A33A 100%);
  --glow: linear-gradient(135deg, #FDE7D9 0%, #FFF3DC 100%);
}

body {
  background: var(--color-background);
  color: var(--color-text);
  font-family: var(--font-ui);
}
```

Add `import "./styles/tokens.css";` as the first import in `src/main.tsx`.

- [ ] **Step 4: Run tests and build, expect PASS**

Run: `npm test && npm run build`
Expected: `3 passed`; build succeeds; `dist/assets` contains `.woff2` files (fonts are bundled, not fetched).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: Tailwind theme from design tokens, bundled fonts

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Copy the recorder pieces

**Files:**
- Create (copied): `src-tauri/src/recorder/{clock,feed,levels,mic,pipeline,resample,source,timeline,wav}.rs`, `recorder/mod.rs`
- Not copied: `engine.rs`, `session.rs`, `recovery.rs`, `playback.rs`

- [ ] **Step 1: Copy**

```bash
T=~/Developer/Talaan/src-tauri/src
mkdir -p src-tauri/src/recorder
for f in clock feed levels mic pipeline resample source timeline wav; do cp $T/recorder/$f.rs src-tauri/src/recorder/; done
```

- [ ] **Step 2: Write `recorder/mod.rs`**

```rust
//! Mic capture: the chosen input device, resampled to 16 kHz mono, written to a WAV. Cross-platform; OS code lives in `platform/`.

pub mod capture;
pub mod clock;
pub mod feed;
pub mod levels;
pub mod mic;
pub mod pipeline;
pub mod resample;
pub mod source;
pub mod timeline;
pub mod wav;
```
(`capture` is created in Task 5; create an empty `capture.rs` now so this compiles.)

- [ ] **Step 3: Remove the Talaan couplings**

- `mic.rs`: replace `crate::i18n::tr("recorder.no_mic_found")` with `"No microphone found".to_string()`; replace `crate::logging::text(e)` with `e` (use `log::warn!("mic stream error: {e}")`). In the `#[cfg(test)]` module, `crate::platform::host_now_ns` and `crate::storage::Storage` are used by the two hardware smoke tests (`mic_smoke`, `mic_clock_smoke`): delete those two tests (Task 5's `Capture` test and Task 14's manual check cover the mic).
- `wav.rs`: delete `repair_wav` and `wav_duration_ms` and their tests only if they reference `crate::storage`; otherwise keep (they are pure). Run the compile to see.
- Scrub any comment that names Parlato.

- [ ] **Step 4: Add `mod recorder;` to `lib.rs` and verify the copied tests pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml recorder::`
Expected: tests for `clock`, `feed`, `levels`, `pipeline`, `resample`, `timeline`, `wav` pass (about 25 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: copy Talaan mic capture pieces (source Talaan 932fb91)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Mic-only `Capture`

One recording = one answer. Modelled on Talaan's `spawn_writer`, for a single track, no pauses, no storage.

**Files:**
- Create: `src-tauri/src/recorder/capture.rs`

- [ ] **Step 1: Write the failing test** (bottom of `capture.rs`)

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::recorder::source::SharedFeed;
    use std::sync::atomic::AtomicBool;

    /// A mic that "speaks" a 440 Hz tone for `secs` seconds as 10 ms stereo buffers at 48 kHz.
    struct ToneMic {
        secs: u32,
        done: Arc<AtomicBool>,
    }

    impl AudioSource for ToneMic {
        fn start(&mut self, feed: SharedFeed) -> Result<String, String> {
            let (secs, done) = (self.secs, self.done.clone());
            std::thread::spawn(move || {
                let frames = 480usize;
                let mut n: u64 = 0;
                for _ in 0..secs * 100 {
                    let mut buf = Vec::with_capacity(frames * 2);
                    for i in 0..frames {
                        let t = (n * frames as u64 + i as u64) as f32 / 48_000.0;
                        let s = (t * 440.0 * std::f32::consts::TAU).sin() * 0.5;
                        buf.push(s);
                        buf.push(s);
                    }
                    feed.lock().unwrap().push(10_000_000 * n, 48_000, 2, &buf);
                    n += 1;
                }
                done.store(true, Ordering::Release);
            });
            Ok("Test mic".into())
        }
        fn restart(&mut self) -> Result<String, String> {
            Ok("Test mic".into())
        }
        fn stop(&mut self) {}
    }

    #[test]
    fn one_second_of_tone_becomes_a_one_second_wav() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("answer.wav");
        let done = Arc::new(AtomicBool::new(false));
        let cap = Capture::start(Box::new(ToneMic { secs: 1, done: done.clone() }), &path).unwrap();
        assert_eq!(cap.mic_name(), "Test mic");
        while !done.load(Ordering::Acquire) {
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        let rec = cap.stop().unwrap();
        assert!((950..=1050).contains(&rec.duration_ms), "duration {} ms", rec.duration_ms);
        assert_eq!(rec.path, path);
        let samples = crate::speech::vad::read_track(&path).unwrap();
        let rms = (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt();
        assert!(rms > 0.2, "the tone should be audible, rms {rms}");
    }

    #[test]
    fn stopping_with_no_audio_is_an_error_not_an_empty_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("none.wav");
        struct Silent;
        impl AudioSource for Silent {
            fn start(&mut self, _: SharedFeed) -> Result<String, String> {
                Ok("Silent".into())
            }
            fn restart(&mut self) -> Result<String, String> {
                Ok("Silent".into())
            }
            fn stop(&mut self) {}
        }
        let cap = Capture::start(Box::new(Silent), &path).unwrap();
        assert!(cap.stop().is_err());
    }
}
```

(`crate::speech::vad::read_track` arrives in Task 6. To keep Task 5 independent, temporarily read the WAV with `hound::WavReader::open(&path)` and collect `i16 / 32768.0`; switch to `read_track` in Task 6 if you like. Use hound in this task.)

- [ ] **Step 2: Run it, expect FAIL**

Run: `cargo test --manifest-path src-tauri/Cargo.toml recorder::capture`
Expected: FAIL, `cannot find struct Capture`.

- [ ] **Step 3: Implement** (top of `capture.rs`)

```rust
//! One answer: mic -> feed -> 16 kHz mono pipeline -> WAV. The writer thread is Talaan's `spawn_writer` for one
//! track: no pauses, no meeting storage. The recording clock starts at the first buffer, so positions start at 0.

use super::clock::Clock;
use super::feed::feed;
use super::pipeline::TrackPipeline;
use super::source::{AudioSource, SharedFeed};
use super::wav::WavSink;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

pub struct Capture {
    mic: Box<dyn AudioSource>,
    mic_name: String,
    path: PathBuf,
    stop: Arc<AtomicBool>,
    level: Arc<AtomicU32>,
    started: Instant,
    writer: JoinHandle<io::Result<u64>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Recorded {
    pub path: PathBuf,
    pub duration_ms: u64,
}

impl Capture {
    pub fn start(mut mic: Box<dyn AudioSource>, path: &Path) -> Result<Capture, String> {
        let (producer, mut consumer) = feed();
        let shared: SharedFeed = Arc::new(Mutex::new(producer));
        let stop = Arc::new(AtomicBool::new(false));
        let level = Arc::new(AtomicU32::new(0));
        let mut pipeline = TrackPipeline::new(WavSink::create(path).map_err(|e| format!("Couldn't create the recording: {e}"))?);

        let (stop_w, level_w) = (stop.clone(), level.clone());
        let writer = std::thread::Builder::new()
            .name("ensayo-writer".into())
            .spawn(move || {
                let mut buf = Vec::new();
                let mut clock: Option<Clock> = None;
                let mut last_level = Instant::now();
                loop {
                    let mut got = false;
                    while let Some(h) = consumer.pop(&mut buf) {
                        got = true;
                        let clock = clock.get_or_insert_with(|| Clock::new(h.host_ns));
                        pipeline.push(clock.position_samples(h.host_ns), h.rate, h.channels as usize, &buf)?;
                    }
                    if last_level.elapsed() >= Duration::from_millis(50) {
                        level_w.store(pipeline.level().to_bits(), Ordering::Relaxed);
                        last_level = Instant::now();
                    }
                    if stop_w.load(Ordering::Acquire) && consumer.is_empty() {
                        let end = pipeline.written();
                        pipeline.finish(end)?;
                        let written = pipeline.written();
                        pipeline.into_sink().finalize()?;
                        return Ok(written);
                    }
                    if !got {
                        std::thread::sleep(Duration::from_millis(5));
                    }
                }
            })
            .map_err(|e| e.to_string())?;

        let mic_name = match mic.start(shared) {
            Ok(name) => name,
            Err(e) => {
                stop.store(true, Ordering::Release);
                let _ = writer.join();
                let _ = std::fs::remove_file(path);
                return Err(e);
            }
        };
        Ok(Capture { mic, mic_name, path: path.to_path_buf(), stop, level, started: Instant::now(), writer })
    }

    pub fn mic_name(&self) -> &str {
        &self.mic_name
    }

    /// Loudness 0..1 for the level meter.
    pub fn level(&self) -> f32 {
        f32::from_bits(self.level.load(Ordering::Relaxed))
    }

    pub fn elapsed_ms(&self) -> u64 {
        self.started.elapsed().as_millis() as u64
    }

    /// Stops the mic, flushes the file and returns where it is. No audio at all is an error, never an empty file.
    pub fn stop(mut self) -> Result<Recorded, String> {
        self.mic.stop();
        self.stop.store(true, Ordering::Release);
        let samples = self.writer.join().map_err(|_| "The recorder stopped unexpectedly".to_string())?.map_err(|e| e.to_string())?;
        if samples == 0 {
            let _ = std::fs::remove_file(&self.path);
            return Err("No audio came from the microphone".into());
        }
        Ok(Recorded { path: self.path, duration_ms: samples * 1000 / super::clock::RATE as u64 })
    }
}
```

Note: `host_ns` in the test grows by 10 ms per buffer, matching real device time; if `Clock::position_samples` rejects the first buffer (returns `None`), read `clock.rs` and fix the start time rather than the test.

- [ ] **Step 4: Run tests, expect PASS**

Run: `cargo test --manifest-path src-tauri/Cargo.toml recorder::capture`
Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: mic-only Capture (one answer to one WAV)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Copy the speech catalog, downloader and VAD

**Files:**
- Create (copied, then edited): `src-tauri/src/speech/{models,download,vad}.rs`, `speech/mod.rs`, `src-tauri/src/paths.rs`

- [ ] **Step 1: Copy**

```bash
T=~/Developer/Talaan/src-tauri/src
mkdir -p src-tauri/src/speech
for f in models download vad; do cp $T/transcriber/$f.rs src-tauri/src/speech/; done
```

- [ ] **Step 2: Write `speech/mod.rs`**

```rust
//! Speech to text: the model catalog and downloads, voice detection, engines that return words, and the file pipeline.

pub mod download;
pub mod engine;
pub mod models;
pub mod transcribe;
pub mod vad;
pub mod whisper;
pub mod words;
```
(Create empty `engine.rs`, `whisper.rs`, `words.rs`, `transcribe.rs` now; Tasks 7 and 8 fill them. Add `mod speech;` to `lib.rs`.)

- [ ] **Step 3: Write `paths.rs`** — models and audio are machine-local (Build Plan, Data model)

```rust
//! Machine-local folders. Models and answer audio never go in the user's data folder (it may be synced).

use std::path::PathBuf;

pub const BUNDLE_ID: &str = "com.craftconceptsdigital.ensayo";

/// `~/Library/Application Support/<id>` on the Mac, `%LOCALAPPDATA%\<id>` on Windows.
pub fn app_local() -> PathBuf {
    dirs::data_local_dir().unwrap_or_else(|| PathBuf::from(".")).join(BUNDLE_ID)
}

pub fn models_dir() -> PathBuf {
    app_local().join("models")
}

pub fn audio_dir() -> PathBuf {
    app_local().join("audio")
}
```
(Add `mod paths;` to `lib.rs`.)

- [ ] **Step 4: Write the failing test for model reuse from Talaan only** (in `models.rs` tests, replacing the Parlato-based reuse tests)

```rust
    #[test]
    fn reuses_a_model_downloaded_by_talaan_and_never_looks_elsewhere() {
        let tmp = tempfile::tempdir().unwrap();
        let ensayo = tmp.path().join("ensayo-models");
        let talaan = tmp.path().join("talaan-models");
        let m = find("whisper-tiny").unwrap();
        // Talaan's own layout: <models root>/<model id>/<file>
        let dir = talaan.join(m.id);
        std::fs::create_dir_all(&dir).unwrap();
        for f in m.files {
            std::fs::write(dir.join(f.name), vec![0u8; f.size as usize]).unwrap();
        }
        let store = ModelStore { root: ensayo, talaan_root: Some(talaan), reuse: true };
        assert!(matches!(store.locate(m), Location::OnThisComputer(_)));
        let off = ModelStore { reuse: false, ..store };
        assert!(matches!(off.locate(m), Location::Missing));
    }
```
(Pick the smallest catalog model for the test file sizes: whisper-tiny is about 32 MB of zeros; if that is too heavy for CI, write the test with a `ModelInfo` literal of three bytes instead.)

- [ ] **Step 5: Run it, expect FAIL**

Run: `cargo test --manifest-path src-tauri/Cargo.toml speech::models`
Expected: FAIL (compile error: `talaan_root` is not a field).

- [ ] **Step 6: Edit `models.rs` to Ensayo's shape**

Make these changes:

1. **Keep** `EngineKind::{Parakeet, ParakeetUnified, Nemotron, Whisper}` and `is_speech`. **Delete** `Llm`, `Diarization`, `Embedding`, the `DIARIZATION` and `SEARCH` statics, and every catalog entry whose engine is not speech. The `VAD` static stays (its `engine` is `Whisper`). Update the `match` in `find` accordingly.
2. **Delete** the `reuse_dirs` field from `ModelInfo` and from every entry (it pointed at Parlato's layout).
3. **Delete** `legacy_root`, `set_models_root`, `local_models_root`, `models_root`, `default_reuse_roots`, `with_root` and the `relocate` idea. Replace `ModelStore` and `Location` with:

```rust
#[derive(Debug, Clone)]
pub enum Location {
    /// Ensayo's own copy (downloaded by Ensayo).
    Own(PathBuf),
    /// A copy Talaan already downloaded, used read-only and shown as "On this computer".
    OnThisComputer(PathBuf),
    Missing,
}

impl Location {
    pub fn dir(&self) -> Option<&Path> {
        match self {
            Location::Own(d) | Location::OnThisComputer(d) => Some(d),
            Location::Missing => None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ModelStore {
    pub root: PathBuf,
    /// Talaan's models folder (`<root>/<model id>/<files>`), if it exists on this computer.
    pub talaan_root: Option<PathBuf>,
    pub reuse: bool,
}

impl ModelStore {
    pub fn new(root: PathBuf, reuse: bool) -> Self {
        ModelStore { root, talaan_root: talaan_models_root(), reuse }
    }

    pub fn own_dir(&self, m: &ModelInfo) -> PathBuf {
        self.root.join(m.id)
    }

    pub fn locate(&self, m: &ModelInfo) -> Location {
        let own = self.own_dir(m);
        if complete(&own, m) {
            return Location::Own(own);
        }
        if self.reuse {
            if let Some(root) = &self.talaan_root {
                let dir = root.join(m.id);
                if complete(&dir, m) {
                    return Location::OnThisComputer(dir);
                }
            }
        }
        Location::Missing
    }
}

/// Talaan keeps its models in `<its data folder>/models` on the Mac and `%LOCALAPPDATA%\<its bundle id>\models`
/// on Windows (verified in Talaan's `transcriber/models.rs`).
fn talaan_models_root() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        dirs::data_local_dir().map(|d| d.join("com.craftconceptsdigital.talaan").join("models"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        dirs::data_dir().map(|d| d.join("Talaan").join("models"))
    }
}
```

   Keep `complete()`. Delete the Parlato-folder tests and any test of `legacy_root`/`relocate`.
4. Fix any caller in `download.rs`: it takes `&ModelInfo` and a `&Path`, so it needs no store; remove its `crate::i18n::{tr, tr_err, tr_with}` use by inlining the English strings (read `i18n.rs` for each key).
5. `vad.rs` needs no edits (it depends only on `whisper_rs`).
6. Scrub Parlato mentions from comments.

- [ ] **Step 7: Run all speech tests, expect PASS**

Run: `cargo test --manifest-path src-tauri/Cargo.toml speech::`
Expected: `models`, `download` (uses `tiny_http`) and `vad` tests pass, including the new reuse test.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: copy Talaan speech catalog, downloader and VAD; reuse only Talaan's models

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Word-level timestamps

**Files:**
- Create: `src-tauri/src/speech/words.rs`, `src-tauri/src/speech/whisper.rs`
- Create (copied, then edited): `src-tauri/src/speech/engine.rs` (from `transcriber/engine.rs`)

- [ ] **Step 1: Write the failing tests** (`speech/words.rs`)

The pure part: Whisper with `max_len=1` can emit a bare punctuation piece or split a word; Parakeet words arrive clean. One function cleans both.

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn w(text: &str, a: u64, b: u64) -> Word {
        Word { text: text.into(), start_ms: a, end_ms: b }
    }

    #[test]
    fn punctuation_only_pieces_attach_to_the_previous_word() {
        let got = clean(vec![w("Okay", 0, 300), w(".", 300, 320), w("So", 400, 600), w(",", 600, 610)]);
        assert_eq!(got, vec![w("Okay.", 0, 320), w("So,", 400, 610)]);
    }

    #[test]
    fn noise_markers_and_empty_pieces_are_dropped() {
        let got = clean(vec![w("[BLANK_AUDIO]", 0, 500), w("  ", 500, 600), w("(music)", 600, 700), w("Hello", 700, 900)]);
        assert_eq!(got, vec![w("Hello", 700, 900)]);
    }

    #[test]
    fn a_leading_punctuation_piece_is_dropped_not_attached_to_nothing() {
        assert_eq!(clean(vec![w(".", 0, 10), w("Yes", 20, 200)]), vec![w("Yes", 20, 200)]);
    }

    #[test]
    fn times_never_run_backwards() {
        let got = clean(vec![w("one", 100, 50), w("two", 40, 90)]);
        assert!(got.iter().all(|x| x.end_ms >= x.start_ms), "{got:?}");
        assert!(got[1].start_ms >= got[0].end_ms, "{got:?}");
    }

    #[test]
    fn offset_moves_a_chunks_words_onto_the_recording_clock() {
        let got = offset(vec![w("hi", 0, 200), w("there", 250, 500)], 12_000);
        assert_eq!(got, vec![w("hi", 12_000, 12_200), w("there", 12_250, 12_500)]);
    }
}
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cargo test --manifest-path src-tauri/Cargo.toml speech::words`
Expected: FAIL, `cannot find type Word`.

- [ ] **Step 3: Implement `words.rs`**

```rust
//! A transcript is a list of words with start and end times on the recording clock. Everything later (sentences,
//! time to first point, tail length, fillers) is computed in code from these.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Word {
    pub text: String,
    pub start_ms: u64,
    pub end_ms: u64,
}

/// Text engines emit for non-speech ("[BLANK_AUDIO]", "(music)", "*laughs*") or nothing at all.
pub fn is_noise(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() {
        return true;
    }
    let wrapped = |o: char, c: char| t.starts_with(o) && t.ends_with(c);
    wrapped('[', ']') || wrapped('(', ')') || wrapped('*', '*')
}

fn is_punctuation(text: &str) -> bool {
    let t = text.trim();
    !t.is_empty() && t.chars().all(|c| !c.is_alphanumeric())
}

/// Drops noise, glues punctuation-only pieces to the word before them, and keeps times in order.
pub fn clean(raw: Vec<Word>) -> Vec<Word> {
    let mut out: Vec<Word> = Vec::with_capacity(raw.len());
    for mut w in raw {
        w.text = w.text.trim().to_string();
        if is_noise(&w.text) {
            continue;
        }
        if w.end_ms < w.start_ms {
            w.end_ms = w.start_ms;
        }
        if is_punctuation(&w.text) {
            if let Some(prev) = out.last_mut() {
                prev.text.push_str(&w.text);
                prev.end_ms = prev.end_ms.max(w.end_ms);
            }
            continue;
        }
        if let Some(prev) = out.last() {
            if w.start_ms < prev.end_ms {
                w.start_ms = prev.end_ms;
                w.end_ms = w.end_ms.max(w.start_ms);
            }
        }
        out.push(w);
    }
    out
}

/// Moves words from a chunk's own clock onto the recording clock.
pub fn offset(words: Vec<Word>, by_ms: u64) -> Vec<Word> {
    words.into_iter().map(|w| Word { start_ms: w.start_ms + by_ms, end_ms: w.end_ms + by_ms, ..w }).collect()
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `cargo test --manifest-path src-tauri/Cargo.toml speech::words`
Expected: `5 passed`.

- [ ] **Step 5: Whisper words** (`speech/whisper.rs`; adapted from Talaan's `stt/src/lib.rs`, without the GPU device code)

```rust
//! Whisper through whisper.cpp, returning words. One word per segment (`max_len = 1`, `split_on_word`) is
//! whisper.cpp's documented way to get word timestamps.

use super::words::{clean, Word};

/// Speech threads: Mac all cores (2..=8); Windows three quarters of the logical cores (2..=12). Measured in Talaan
/// on a 16-thread Ryzen: 12 threads is fastest and 16 is 2-3x slower.
pub fn thread_count(logical: usize, windows: bool) -> usize {
    if windows { (logical * 3 / 4).clamp(2, 12) } else { logical.clamp(2, 8) }
}

pub fn threads() -> usize {
    thread_count(std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4), cfg!(windows))
}

pub fn context_params(use_gpu: bool, flash_attn: bool) -> whisper_rs::WhisperContextParameters<'static> {
    let mut p = whisper_rs::WhisperContextParameters::default();
    p.use_gpu(use_gpu);
    p.flash_attn(flash_attn);
    p
}

/// One chunk (16 kHz mono) to words relative to the chunk, and the language Whisper settled on.
pub fn transcribe_words(state: &mut whisper_rs::WhisperState, samples: &[f32], language: Option<&str>) -> Result<(Vec<Word>, Option<String>), String> {
    let mut params = whisper_rs::FullParams::new(whisper_rs::SamplingStrategy::Greedy { best_of: 1 });
    params.set_n_threads(threads() as i32);
    params.set_language(Some(language.unwrap_or("en")));
    // Each chunk stands alone: carrying text between chunks is how Whisper starts repeating itself.
    params.set_no_context(true);
    params.set_suppress_blank(true);
    params.set_suppress_nst(true);
    params.set_token_timestamps(true);
    params.set_split_on_word(true);
    params.set_max_len(1);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    // Whisper needs at least 1 s; pad short chunks with silence.
    let mut audio = samples.to_vec();
    if audio.len() < 16_000 + 1_600 {
        audio.resize(16_000 + 1_600, 0.0);
    }
    state.full(params, &audio).map_err(|e| format!("transcription failed: {e}"))?;
    let language = whisper_rs::get_lang_str(state.full_lang_id_from_state()).map(str::to_string);
    let chunk_ms = samples.len() as u64 * 1000 / 16_000;
    let mut raw = vec![];
    for i in 0..state.full_n_segments() {
        let Some(seg) = state.get_segment(i) else { continue };
        if seg.no_speech_probability() > 0.8 {
            continue;
        }
        let text = seg.to_str_lossy().map(|t| t.to_string()).unwrap_or_default();
        // Centiseconds.
        let start_ms = (seg.start_timestamp().max(0) * 10) as u64;
        let end_ms = ((seg.end_timestamp().max(0) * 10) as u64).min(chunk_ms).max(start_ms);
        raw.push(Word { text, start_ms: start_ms.min(chunk_ms), end_ms });
    }
    Ok((clean(raw), language))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_thread_count_is_three_quarters_clamped() {
        for (logical, want) in [(16, 12), (8, 6), (4, 3), (2, 2), (1, 2), (32, 12)] {
            assert_eq!(thread_count(logical, true), want, "{logical} cores");
        }
    }

    #[test]
    fn mac_thread_count_is_all_cores_clamped() {
        for (logical, want) in [(16, 8), (10, 8), (8, 8), (4, 4), (2, 2), (1, 2)] {
            assert_eq!(thread_count(logical, false), want, "{logical} cores");
        }
    }
}
```
Note: the language is fixed to English in v0 (Build Plan), hence the `"en"` default.

- [ ] **Step 6: Engine trait returning words** (`speech/engine.rs`)

```bash
cp ~/Developer/Talaan/src-tauri/src/transcriber/engine.rs src-tauri/src/speech/engine.rs
```
Edit it:
1. Replace `Piece` and `ChunkResult { pieces, language }` with `ChunkResult { words: Vec<Word>, language: Option<String> }` (import `super::words::Word`). Delete `Piece`.
2. `load()` now matches only the four speech engines (the `Llm | Diarization | Embedding` arm is gone). `use_gpu` stays (Metal on the Mac: `context_params(use_gpu, cfg!(target_os = "macos") && use_gpu)`).
3. `WhisperEngine::transcribe` calls `super::whisper::transcribe_words(&mut self.state, samples, language)`; delete the `talaan_stt` import and `is_noise` re-export (use `super::words::is_noise`).
4. `ParakeetEngine::run`: change `TimestampMode::Sentences` to `TimestampMode::Words`, and map each token to a `Word { text, start_ms, end_ms }` (same `shift` for the 500 ms padding), then `clean(...)`. The resume-from-where-it-stopped loop stays, working on `words` and `end_ms`.
5. Delete `NvidiaModel`'s `sortformer`-only paths if the compiler complains (the `sortformer` feature is not enabled in Ensayo's `Cargo.toml`).
6. Keep Talaan's tests that need no model files; delete any that reference `Piece`, or port them to `Word`.

- [ ] **Step 7: Run, expect PASS**

Run: `cargo test --manifest-path src-tauri/Cargo.toml speech::`
Expected: all pass. (Real-model behaviour is checked in Task 8's smoke test and Task 14.)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: word-level timestamps from Whisper and Parakeet

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `transcribe_wav`

**Files:**
- Create: `src-tauri/src/speech/transcribe.rs`

- [ ] **Step 1: Write the failing test**

A fake engine and a fake detector keep this unit test model-free. `transcribe_with` takes the speech spans as an argument; the real wrapper (`transcribe_wav`) runs the VAD.

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::speech::engine::{ChunkResult, Engine};
    use crate::speech::vad::{Shape, Span};
    use crate::speech::words::Word;

    /// Says one word per chunk, at the start of the chunk.
    struct OneWordEach(&'static str);

    impl Engine for OneWordEach {
        fn transcribe(&mut self, _samples: &[f32], _language: Option<&str>) -> Result<ChunkResult, String> {
            Ok(ChunkResult { words: vec![Word { text: self.0.into(), start_ms: 0, end_ms: 200 }], language: Some("en".into()) })
        }
        fn label(&self) -> &str {
            "Fake"
        }
        fn chunking(&self) -> Shape {
            Shape::whisper()
        }
    }

    #[test]
    fn words_land_on_the_recording_clock_at_their_chunks_start() {
        // two speech spans: 1.0-2.0 s and 5.0-6.0 s, in a 7 s recording
        let samples = vec![0.1f32; 7 * 16_000];
        let spans = vec![Span { start: 16_000, end: 32_000 }, Span { start: 80_000, end: 96_000 }];
        let t = transcribe_with(&mut OneWordEach("hello"), &samples, &spans).unwrap();
        assert_eq!(t.engine, "Fake");
        assert_eq!(t.duration_ms, 7_000);
        assert_eq!(t.words.iter().map(|w| (w.start_ms, w.end_ms)).collect::<Vec<_>>(), vec![(1_000, 1_200), (5_000, 5_200)]);
    }

    #[test]
    fn under_three_seconds_of_speech_is_didnt_catch_that() {
        let samples = vec![0.1f32; 2 * 16_000];
        let spans = vec![Span { start: 0, end: 32_000 }];
        let err = transcribe_with(&mut OneWordEach("hi"), &samples, &spans).unwrap_err();
        assert_eq!(err, DIDNT_CATCH_THAT);
    }

    #[test]
    fn no_speech_at_all_is_didnt_catch_that() {
        let samples = vec![0.0f32; 10 * 16_000];
        assert_eq!(transcribe_with(&mut OneWordEach("x"), &samples, &[]).unwrap_err(), DIDNT_CATCH_THAT);
    }

    #[test]
    fn known_whisper_hallucinations_are_stripped() {
        let samples = vec![0.1f32; 5 * 16_000];
        let spans = vec![Span { start: 0, end: 5 * 16_000 }];
        let err = transcribe_with(&mut OneWordEach("Thank you for watching"), &samples, &spans).unwrap_err();
        assert_eq!(err, DIDNT_CATCH_THAT);
    }
}
```
(`Span` has public `start`/`end` sample fields, per Talaan's `vad.rs`. "Thank you for watching" is a single fake word here only to exercise the filter; the real filter matches a phrase across consecutive words, see Step 3.)

- [ ] **Step 2: Run, expect FAIL**

Run: `cargo test --manifest-path src-tauri/Cargo.toml speech::transcribe`
Expected: FAIL, `cannot find function transcribe_with`.

- [ ] **Step 3: Implement**

```rust
//! One recorded answer to a transcript: find speech, cut it into chunks the engine likes, transcribe each chunk,
//! put the words on the recording clock. Build Plan, Scenarios: under 3 s of speech is "didn't catch that" and is
//! not scored; Whisper's silence hallucinations are stripped.

use super::engine::Engine;
use super::vad::{self, Span, Vad, RATE};
use super::words::{offset, Word};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub const DIDNT_CATCH_THAT: &str = "Didn't catch that";
const MIN_SPEECH_MS: u64 = 3_000;

/// Phrases Whisper invents from silence or music (lower case, no punctuation).
const HALLUCINATIONS: &[&str] = &[
    "thank you for watching",
    "thanks for watching",
    "please subscribe",
    "subtitles by the amara org community",
    "thank you",
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Transcript {
    pub words: Vec<Word>,
    pub language: Option<String>,
    pub engine: String,
    pub duration_ms: u64,
}

fn normalised(words: &[Word]) -> String {
    words
        .iter()
        .map(|w| w.text.to_lowercase().chars().filter(|c| c.is_alphanumeric() || c.is_whitespace()).collect::<String>())
        .collect::<Vec<_>>()
        .join(" ")
}

/// A transcript that is only a known hallucination (the whole thing, since real answers are longer).
fn is_hallucination(words: &[Word]) -> bool {
    let text = normalised(words);
    let text = text.trim();
    HALLUCINATIONS.iter().any(|h| text == *h)
}

pub fn transcribe_with(engine: &mut dyn Engine, samples: &[f32], spans: &[Span]) -> Result<Transcript, String> {
    let duration_ms = samples.len() as u64 * 1000 / RATE as u64;
    let speech_ms: u64 = spans.iter().map(|s| s.len() as u64 * 1000 / RATE as u64).sum();
    if speech_ms < MIN_SPEECH_MS {
        return Err(DIDNT_CATCH_THAT.into());
    }
    let chunks = vad::shape(spans, samples, engine.chunking());
    let mut words = vec![];
    let mut language = None;
    for span in chunks {
        let r = engine.transcribe(&samples[span.start..span.end], Some("en"))?;
        language = language.or(r.language);
        words.extend(offset(r.words, span.start_ms()));
    }
    if words.is_empty() || is_hallucination(&words) {
        return Err(DIDNT_CATCH_THAT.into());
    }
    Ok(Transcript { words, language, engine: engine.label().to_string(), duration_ms })
}

/// The real thing: read the WAV, run Silero VAD, transcribe.
pub fn transcribe_wav(wav: &Path, engine: &mut dyn Engine, vad_model: &Path) -> Result<Transcript, String> {
    let samples = vad::read_track(wav).map_err(|e| format!("Couldn't read the recording: {e}"))?;
    let spans = Vad::load(vad_model)?.detect(&samples)?;
    transcribe_with(engine, &samples, &spans)
}
```
Test 4 above uses a one-word hallucination; `is_hallucination` compares the whole normalised text, so `"Thank you for watching"` as one fake word normalises to `thank you for watching` and matches.

- [ ] **Step 4: Run, expect PASS**

Run: `cargo test --manifest-path src-tauri/Cargo.toml speech::transcribe`
Expected: `4 passed`.

- [ ] **Step 5: Add the real-model smoke test (ignored by default)**

Append to `transcribe.rs` tests:

```rust
    /// ENSAYO_SMOKE_WAV=<16 kHz mono wav> ENSAYO_SMOKE_MODEL=<model id, default whisper-tiny> \
    /// cargo test --release --manifest-path src-tauri/Cargo.toml smoke_real_model -- --ignored --nocapture
    #[test]
    #[ignore]
    fn smoke_real_model() {
        use crate::speech::{engine, models};
        let wav = std::env::var("ENSAYO_SMOKE_WAV").expect("set ENSAYO_SMOKE_WAV");
        let id = std::env::var("ENSAYO_SMOKE_MODEL").unwrap_or_else(|_| "whisper-tiny".into());
        let model = models::find(&id).unwrap();
        let store = models::ModelStore::new(crate::paths::models_dir(), true);
        let dir = store.locate(model).dir().expect("model not downloaded").to_path_buf();
        let vad_dir = store.locate(&models::VAD).dir().expect("VAD not downloaded").to_path_buf();
        let mut eng = engine::load(model, &dir, cfg!(target_os = "macos")).unwrap();
        let t = transcribe_wav(Path::new(&wav), eng.as_mut(), &vad_dir.join(models::VAD.files[0].name)).unwrap();
        for w in &t.words {
            println!("{:>7.2}s  {}", w.start_ms as f64 / 1000.0, w.text);
        }
        assert!(t.words.len() > 5);
        assert!(t.words.windows(2).all(|p| p[0].start_ms <= p[1].start_ms), "word times must be in order");
    }
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: transcribe a WAV to timed words, 3 s minimum, hallucination filter

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Key store and cloud provider table

M0 brings the Keychain wrapper and the provider/HTTP basics. Routing, prompts, retries and cost tracking are M4.

**Files:**
- Create: `src-tauri/src/keys.rs`, `src-tauri/src/ai/mod.rs`, `src-tauri/src/ai/providers.rs`

- [ ] **Step 1: Write the failing tests** (`ai/providers.rs`)

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn every_provider_has_a_unique_key_id_and_parses_back() {
        let mut seen = std::collections::HashSet::new();
        for p in Provider::ALL {
            assert!(seen.insert(p.key_id()), "{}", p.key_id());
            assert_eq!(Provider::parse(p.key_id()), Some(p));
        }
        assert_eq!(Provider::parse("nonsense"), None);
    }

    #[test]
    fn auth_headers_differ_per_provider() {
        assert_eq!(auth_headers(Provider::Claude, "k")[0], ("x-api-key".into(), "k".into()));
        assert_eq!(auth_headers(Provider::Gemini, "k")[0], ("x-goog-api-key".into(), "k".into()));
        assert_eq!(auth_headers(Provider::OpenAi, "k")[0], ("Authorization".into(), "Bearer k".into()));
        assert!(auth_headers(Provider::Compatible, "").is_empty());
    }

    #[test]
    fn model_ids_come_from_each_providers_list_shape() {
        let openai = json!({"data": [{"id": "gpt-5-mini"}, {"id": "gpt-5"}]});
        assert_eq!(model_ids(Provider::OpenAi, &openai), vec!["gpt-5-mini", "gpt-5"]);
        let gemini = json!({"models": [{"name": "models/gemini-3-flash"}]});
        assert_eq!(model_ids(Provider::Gemini, &gemini), vec!["gemini-3-flash"]);
    }

    #[test]
    fn a_rejected_key_says_so_in_plain_words() {
        let e = http_error(Provider::OpenAi, 401, &json!({}));
        assert!(matches!(&e, AiError::Unavailable(m) if m.contains("OpenAI") && m.contains("key")), "{e:?}");
    }

    #[test]
    fn a_rate_limit_keeps_the_providers_own_message() {
        let e = http_error(Provider::Groq, 429, &json!({"error": {"message": "slow down"}}));
        assert!(matches!(&e, AiError::Failed(m) if m.contains("slow down")), "{e:?}");
    }

    #[test]
    fn a_local_server_address_becomes_a_v1_base() {
        assert_eq!(compatible_base("localhost:11434"), "http://localhost:11434/v1");
        assert_eq!(compatible_base("http://localhost:1234/v1/"), "http://localhost:1234/v1");
    }
}
```
And in `keys.rs` tests, port Talaan's: `deleting_all_data_covers_every_key` (every `Provider::key_id()` is in `ACCOUNTS`) and `keys_round_trip_and_clear` (uses `keyring::mock::default_credential_builder()` so the test never touches the real Keychain).

- [ ] **Step 2: Run, expect FAIL**

Run: `cargo test --manifest-path src-tauri/Cargo.toml ai:: keys::`
Expected: FAIL (modules do not exist).

- [ ] **Step 3: Implement**

`ai/mod.rs`: `pub mod providers;`

`ai/providers.rs`: copy from `~/Developer/Talaan/src-tauri/src/summarizer/engines.rs` **only** these items, with their tests: `Provider` + `impl Provider` (`ALL`, `parse`, `name`, `key_id`), `catalog`, `default_base`, `compatible_base`, `auth_headers`, `model_ids`, `version`, `recommended_model`, `client`, `send`, `list_models`, `http_error`. **Do not copy** `LocalEngine`, `HttpEngine`, `HttpRequest`, anything using `Prompt`, `SummaryEngine`, `LocalAi`, `LOCAL_CONTEXT`/`CLOUD_CONTEXT`, or the summary schema tests. Then:

1. Define the error type locally (replaces `summarize::EngineError`):
```rust
#[derive(Debug, Clone, PartialEq)]
pub enum AiError {
    /// Can't run at all right now (bad key, no such model, server not running). Nothing to retry.
    Unavailable(String),
    /// The call failed (network, rate limit, refusal). May work next time.
    Failed(String),
}
```
2. Rewrite `http_error` without i18n:
```rust
pub fn http_error(provider: Provider, status: u16, body: &Value) -> AiError {
    let detail = body["error"]["message"].as_str().or_else(|| body["error"].as_str()).or_else(|| body["message"].as_str()).unwrap_or("");
    let name = provider.name();
    match status {
        401 | 403 => AiError::Unavailable(format!("{name} didn't accept this key. Check it in Settings.")),
        404 => AiError::Unavailable(format!("{name} doesn't have that model. {detail}").trim().to_string()),
        429 => AiError::Failed(format!("{name} is busy or the usage limit was reached. {detail}").trim().to_string()),
        _ => AiError::Failed(format!("{name} returned an error ({status}). {detail}").trim().to_string()),
    }
}
```
3. In `client()`, set the user agent to `concat!("Ensayo/", env!("CARGO_PKG_VERSION"))`.
4. Replace the doc comment on `catalog` ("the same set Parlato supports") with "The cloud models offered in Settings for each provider (kept in step with the Talaan Cloud AI Models page in Notion)". Same for the Gemini thinking-level comment if copied.
5. Keep the model lists as they are: they are plain model names, not code.

`keys.rs`: copy from Talaan, then:
```rust
//! API keys for "your own key" feedback, kept in the macOS Keychain (Windows: Credential Manager), never in a
//! file. Service "Ensayo", one account per provider.

use crate::ai::providers::Provider;

const SERVICE: &str = "Ensayo";

fn entry(provider: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, provider).map_err(|e| format!("Couldn't open your system's secure key storage: {e}"))
}

pub fn set(provider: &str, key: &str) -> Result<(), String> {
    entry(provider)?.set_password(key.trim()).map_err(|e| format!("Couldn't save the key: {e}"))
}

pub fn get(provider: &str) -> Option<String> {
    entry(provider).ok()?.get_password().ok().filter(|k| !k.is_empty())
}

pub fn clear(provider: &str) -> Result<(), String> {
    match entry(provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Couldn't remove the key: {e}")),
    }
}

/// Every account Ensayo stores. The Windows uninstaller deletes the same list (added with the installer hooks in M10).
pub const ACCOUNTS: [&str; 8] = ["claude", "openai", "gemini", "groq", "cerebras", "mistral", "openrouter", "compatible"];

/// "Delete all Ensayo data" removes every key too.
pub fn clear_all() {
    for p in ACCOUNTS {
        let _ = clear(p);
    }
}
```
Drop `CALENDAR_ICS`, `notion`, and the `installer-hooks.nsh` test (the hook arrives in M10). Add `mod ai; mod keys;` to `lib.rs`.

- [ ] **Step 4: Run, expect PASS**

Run: `cargo test --manifest-path src-tauri/Cargo.toml ai:: keys::`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: key store (Keychain/Credential Manager) and cloud provider table

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Tauri commands and the M0 check screen

The acceptance harness: record, stop, see words with times, offline. It is also the seed of Settings › Check setup.

**Files:**
- Create: `src-tauri/src/commands.rs`, `src/m0/M0Check.tsx`
- Modify: `src-tauri/src/lib.rs`, `src/App.tsx`

Rule from Talaan: **every command that builds a window or runs long must be `async`** (a sync command freezes the app on Windows WebView2). Heavy work goes through `tauri::async_runtime::spawn_blocking`.

- [ ] **Step 1: Write the failing test** (`commands.rs`) — the one piece with logic is `RecorderState`: only one recording at a time.

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_second_start_while_recording_is_refused() {
        let state = RecorderState::default();
        state.begin().unwrap();
        assert_eq!(state.begin().unwrap_err(), "Already recording");
        state.end();
        assert!(state.begin().is_ok());
    }
}
```

- [ ] **Step 2: Run, expect FAIL**, then **Step 3: Implement**

```rust
//! Tauri commands for the M0 check screen. Long work is async and runs on a blocking thread.

use crate::paths;
use crate::recorder::capture::Capture;
use crate::recorder::mic::{input_devices, MicSource};
use crate::speech::{download, engine, models, transcribe};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct RecorderState {
    active: AtomicBool,
    capture: Mutex<Option<Capture>>,
}

impl RecorderState {
    fn begin(&self) -> Result<(), String> {
        if self.active.swap(true, Ordering::AcqRel) {
            return Err("Already recording".into());
        }
        Ok(())
    }
    fn end(&self) {
        self.active.store(false, Ordering::Release);
    }
}

#[derive(Serialize)]
pub struct ModelStatus {
    id: &'static str,
    name: &'static str,
    size_mb: u64,
    state: &'static str, // "ready" | "on_this_computer" | "missing"
}

#[tauri::command]
pub fn list_input_devices() -> Vec<String> {
    input_devices()
}

#[tauri::command]
pub fn model_status(id: String) -> Result<ModelStatus, String> {
    let m = models::find(&id).ok_or("Unknown model")?;
    let store = models::ModelStore::new(paths::models_dir(), true);
    let state = match store.locate(m) {
        models::Location::Own(_) => "ready",
        models::Location::OnThisComputer(_) => "on_this_computer",
        models::Location::Missing => "missing",
    };
    Ok(ModelStatus { id: m.id, name: m.name, size_mb: m.size() / 1_000_000, state })
}

#[tauri::command]
pub async fn download_model(app: AppHandle, id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let m = models::find(&id).ok_or("Unknown model")?;
        let store = models::ModelStore::new(paths::models_dir(), false);
        let cancel = AtomicBool::new(false);
        // The voice-detection model is tiny and every model needs it.
        for info in [m, &models::VAD] {
            let dir = store.own_dir(info);
            download::download_model(info, &dir, &cancel, &mut |p| {
                let _ = app.emit("model-progress", serde_json::json!({ "id": info.id, "fraction": p }));
            })
            .map_err(|e| e.user_message())?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn start_recording(state: State<'_, RecorderState>, device: Option<String>) -> Result<String, String> {
    state.begin()?;
    let started = (|| {
        std::fs::create_dir_all(paths::audio_dir()).map_err(|e| e.to_string())?;
        let path = paths::audio_dir().join(format!("m0-{}.wav", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)));
        let mic = MicSource::with_device(device.as_deref().unwrap_or(""));
        Capture::start(Box::new(mic), &path)
    })();
    match started {
        Ok(cap) => {
            let name = cap.mic_name().to_string();
            *state.capture.lock().unwrap() = Some(cap);
            Ok(name)
        }
        Err(e) => {
            state.end();
            Err(e)
        }
    }
}

#[derive(Serialize)]
pub struct RecordingLevel {
    level: f32,
    elapsed_ms: u64,
}

#[tauri::command]
pub fn recording_level(state: State<'_, RecorderState>) -> Option<RecordingLevel> {
    state.capture.lock().unwrap().as_ref().map(|c| RecordingLevel { level: c.level(), elapsed_ms: c.elapsed_ms() })
}

#[derive(Serialize)]
pub struct StoppedRecording {
    path: PathBuf,
    duration_ms: u64,
}

#[tauri::command]
pub async fn stop_recording(state: State<'_, RecorderState>) -> Result<StoppedRecording, String> {
    let cap = state.capture.lock().unwrap().take().ok_or("Not recording")?;
    let result = tauri::async_runtime::spawn_blocking(move || cap.stop()).await.map_err(|e| e.to_string())?;
    state.end();
    let rec = result?;
    Ok(StoppedRecording { path: rec.path, duration_ms: rec.duration_ms })
}

#[tauri::command]
pub async fn transcribe_recording(path: PathBuf, model_id: String) -> Result<transcribe::Transcript, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let m = models::find(&model_id).ok_or("Unknown model")?;
        let store = models::ModelStore::new(paths::models_dir(), true);
        let dir = store.locate(m).dir().ok_or("That speech model isn't downloaded yet")?.to_path_buf();
        let vad_dir = store.locate(&models::VAD).dir().ok_or("The voice detection model isn't downloaded yet")?.to_path_buf();
        let mut eng = engine::load(m, &dir, cfg!(target_os = "macos"))?;
        transcribe::transcribe_wav(&path, eng.as_mut(), &vad_dir.join(models::VAD.files[0].name))
    })
    .await
    .map_err(|e| e.to_string())?
}
```

`lib.rs`:
```rust
mod ai;
mod commands;
mod keys;
mod paths;
mod platform;
mod recorder;
mod speech;

pub fn run() {
    tauri::Builder::default()
        .manage(commands::RecorderState::default())
        .invoke_handler(tauri::generate_handler![
            commands::list_input_devices,
            commands::model_status,
            commands::download_model,
            commands::start_recording,
            commands::recording_level,
            commands::stop_recording,
            commands::transcribe_recording,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ensayo");
}
```
(`download_model` for the VAD: `download.rs` writes into the directory passed, so `store.own_dir(&models::VAD)` gives `<models>/vad`, matching how `locate` finds it.)

- [ ] **Step 4: The check screen** (`src/m0/M0Check.tsx`, plain and unstyled beyond the theme; M1 replaces it)

```tsx
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type Word = { text: string; start_ms: number; end_ms: number };
type Transcript = { words: Word[]; language: string | null; engine: string; duration_ms: number };
type ModelStatus = { id: string; name: string; size_mb: number; state: "ready" | "on_this_computer" | "missing" };

const MODEL = "whisper-turbo";
const fmt = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

export default function M0Check() {
  const [model, setModel] = useState<ModelStatus | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [mic, setMic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const refresh = () => invoke<ModelStatus>("model_status", { id: MODEL }).then(setModel);
  useEffect(() => {
    refresh();
    const un = listen<{ fraction: number }>("model-progress", (e) => setProgress(e.payload.fraction));
    return () => { un.then((f) => f()); };
  }, []);

  const download = async () => {
    setError(""); setProgress(0);
    try { await invoke("download_model", { id: MODEL }); } catch (e) { setError(String(e)); }
    setProgress(null); refresh();
  };

  const start = async () => {
    setError(""); setTranscript(null);
    try {
      setMic(await invoke<string>("start_recording", { device: null }));
      setRecording(true);
      timer.current = window.setInterval(async () => {
        const l = await invoke<{ level: number; elapsed_ms: number } | null>("recording_level");
        if (l) { setLevel(l.level); setElapsed(l.elapsed_ms); }
      }, 100);
    } catch (e) { setError(String(e)); }
  };

  const stop = async () => {
    window.clearInterval(timer.current);
    setRecording(false); setLevel(0); setBusy(true);
    try {
      const rec = await invoke<{ path: string; duration_ms: number }>("stop_recording");
      setTranscript(await invoke<Transcript>("transcribe_recording", { path: rec.path, modelId: MODEL }));
    } catch (e) { setError(String(e)); }
    setBusy(false);
  };

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: 32, display: "grid", gap: 20 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Ensayo: M0 check</h1>
      <p>Record a 60-second answer with Wi-Fi off. You should see every word with its start time.</p>

      <section>
        <b>Speech model:</b> {model ? `${model.name} (${model.size_mb} MB) is ${model.state.replace(/_/g, " ")}` : "checking…"}
        {model?.state === "missing" && (
          <button onClick={download} disabled={progress !== null} style={{ marginLeft: 12 }}>
            {progress === null ? "Download" : `Downloading ${Math.round(progress * 100)}%`}
          </button>
        )}
      </section>

      <section style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {!recording ? (
          <button onClick={start} disabled={busy || model?.state === "missing"}>Record</button>
        ) : (
          <button onClick={stop}>Stop</button>
        )}
        {recording && (
          <>
            <span>{mic}</span>
            <span>{(elapsed / 1000).toFixed(1)}s</span>
            <div style={{ width: 160, height: 10, background: "var(--color-line)", borderRadius: 5 }}>
              <div style={{ width: `${Math.min(100, level * 100)}%`, height: "100%", background: "var(--color-brand)", borderRadius: 5 }} />
            </div>
          </>
        )}
        {busy && <span>Listening back…</span>}
      </section>

      {error && <p style={{ color: "var(--color-delete)" }}>{error}</p>}

      {transcript && (
        <section>
          <p>{transcript.words.length} words, {fmt(transcript.duration_ms)} recorded, engine: {transcript.engine}</p>
          <p style={{ lineHeight: 2 }}>
            {transcript.words.map((w, i) => (
              <span key={i} title={`${fmt(w.start_ms)} to ${fmt(w.end_ms)}`} style={{ marginRight: 6 }}>
                <small style={{ color: "var(--color-text-muted)" }}>{fmt(w.start_ms)}</small> {w.text}
              </span>
            ))}
          </p>
        </section>
      )}
    </main>
  );
}
```
`src/App.tsx`: `import M0Check from "./m0/M0Check"; export default function App() { return <M0Check />; }`

- [ ] **Step 5: Verify**

Run: `cargo test --manifest-path src-tauri/Cargo.toml commands:: && npm run build && cargo check --manifest-path src-tauri/Cargo.toml`
Expected: test passes; build and check succeed. Then `npm run tauri dev` opens the window with the model line and Record button (permission and a real recording are checked in Task 14).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: M0 check screen and recording/transcription commands

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Copy the handoff prompts and question bank, validate them in tests

**Files:**
- Create (copied unchanged): `prompts/**`, `questions/**`
- Create: `src/__tests__/handoff.test.ts`
- Modify: `package.json` (dev deps `ajv`, `ajv-formats`)

- [ ] **Step 1: Copy**

```bash
H="/Users/miguel.monzones/My Drive (mikeymonzones@gmail.com)/MAIN DRIVE - Miguel/FILES - Projects & Work/Ensayo/Handoff"
cp -R "$H/prompts" prompts
mkdir -p questions && cp "$H/question-bank/"* questions/
npm install -D ajv ajv-formats
```

- [ ] **Step 2: Write the failing test** — every bank file must satisfy `questions/schema.json`; every expected-output example must satisfy its prompt's schema.

First read `prompts/examples/README.md` and list `prompts/examples/expected/` to see how expected files map to schemas, then encode that mapping in the test. Skeleton:

```ts
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");
const read = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));
const ajv = () => addFormats(new Ajv2020({ allErrors: true, strict: false }));

describe("question bank", () => {
  const validate = ajv().compile(read("questions/schema.json"));
  const files = readdirSync(join(root, "questions")).filter((f) => f.endsWith(".json") && f !== "schema.json");

  it("has the general set and at least one role pack", () => {
    expect(files).toContain("general.json");
    expect(files.some((f) => f.startsWith("pack-"))).toBe(true);
  });

  it.each(files)("%s matches the schema", (f) => {
    const ok = validate(read(`questions/${f}`));
    expect(validate.errors, JSON.stringify(validate.errors)).toBeNull();
    expect(ok).toBe(true);
  });

  it("never reuses a question id across files", () => {
    const ids = files.flatMap((f) => read(`questions/${f}`).questions.map((q: { id: string }) => q.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("prompt schemas", () => {
  const schemaFiles = readdirSync(join(root, "prompts/schemas")).filter((f) => f.endsWith(".schema.json"));

  it("has a schema for each of the eleven prompts", () => {
    expect(schemaFiles.length).toBe(11);
  });

  it.each(schemaFiles)("%s is a valid JSON Schema", (f) => {
    expect(() => ajv().compile(read(`prompts/schemas/${f}`))).not.toThrow();
  });

});

// `examples/expected/*.score.json` hold partial assertions (only listed fields are checked), so they are not
// validated as whole outputs. What must hold: every answer has an expected file, every criterion named exists in
// the score schema, and every verdict is a real one.
describe("score fixtures", () => {
  const scoreSchema = read("prompts/schemas/score-answer.schema.json");
  const criteria: string[] = scoreSchema.properties.criteria.required;
  const answers = readdirSync(join(root, "prompts/examples/answers")).map((f) => f.replace(".json", ""));

  it.each(answers)("%s has an expected score file", (name) => {
    expect(existsSync(join(root, `prompts/examples/expected/${name}.score.json`))).toBe(true);
  });

  it.each(answers)("%s only asserts known criteria with pass, fail or na", (name) => {
    const asserted = read(`prompts/examples/expected/${name}.score.json`).assert.criteria as Record<string, string>;
    for (const [criterion, verdict] of Object.entries(asserted)) {
      expect(criteria, criterion).toContain(criterion);
      expect(["pass", "fail", "na"], `${criterion}=${verdict}`).toContain(verdict);
    }
  });

  it("the example question is a valid bank-style question type", () => {
    const q = read("prompts/examples/question.json");
    const types = ["behavioral", "tell_me_about_yourself", "technical", "factual", "future_looking", "gap", "motivation"];
    expect(types).toContain(q.classification.type);
  });
});
```

- [ ] **Step 3: Run, expect FAIL then PASS**

Run: `npm test`
Expected: first FAIL if any bank file or example does not validate (a real finding: report it, do not edit Opus's files); once the test code is complete and the files are valid, PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: copy handoff prompts and question bank; validate them against their schemas

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

If any file fails validation: stop, add it to the Build Log as a finding and ask Miguel (the prompts, rubric and bank are Opus's; Sonnet does not edit them).

---

### Task 12: Platform pieces: Mac mic permission and signing, Windows build flags

**Files:**
- Create: `src-tauri/Info.plist`, `src-tauri/Entitlements.plist`, `src-tauri/tauri.macos.conf.json`, `scripts/build-signed-debug.sh`, `.cargo/config.toml`, `scripts/cpu-baseline.ps1`, `src-tauri/src/platform/{macos,windows}/permissions.rs`

- [ ] **Step 1: Mac permission strings and entitlement**

`src-tauri/Info.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSMicrophoneUsageDescription</key>
	<string>Ensayo records your answers from the microphone so you can practise out loud. Audio stays on this Mac.</string>
</dict>
</plist>
```
`src-tauri/Entitlements.plist` (the hardened runtime blocks the mic unless declared):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.security.device.audio-input</key>
	<true/>
</dict>
</plist>
```
`src-tauri/tauri.macos.conf.json`:
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "bundle": {
    "targets": ["app", "dmg"],
    "macOS": { "entitlements": "./Entitlements.plist" }
  }
}
```

- [ ] **Step 2: Signed debug build script** (`scripts/build-signed-debug.sh`, `chmod +x`)

```bash
#!/bin/bash
# Builds a signed debug Ensayo.app so the microphone permission behaves the way users get it and survives rebuilds.
# Uses the free self-signed code-signing certificate already in this Mac's keychain (named in Notion, "Carried over
# from Talaan"). The first run may ask to let codesign use the key: choose Always Allow.
set -euo pipefail
cd "$(dirname "$0")/.."
IDENTITY="${APPLE_SIGNING_IDENTITY:-Parlato Code Signing}"
APPLE_SIGNING_IDENTITY="$IDENTITY" npm run tauri build -- --debug --bundles app
APP="src-tauri/target/debug/bundle/macos/Ensayo.app"
codesign --verify --deep --strict "$APP" && echo "signature ok"
codesign -d --entitlements - "$APP" 2>/dev/null | grep -q "device.audio-input" && echo "microphone entitlement ok"
/usr/libexec/PlistBuddy -c "Print :NSMicrophoneUsageDescription" "$APP/Contents/Info.plist" >/dev/null && echo "microphone usage string ok"
echo "$APP"
```
(The certificate's name is the real name of the keychain item on Miguel's Mac. It is a local file, not code or credit; leave it.)

- [ ] **Step 3: Permission helpers**

Both files are Talaan's, cut down to the microphone only (drop system audio, calendar and automation). Both expose the same three functions, so `platform::mic_status()` works on either OS:

`src-tauri/src/platform/macos/permissions.rs`:
```rust
//! Microphone permission (AVFoundation) and the link to the right System Settings pane.

use block2::RcBlock;
use objc2::runtime::Bool;
use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};
use std::sync::mpsc::channel;
use std::time::Duration;

pub fn mic_status() -> &'static str {
    let Some(media) = (unsafe { AVMediaTypeAudio }) else { return "unknown" };
    match unsafe { AVCaptureDevice::authorizationStatusForMediaType(media) } {
        AVAuthorizationStatus::Authorized => "granted",
        AVAuthorizationStatus::Denied => "denied",
        AVAuthorizationStatus::Restricted => "restricted",
        AVAuthorizationStatus::NotDetermined => "undetermined",
        _ => "unknown",
    }
}

/// Shows the macOS prompt if it hasn't been answered yet. Returns true if allowed.
pub fn request_mic() -> bool {
    let Some(media) = (unsafe { AVMediaTypeAudio }) else { return false };
    let (tx, rx) = channel();
    let block = RcBlock::new(move |granted: Bool| {
        let _ = tx.send(granted.as_bool());
    });
    unsafe { AVCaptureDevice::requestAccessForMediaType_completionHandler(media, &block) };
    rx.recv_timeout(Duration::from_secs(120)).unwrap_or(false)
}

pub const MIC_SETTINGS_URL: &str = "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone";

pub fn open_mic_settings() -> Result<(), String> {
    std::process::Command::new("open").arg(MIC_SETTINGS_URL).status().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_is_one_of_the_known_values() {
        assert!(["granted", "denied", "restricted", "undetermined", "unknown"].contains(&mic_status()));
    }

    #[test]
    fn the_settings_link_points_at_the_microphone_pane() {
        assert!(MIC_SETTINGS_URL.contains("Privacy_Microphone"));
    }
}
```

`src-tauri/src/platform/windows/permissions.rs` (Windows never prompts a desktop app, so "request" only reports what the three Privacy switches say):
```rust
//! Microphone access (the three Privacy & security switches) and the link to the right Settings page.

use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
use winreg::RegKey;

const STORE: &str = r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone";

fn value(root: RegKey, path: &str) -> Option<String> {
    root.open_subkey(path).ok()?.get_value::<String, _>("Value").ok()
}

/// Device-wide, all apps, desktop apps. A missing key means Windows' default: allowed.
pub fn status_from(device: Option<&str>, apps: Option<&str>, desktop: Option<&str>) -> &'static str {
    if [device, apps, desktop].iter().any(|v| v.is_some_and(|v| v.eq_ignore_ascii_case("Deny"))) {
        "denied"
    } else {
        "granted"
    }
}

pub fn mic_status() -> &'static str {
    let device = value(RegKey::predef(HKEY_LOCAL_MACHINE), STORE);
    let apps = value(RegKey::predef(HKEY_CURRENT_USER), STORE);
    let desktop = value(RegKey::predef(HKEY_CURRENT_USER), &format!(r"{STORE}\NonPackaged"));
    status_from(device.as_deref(), apps.as_deref(), desktop.as_deref())
}

pub fn request_mic() -> bool {
    mic_status() == "granted"
}

pub const MIC_SETTINGS_URL: &str = "ms-settings:privacy-microphone";

pub fn open_mic_settings() -> Result<(), String> {
    std::process::Command::new("explorer").arg(MIC_SETTINGS_URL).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn any_switch_off_means_denied() {
        assert_eq!(status_from(Some("Allow"), Some("Allow"), Some("Allow")), "granted");
        assert_eq!(status_from(Some("Deny"), Some("Allow"), Some("Allow")), "denied");
        assert_eq!(status_from(Some("Allow"), Some("Deny"), Some("Allow")), "denied");
        assert_eq!(status_from(Some("Allow"), Some("Allow"), Some("Deny")), "denied");
    }

    #[test]
    fn missing_keys_are_the_windows_default_allow() {
        assert_eq!(status_from(None, None, None), "granted");
    }

    #[test]
    fn the_settings_link_points_at_the_microphone_page() {
        assert_eq!(MIC_SETTINGS_URL, "ms-settings:privacy-microphone");
    }
}
```

Add two commands to `commands.rs` and register them in `lib.rs`:
```rust
#[tauri::command]
pub fn mic_permission() -> &'static str {
    crate::platform::mic_status()
}

#[tauri::command]
pub async fn request_mic_permission() -> bool {
    tauri::async_runtime::spawn_blocking(crate::platform::request_mic).await.unwrap_or(false)
}
```
On the M0 screen, call `request_mic_permission` before the first `start_recording` and show `mic_permission` next to the Record button, with a "Open settings" button calling a third command that wraps `platform::open_mic_settings()`.

- [ ] **Step 4: Windows build flags (verbatim from Talaan; they fix a 10x slowdown)**

```bash
mkdir -p .cargo
cp ~/Developer/Talaan/.cargo/config.toml .cargo/config.toml
cp ~/Developer/Talaan/scripts/cpu-baseline.ps1 scripts/cpu-baseline.ps1
```
Edit `scripts/cpu-baseline.ps1`: keep `$env:GGML_*` setup, `Get-GgmlCaches`, `Test-GgmlBaseline`, `Reset-StaleGgml`; change the regex `'^(whisper-rs-sys|llama-cpp-sys-2)-'` to match `whisper-rs-sys` only for now (llama.cpp returns at M4); delete the Ninja/Vulkan functions. Change `talaan.exe` mentions to `ensayo.exe`.

- [ ] **Step 5: Verify (Mac)**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && sh scripts/build-signed-debug.sh`
Expected: tests pass; script prints `signature ok`, `microphone entitlement ok`, `microphone usage string ok`, then the `.app` path. **If the keychain asks to allow codesign, that is expected on the first run.** If the certificate is missing on this Mac, report it and build unsigned for now (the live mic check in Task 14 then runs via `npm run tauri dev`, with the permission attributed to the terminal).

Windows steps (the flags take effect on the PC; checked there in Task 14).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: Mac mic permission and signing, Windows whisper build flags

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: CLAUDE.md and CI

**Files:**
- Create: `CLAUDE.md`, `.github/workflows/ci.yml`

- [ ] **Step 1: `CLAUDE.md`, written from the Notion pages (never the reverse)**

Sections, in this order (concise; link to Notion rather than copying it):
1. Header: "Generated from the Notion pages Ensayo (Interview Practice App), Interview Practice App v0 Build Plan and Ensayo v0 Features and Screens. Notion is the source of truth: when a decision changes, update Notion first, then regenerate this file."
2. **What Ensayo is** (3 sentences from the parent page).
3. **Build rules:** (1) **Original work: built on the Talaan engine only. Never paste, copy or translate code from Parlato or any other app; other apps may be read for an approach only.** (2) Credit only libraries and models that ship, in `THIRD_PARTY_NOTICES.md`. (3) Prompts, rubric, thresholds and the question bank are drafted by Opus: change none without Miguel. (4) Everything under Decisions, Scoring, Scenarios is decided: implement, don't redesign. (5) Milestones M0 to M10 in order; each starts with a `superpowers:writing-plans` plan in `docs/plans/`; tests and a commit per task; stop at every 🛑. (6) Notion first. (7) Ask before pushing.
4. **When to ask instead of decide** and **when to switch to Opus** (the two paragraphs from the Build Plan).
5. **Where things live:** Notion page names; Drive folder (`Design/`, `Data/`, `Handoff/`) and that code never lives in Drive; repo clone paths on both machines.
6. **Commands:**
```bash
npm install
npm run tauri dev                                  # run the app
npm run dev                                        # UI in a browser (no native commands)
npm test                                           # frontend tests (Vitest)
cargo test --manifest-path src-tauri/Cargo.toml    # Rust tests
npm run build                                      # type-check + build frontend
sh scripts/build-signed-debug.sh                   # Mac: signed debug .app for real mic permission
ENSAYO_SMOKE_WAV=<wav> cargo test --release --manifest-path src-tauri/Cargo.toml smoke_real_model -- --ignored --nocapture
```
   Windows: dot-source `scripts/cpu-baseline.ps1` before release builds; `npm run tauri dev` needs no signing.
7. **Carried over from Talaan** (the lessons list from the Build Plan: async commands, Windows whisper flags, thread counts, Whisper Turbo default, Claude-launched Windows builds save settings in a sandbox folder, one design for both platforms, delete-all-data button).
8. **Architecture:** the module list from the Build Plan, marking which exist after M0 (`recorder`, `speech`, `keys`, `ai::providers`, `commands`) and which come later.

- [ ] **Step 2: `.github/workflows/ci.yml`** (Talaan's, minus the helper and GPU jobs)

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri
      - run: npm ci
      - run: npm test
      - run: npm run build
      - run: cargo test --manifest-path src-tauri/Cargo.toml

  windows:
    runs-on: windows-latest
    env:
      LIBCLANG_PATH: C:\Program Files\LLVM\bin
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri
      - run: npm ci
      - run: npm test
      - run: npm run build
      - name: Whisper must be built for the AVX2 baseline, not this runner's CPU
        shell: pwsh
        run: |
          . ./scripts/cpu-baseline.ps1
          cargo test --release --manifest-path src-tauri/Cargo.toml
          $bad = @(Get-GgmlCaches src-tauri/target | ForEach-Object { Test-GgmlBaseline $_ })
          if ($bad.Count -gt 0) { Write-Error "whisper.cpp was not built for the baseline: $bad"; exit 1 }
```
(The `Drive` path test in Task 3 skips itself on CI; the two token checks still run.)

- [ ] **Step 3: Verify locally what can be verified**

Run: `npm test && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all green. CI itself runs only after the first push (Miguel's call).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: CLAUDE.md from Notion; CI on macOS and Windows

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Verify M0 and hand over at the 🛑

**Done when (Build Plan):** on Miguel's Mac and PC, a 60-second answer records and shows a transcript with word timestamps, Wi-Fi off; Miguel confirms the reuse worked and he can switch machines and continue.

- [ ] **Step 1: Everything automated is green on the Mac**

Run: `npm test && npm run build && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all pass. Paste the counts into the Build Log.

- [ ] **Step 2: Real model on a real WAV (Mac, no mic needed)**

Download `whisper-tiny` through the app once (or reuse Talaan's copy), then run the smoke test on any speech WAV (16 kHz mono; `ffmpeg -i in.m4a -ar 16000 -ac 1 /tmp/sample.wav` makes one):

```bash
ENSAYO_SMOKE_WAV=/tmp/sample.wav ENSAYO_SMOKE_MODEL=whisper-tiny cargo test --release --manifest-path src-tauri/Cargo.toml smoke_real_model -- --ignored --nocapture
```
Expected: lines like `  1.20s  Hello`, word times in increasing order, test passes. Repeat with `ENSAYO_SMOKE_MODEL=parakeet-v3` if that model is on this Mac.

- [ ] **Step 3: Record the findings Miguel asked to track**

In the Build Log note: (a) did word timestamps look right (do the times follow the audio, are there duplicated or missing words); (b) did "um"/"uh" appear (Whisper tends to drop them; **only note it**, the fix is M3); (c) transcription speed on this Mac for the 60-second case; (d) whether Talaan's model folder was found ("On this computer").

- [ ] **Step 4: Live mic check on the Mac (needs Miguel)**

Build the signed app (`sh scripts/build-signed-debug.sh`), open `Ensayo.app`, allow the microphone, turn Wi-Fi off, press Record, talk for 60 seconds, press Stop. Expected: a level meter moves while recording, then a transcript of about 150 words with a time on each word.

- [ ] **Step 5: Build Log entry in Notion (parent page, under Build Log)**

Dated entry: what was built; Talaan source commit `932fb91`; the three flagged decisions (GPU helper not brought, Parlato reuse path removed, word timestamps added on top of Talaan's engine); the Task 14 findings; "waiting on Miguel": live Mac check, push approval, PC check (clone to `C:\Dev\Ensayo`, `git pull`, `npm install`, dot-source `cpu-baseline.ps1`, `npm run tauri dev`).

- [ ] **Step 6: 🛑 Stop.** Report to Miguel, ask for the push OK and the live checks on both machines. Do not start M1 (UI) until he confirms.

---

## Execution notes (what differed from this plan)

- `src/node-test.d.ts` and `src/vite-env.d.ts` were added: TypeScript 6 no longer loads `@types/node` on its own, so tests use a small shim (the same fix Talaan uses).
- `tokio` is a direct dependency (the model downloader uses it for its stall timeout).
- `Cargo.toml` Windows dependencies are `keyring` and `winreg` only (the plan briefly listed the `windows` crate).
- The Mac microphone-permission code was written in Task 10 (with the commands that use it) instead of Task 12; the plists, signing script and Windows flags stayed in Task 12.
- `ai` and `keys` carry `#[allow(dead_code)]` until M4 wires them into the UI.
- Real-model checks done on the Mac: `smoke_real_model` with `whisper-turbo` and `parakeet-ultra` (Talaan's downloads, reused) on an 85 s computer-voice sample. Not done: a live microphone take and anything on Windows (waiting on Miguel).
