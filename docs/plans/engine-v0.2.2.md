# Ensayo on voice-engine v0.2.2: implementation plan

> **For agentic workers:** use superpowers:subagent-driven-development. One Sonnet subagent per task, in order. Opus reviews each task's diff before the next starts. Steps use `- [ ]`.

**Goal:** Ensayo runs its speech models, local AI, model catalog, shared model folder and downloads through voice-engine v0.2.2. It keeps its own pipeline, defaults, names and error wording. A first launch moves Ensayo's existing models into the shared folder without downloading anything again.

**Architecture:**
- Speech stays in the app process through `voice-engine-stt`. Ensayo keeps its VAD shaping, chunk loop, recording clock and metrics; only "load a model" and "transcribe one chunk" call the engine.
- Local AI goes through `voice-engine-client::LlmClient`, using the `ensayo-llm` helper. That helper becomes the engine's 3-line main.
- Models live in `voice_engine_models::SharedStore::open(App::Ensayo)`.
- The Tauri command names and JSON shapes stay the same, so the frontend changes only where new features appear: Delete per model, partial and elsewhere states, the graphics-card setting, and Ollama/LM Studio detection.

**Tech stack:** Rust (Tauri 2), React/TypeScript, voice-engine crates at git tag v0.2.2.

**Branch:** `engine-v0.2.2`, cut from `main` at 07f797d, which includes the unpushed 0.1.5 work. The QA branch is `qa`, which is `main` plus `origin/windows-polish`. It is built and checked separately. The two branches merge only when both pass. When they do:
- `llm/src/main.rs` becomes the engine's main. windows-polish's physical-core thread rule is dropped there; the engine owns thread counts. If the engine has no physical-core rule on Windows, open an issue on mmnzns/voice-engine.
- `windows/hooks.nsh`: keep both sets of lines.

**Hard rules for every subagent:**
- Never edit `~/Developer/voice-engine`. If the engine is wrong or missing something, stop and report it.
- Never read or copy Parlato code.
- Never log user text (transcripts, stories, postings, keys).
- Never commit `src-tauri/.cargo/config.toml` `[patch]` overrides.
- Never push.
- Commit after each task. Each commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Reference:** the mapping of every Ensayo file to its engine replacement is in the session scratchpad, at `engine-map.md` (Parts 1 to 3). Its key facts are repeated in each task below.

**Test commands (used throughout):**
- Rust: `cd src-tauri && cargo test --workspace` (baseline before this work: every test passes).
- Frontend: `npm test -- --run`.
- Types: `npx tsc --noEmit`.
- Mac build: `npm run tauri build -- --bundles app`.

---

### Task 1: Dependencies, build settings, helper

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/llm/Cargo.toml`
- Replace: `src-tauri/llm/src/main.rs`
- Delete: `src-tauri/llm-protocol/`
- Modify: `.cargo/config.toml` (repo root; it is found when building from src-tauri)
- Modify: `src-tauri/Cargo.lock`

- [ ] **Step 1: Engine dependencies**
  1. In `src-tauri/Cargo.toml`, add:

     ```toml
     voice-engine-protocol = { git = "https://github.com/mmnzns/voice-engine", tag = "v0.2.2" }
     voice-engine-stt      = { git = "https://github.com/mmnzns/voice-engine", tag = "v0.2.2" }
     voice-engine-models   = { git = "https://github.com/mmnzns/voice-engine", tag = "v0.2.2" }
     voice-engine-client   = { git = "https://github.com/mmnzns/voice-engine", tag = "v0.2.2" }

     [target.'cfg(windows)'.dependencies]
     voice-engine-stt = { git = "https://github.com/mmnzns/voice-engine", tag = "v0.2.2", features = ["directml"] }
     ```

  2. Remove `whisper-rs`, `parakeet-rs`, `ort` and `ensayo-llm-protocol` from the app crate. Remove `sha2` too if nothing else uses it (grep first).
  3. Change the workspace members to `[".", "llm"]`.
- [ ] **Step 2: The helper crate.** `llm/Cargo.toml` depends only on `voice-engine-llm` and `voice-engine-protocol`, both at tag v0.2.2. On Windows it also gets a `vulkan` build, through the feature passthrough `vulkan = ["voice-engine-llm/vulkan"]`. `llm/src/main.rs` becomes:

  ```rust
  fn main() {
      voice_engine_llm::run(voice_engine_protocol::HelperConfig { env_prefix: "ENSAYO" });
  }
  ```

  Delete `llm/tests` cases that test Ensayo's old helper internals. Keep a process test that starts the built helper, sends `{"op":"ping"}`, and expects `ready` with `"protocol":2`.
- [ ] **Step 3: Build settings.** Replace the root `.cargo/config.toml` with the engine's block, keeping Ensayo's comment about /Od:

  ```toml
  [env]
  GGML_NATIVE = { value = "OFF", force = true }
  GGML_AVX = { value = "ON", force = true }
  GGML_AVX2 = { value = "ON", force = true }
  GGML_FMA = { value = "ON", force = true }
  GGML_F16C = { value = "ON", force = true }
  GGML_BMI2 = { value = "ON", force = true }
  MACOSX_DEPLOYMENT_TARGET = { value = "11.0", force = true }
  CMAKE_C_FLAGS_RELEASE = { value = "-O2 -DNDEBUG", force = true }
  CMAKE_CXX_FLAGS_RELEASE = { value = "-O2 -DNDEBUG", force = true }

  [target.x86_64-pc-windows-msvc]
  rustflags = ["-C", "target-feature=+avx2,+fma,+f16c,+bmi2"]
  ```

  Keep `scripts/cpu-baseline.ps1` and `Test-GgmlBaseline`, because they check the app's own whisper.cpp build.
- [ ] **Step 4:** Run `cargo clean --release -p whisper-rs-sys -p llama-cpp-sys-2`. Then run `cargo check --workspace`. The app crate will not compile until Tasks 2 to 4. That is expected; this step only proves the dependency graph resolves.
- [ ] **Step 5:** In `Cargo.lock`, confirm whisper-rs 0.16.0, llama-cpp-sys-2 0.1.159, parakeet-rs 0.3.8 and ort 2.0.0-rc.13 are still the only versions. Run `cargo tree -i whisper-rs` and `cargo tree -i llama-cpp-2`. `llama-cpp-2` must not be reachable from the app crate.
- [ ] **Step 6:** Commit with message `engine: depend on voice-engine v0.2.2; ensayo-llm is the engine helper`. (If the tree does not build yet, Tasks 1 to 3 may be one commit.)

### Task 2: Speech through voice-engine-stt

**Files:**
- Modify: `src-tauri/src/speech/engine.rs` (becomes a thin adapter)
- Delete: `src-tauri/src/speech/whisper.rs`
- Modify: `src-tauri/src/speech/words.rs`
- Modify: `src-tauri/src/speech/vad.rs`
- Modify: `src-tauri/src/speech/transcribe.rs`
- Modify: `src-tauri/src/speech/loaded.rs`

- [ ] **Step 1: Failing test first.** In `speech/engine.rs`, add a test for `gpu_for(kind, os, discrete_card, setting)`:

  ```rust
  /// Ask for the graphics card only where the model has a path; anything else reports a false fallback.
  pub fn gpu_for(kind: Kind, setting_on: bool, card: bool) -> bool {
      setting_on && match kind {
          Kind::Whisper => cfg!(target_os = "macos"),
          Kind::Parakeet => cfg!(windows) && card,
          _ => false,
      }
  }
  ```

  Expected results:

  | Model | Mac | Windows with a card | Windows without a card |
  |---|---|---|---|
  | Whisper | true | false | false |
  | Parakeet TDT | false | true | false |
  | Unified or Nemotron | false | false | false |

  Every case is false when the setting is off. `Kind::Parakeet` is only the TDT models (v2, v3, Ultra); Unified and Nemotron have their own kinds.
- [ ] **Step 2: Load through the engine.** `load(model_id, dir, gpu)` calls:

  ```rust
  voice_engine_stt::load(catalog::find(id), dir, LoadOptions { gpu, threads: None })
  ```

  It returns an Ensayo `Loaded { t: Box<dyn Transcriber>, label: String, shape: Shape }`, where:
  - `label` comes from Ensayo's display-name table (Task 4);
  - `shape` is `Shape::parakeet()` for any model with `chunk_secs == Some(40)`, and `Shape::whisper()` otherwise.
- [ ] **Step 3: Transcribe a chunk.** The call at `transcribe.rs:53` becomes:

  ```rust
  t.transcribe(&chunk, &ChunkOptions { language: Some("en".into()), timing: Timing::Words, keep_fillers: true, vocabulary: vec![] })
  ```

  Then flatten `segments[*].words`, and take `language` from the transcript.
  - `keep_fillers: true` is deliberate: Ensayo counts fillers, and the engine only applies it to Whisper. Check it in Step 7.
  - Delete Ensayo's Parakeet resume loop, its 0.5 s pad and `RESUME_GAP_MS`; the engine now does all three.
- [ ] **Step 4: Words.** `speech/words.rs` keeps `offset()` and re-exports `pub use voice_engine_protocol::stt::Word;`. Delete `clean` and `is_noise`: the engine's Words mode already cleans the words. Every `crate::speech::words::Word` import keeps compiling.
- [ ] **Step 5: VAD.**
  - `Vad::load/detect` becomes `voice_engine_stt::vad::detect(&vad_dir, &samples)`. Convert the ms spans to sample `Span`s with `ms * 16`.
  - Keep `Span`, `Shape`, `shape`, `pack`, `split` and `read_track` unchanged.
  - Add a test that `Shape::parakeet().max_len <= 40 * RATE`. The engine refuses anything longer.
- [ ] **Step 6: The loaded model.** `Speech` holds:
  - the `Box<dyn Transcriber>`;
  - a `ModelHandle` from `store.hold(id)` and another from `store.hold("vad")`, where `vad_dir = handle.dir()`;
  - the backend from `t.backend()`.

  `unload()` drops all of them. The 10-minute idle policy stays. `gpu` comes from the new setting through `gpu_for` (Task 5), never from `cfg!(target_os="macos")` alone. If `backend().fell_back` is true, record it so the UI can show a one-time notice (Task 5).
- [ ] **Step 7: Port the real-model smoke tests.** Port `transcribe.rs smoke_real_model`, `vad.rs vad_smoke` and the `bench_real_models` test to the engine API. They stay `#[ignore]`.
  - On this Mac, run them against Whisper Turbo from the shared folder once Task 3 has moved it in: `cargo test --release -- --ignored smoke bench_real_models`.
  - Record the word error rate and speed, and compare them with the numbers in the Decisions section of Ensayo's Notion page.
  - Check that "um" and "uh" survive in the fixtures that contain them.
- [ ] **Step 8:** Run `cargo test --workspace`. Every speech and metrics test passes. Commit with message `speech: models load and transcribe through voice-engine-stt; Ensayo keeps its pipeline`.

### Task 3: Shared model folder (store, downloads, move-in, delete)

**Files:**
- Create: `src-tauri/src/models_store.rs`
- Modify: `src-tauri/src/speech/models.rs`
- Modify: `src-tauri/src/speech/download.rs` (delete most of it)
- Modify: `src-tauri/src/speech/commands.rs`
- Modify: `src-tauri/src/ai/local_models.rs`
- Modify: `src-tauri/src/local_ai_commands.rs`
- Modify: `src-tauri/src/ai_commands.rs`
- Modify: `src-tauri/src/data_commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/diag_commands.rs`
- Modify: `src-tauri/src/diagnostics.rs`
- Modify: `src-tauri/src/paths.rs`

- [ ] **Step 1: The store module.** `models_store.rs` holds one global `SharedStore`, behind `OnceLock<Result<SharedStore, String>>`, with:
  - `store() -> Result<&'static SharedStore, String>`;
  - `start_up(used: &[&str])`, which runs `move_in(used)`, then `collect()`, then logs the `MoveReport` counts. It logs ids and reasons only, never paths that contain user data.

  Tests use `SharedStore::open_at(App::Ensayo, tempdir)`.
- [ ] **Step 2: Start-up.** In `lib.rs` `.setup`, call `start_up` on `tauri::async_runtime::spawn_blocking`, because hashing and renaming can take a while.
  - Pass `used` = `ai.fast_model` (when the provider is local) + `DEFAULT_MODEL` + `"vad"`. `move_in` already marks every model it adopts from Ensayo's own folder as used.
  - Add a command `use_speech_model(id)`, which calls `store.use_model(id)`. The frontend calls it once at start with `prefs.speech.model`, and again whenever the person picks a model.
  - Every command that touches models waits until start-up has finished, using a `OnceLock` latch with a Condvar.
- [ ] **Step 3: Map store states to the existing UI states.** Keep `SpeechModelEntry`, `ModelStatus` and `LocalAiStatus` as JSON. Map the store's states:

  | Store state | UI state |
  |---|---|
  | `Installed{used_by_me:true}` | `"ready"` |
  | `Installed{used_by_me:false}` | `"on_this_computer"` |
  | `Missing` | `"missing"` |
  | `Partial{fraction}` | `"partial"` (new), with `fraction` |
  | `Downloading{by_me:false}` | `"downloading_elsewhere"` (new) |
  | `Downloading{by_me:true}` | `"downloading"` (new) |

  Write unit tests for each mapping.
- [ ] **Step 4: Downloads.**
  - `download_model(id)` calls `store.download(id, &cancel, &mut |p| emit("model-progress", {id, fraction:p.fraction}))`, then does the same for `"vad"`. A model that is already installed skips straight to done.
  - Add a cancel command for speech downloads, `cancel_model_download`, sharing the cancel flag pattern of `cancel_local_ai_download`.
  - `download_local_ai` uses the same store call. Its event stays `local-ai-progress`.
- [ ] **Step 5: Error wording stays Ensayo's.** Write `fn download_message(model_name: &str, e: &StoreError) -> String`. Every message names the model and says what to do, following the b1a5cb9 style. Keep the existing strings where they exist.
  - `Offline` → the existing network text.
  - `Refused{status}` with a 2xx status → the old "sign in to this Wi-Fi" text (a web page came back instead of the model).
  - `Refused` with any other status → a "the download server refused" text.
  - `DiskFull` → new text that names the size (`ModelInfo::size()`).
  - `Checksum` → the corrupt text.
  - `Stalled` → the stalled text.
  - `Cancelled` → no error.
  - `DownloadingElsewhere` → "Another Craft Concepts app is downloading {name}. It will be ready here when that finishes."

  Write one test per kind.
- [ ] **Step 6: Per-model Delete.** Add the command `delete_model(id) -> {result: "erased"|"kept"|"not_using"}`.
  1. If the model is loaded, unload it first (the speech `unload()`, or `LlmClient::unload` for the AI).
  2. Then call `store.release(id)`.
- [ ] **Step 7: Delete all data.**
  - In `data_commands.rs` `delete_all_data`: first shut down the AI client and unload speech, which drops every handle. Then call `store.release_all()`.
  - Still remove the legacy `models_dir()`; after the move it only holds hard links and leftovers.
  - Keep removing the audio and trash folders.
  - Test this with `open_at`.
- [ ] **Step 8: Other users of the old store.**
  - `ai_commands.rs resolve_engine`: the local model's file is now `Status::Installed.dir.join(files[0].name)`.
  - Diagnostics: report the shared folder path, the installed ids, and which apps use each model. Use `SharedStore::read_only`.
  - `paths::models_dir()` now only means the legacy folder; add a doc comment saying so.
  - Delete `ModelStore`, `talaan_root`, `talaan_models_root` and Ensayo's downloader. Their tests either move to the engine API or are deleted when the engine already covers them.
- [ ] **Step 9:** Run `cargo test --workspace`. Commit with message `models: one shared folder through voice-engine-models; Ensayo's models move in on first start; Delete per model; Delete all data releases Ensayo's models`.

### Task 4: Catalog offering

**Files:**
- Modify: `src-tauri/src/speech/models.rs`
- Modify: `src-tauri/src/ai/local_models.rs`
- Modify: `src/screens/settings/speechModels.ts`
- Modify: `src/screens/settings/SettingsSpeech.tsx`
- Modify: `src/screens/settings/aiSettings.ts`
- Modify: `src/screens/settings/AiEngine.tsx`

- [ ] **Step 1: The speech list.**
  - `speech_models` lists every catalog model with `kind.is_speech()`. Take out diarization, search and vad.
  - Order: Ensayo's current `speech_in_order()` first, then the rest in catalog order.
  - Each entry gets `recommended: bool`, which is true for Ensayo's current 12.
  - Names and notes come from Ensayo's own table by id for those 12. For the rest, use the engine's `name` and `note`.
  - Defaults stay: `DEFAULT_MODEL` is whisper-turbo on the Mac and parakeet-ultra on Windows.
- [ ] **Step 2: Local AI list.** `qwen3.5-4b` stays the recommended model. Then `qwen3.5-9b`, then `granite-4.2-3b`, with Ensayo-worded notes. `choose()` and `recommended()` keep their behaviour.
- [ ] **Step 3: Settings screens.**
  - Show the recommended models first and put the rest behind "Show all models".
  - Show the new states: partial with a Resume button, downloading in another app, and downloading here with a Cancel button.
  - Show a Delete button on every installed model. Its confirm text: "Delete {name}? Other Craft Concepts apps that use it keep it."
  - Write frontend tests for each state in `src/__tests__/settings-speech.test.ts`, and add the equivalent for the AI.
- [ ] **Step 4:** Run `npm test -- --run && npx tsc --noEmit && cargo test --workspace`. Commit with message `settings: every engine speech and local AI model, Ensayo's picks first; Delete, Resume and Cancel per model`.

### Task 5: Graphics-card setting and local AI client

**Files:**
- Modify: `src-tauri/src/storage/settings.rs` (`LocalSettings.gpu: Option<bool>`)
- Modify: `src-tauri/src/ai/local.rs`
- Delete: `src-tauri/src/ai/helper.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/screens/settings/` (the Speech and AI screens)

- [ ] **Step 1: The setting.**
  - The setting is machine-local, and `None` means "use the default".
  - Default: on, on the Mac. On Windows, on only when `voice_engine_stt::discrete_card()` returns `Some`.
  - Add the command `graphics_card() -> {on, card: Option<String>, default_on}` and the command `set_graphics_card(on)`. Setting it unloads speech so the next load uses the new value.
  - Test the default rule with an injected card result.
- [ ] **Step 2: The AI client.** `ai/local.rs` keeps `SHARED`, the path discovery and the user strings. Its runner becomes one `LlmClient`:

  ```rust
  LlmClient::new(LlmConfig {
      cpu_helper: helper_path()?,
      gpu_helper: if cfg!(windows) && gpu_on { vulkan_helper_path() } else { None },
      env: vec![], gpu_env: vec![],
      gpu_failures: Some(app_local().join("gpu-failures.json")),
      gpu_key: format!("{}-{}", env!("CARGO_PKG_VERSION"), card_name_or_none),
      idle_secs: Some(120),
      limits: Limits { total: Duration::from_secs(600), ..Limits::default() },
  })
  ```

  Each call builds `Completion { model_path, n_ctx: 16_384, system, user, json_schema, max_tokens, temperature: 0.0, gpu: gpu_on, thinking: false, thinking_budget: None, seed: None }`.
  - The reply's `prompt_tokens` and `output_tokens` map to `input_tokens` and `output_tokens`.
  - An empty text with `truncated` keeps today's error.
  - `stop_shared()` calls `client.shutdown()`.
  - `vulkan_helper_path()` finds `ensayo-llm-vulkan.exe` next to the exe. If the file is missing, it returns `None` and the AI uses the processor helper.
- [ ] **Step 3: Errors stay Ensayo's.** Map `EngineError` to Ensayo's strings:

  | Engine error | Ensayo text |
  |---|---|
  | `OutOfMemory` | `OUT_OF_MEMORY` |
  | `Crashed` | `CRASHED` |
  | `CouldNotStart`, `VersionMismatch` | `NO_START` |
  | `TimedOut` | `TOO_SLOW` |
  | `PromptTooLong` | the existing too-long text, with the numbers |
  | `Cancelled` | the existing cancel path |
  | anything else | the existing generic failure |

  Write one test per kind.
- [ ] **Step 4: Fallback notice.** When an AI `Outcome.fell_back` or a speech `backend().fell_back` is true, emit `graphics-card-fell-back {what}` once per run. The frontend shows a one-time notice: "The graphics card didn't work for {what}, so Ensayo used the processor. You can turn the card off in Settings."
- [ ] **Step 5: Settings UI.** Add a "Use the graphics card" switch under Settings › Speech, with a line naming the card when there is one. Write a frontend test.
- [ ] **Step 6: Re-run the scoring tests.** Thinking is now explicitly off, and the request fields changed. Run `cargo test --workspace`. Then, when local AI is installed, run `ensayo-eval` on the fixtures with the local model and compare against main. Report the differences; do not tune prompts in this task.
- [ ] **Step 7:** Commit with message `ai: local AI through voice-engine-client; graphics-card setting with the engine's defaults`.

### Task 6: Ollama and LM Studio detection

**Files:**
- Modify: `src-tauri/src/ai_commands.rs`
- Modify: `src/screens/settings/aiSettings.ts`
- Modify: the AI provider screen

- [ ] **Step 1:** Add the command `detect_local_servers()`. It runs `voice_engine_client::servers::detect()` on `spawn_blocking` and returns `[{kind, api_base, running, models:[{id, context_length}]}]`.
- [ ] **Step 2:** When the person picks Ollama or LM Studio, Settings fills in the base URL and lists the detected models with their context sizes. Typing a URL by hand still works. Nothing is detected until the person opens that screen.
- [ ] **Step 3:** Write tests: the Rust side uses `detect_at` with a fake probe; the frontend side tests the list rendering. Commit with message `ai: find Ollama and LM Studio and their models`.

### Task 7: Release workflow, installer, Tauri config

**Files:**
- Modify: `.github/workflows/release.yml`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/tauri.windows.conf.json`
- Modify: `src-tauri/windows/hooks.nsh`
- Modify: `scripts/build-llm-helper.ps1`
- Modify: `docs/RELEASE.md`

- [ ] **Step 1: Release workflow.** Add a `helpers` job to `release.yml`:

  ```yaml
  helpers:
    uses: mmnzns/voice-engine/.github/workflows/build-helpers.yml@v0.2.2
    with: { engine-ref: v0.2.2, helpers: "llm,llm-vulkan", llm-name: ensayo-llm }
  ```

  Each app job gets `needs: helpers` and downloads `helpers-<triple>` into `src-tauri/binaries`. On macOS, run `chmod +x src-tauri/binaries/*-apple-darwin`. Remove the in-job helper build from the release jobs only; `ci.yml`, `test-build` and dev keep `scripts/build-llm-helper.*`. The Windows ARM64 helper builds but goes unused, which is a known cost.
- [ ] **Step 2: Tauri config.** `tauri.windows.conf.json` adds `binaries/ensayo-llm-vulkan` to `externalBin`. `build-llm-helper.ps1` also builds the Vulkan helper locally with `--features vulkan`, as `ensayo-llm-vulkan-<triple>.exe`. If the Vulkan SDK is not installed, it says so and skips; the app then falls back to the processor.
- [ ] **Step 3: Installer.** `hooks.nsh` adds `CheckIfAppIsRunning "$INSTDIR\ensayo-llm-vulkan.exe"` next to the existing two lines, in PREINSTALL and PREUNINSTALL.
- [ ] **Step 4: Release notes doc.** `docs/RELEASE.md` adds that the helpers come from the engine workflow, that the engine tag must match `Cargo.toml`, and that the helper env prefix in CI builds is `VOICE_ENGINE`.
- [ ] **Step 5:** Run `actionlint` if installed. Commit with message `release: helpers from the engine's build workflow; Windows ships the graphics-card AI helper`.

### Task 8: Verification (Opus checks the results; Sonnet runs the commands)

- [ ] **Step 1: Branch checks.** On `engine-v0.2.2`, all of these pass: `cargo test --workspace`, `npm test -- --run`, `npx tsc --noEmit`, and `npm run tauri build -- --bundles app`.
- [ ] **Step 2: Same checks on `qa`.**
- [ ] **Step 3: The update path on this Mac.**
  1. Back up `~/Library/Application Support/com.craftconceptsdigital.ensayo` and Ensayo's data folder.
  2. In installed 0.1.4, download Whisper Turbo and Qwen 3.5 4B. Note each file's inode and size.
  3. Install the new build over 0.1.4 and launch it.
  4. Expect:
     - both models are in `Craft Concepts Digital/Models`, with the same inodes (moved, not copied);
     - no network download (check the app log and that `.part` files are absent);
     - a practice rep transcribes, and a local AI score works;
     - Settings shows both as "ready".
  5. Then press Delete all data. Expect: models with no other user are erased, and anything Talaan uses is kept.
- [ ] **Step 4: Windows check list** for the Windows chat:
  - discrete card default on/off;
  - Parakeet Ultra on DirectML (speed vs 50x real time);
  - the Vulkan AI helper (speed vs 4.96 s on the processor);
  - the fallback notice;
  - the installer closing both helpers during an update;
  - move-in from `%LOCALAPPDATA%\com.craftconceptsdigital.ensayo\models`;
  - Delete per model;
  - the windows-polish items not yet checked by eye.
- [ ] **Step 5: Notion.** Update Ensayo's page (Where things stand, Next up, Release history). Update the "Ensayo: move to v0.2.2" report on the sync page.
