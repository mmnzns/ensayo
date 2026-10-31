# Cutting a tester release

1. Update `version` in `src-tauri/tauri.conf.json` (and `package.json`, `src-tauri/Cargo.toml`) to the same number.
2. `git tag v0.2.0 && git push origin v0.2.0`. The **Release** workflow makes a draft release in this repo, then builds the Windows installer and the Apple silicon Mac disk image (no Intel build: ONNX Runtime has no Intel Mac binaries), signs the updater packages, and uploads everything. When both builds are done it adds `latest.json`.
3. Open the draft on the repo's Releases page, install the files on a clean user account, run through `INSTALL.md`, then publish by hand. Publishing is what makes the update visible to installed copies.
4. Before tagging, check that the engine tag is the same in `src-tauri/Cargo.toml` (the `voice-engine-*` dependencies), `src-tauri/llm/Cargo.toml` and `.github/workflows/release.yml` (the `@v0.2.3` and `engine-ref`). See "The AI helpers" below.
5. A dry run without a tag: Actions, **Release**, **Run workflow** (builds the installers and keeps them as artifacts; needs the signing secrets).

## The AI helpers

The built-in local AI runs in a helper program next to the app (`ensayo-llm`, plus `ensayo-llm-vulkan` on Windows for the graphics card). In a release they are **not** built by Ensayo's jobs:

- The `helpers` job in `release.yml` calls voice-engine's reusable workflow (`mmnzns/voice-engine/.github/workflows/build-helpers.yml@v0.2.3`, `engine-ref: v0.2.3`, `helpers: "llm,llm-vulkan"`, `llm-name: ensayo-llm`). It builds with the engine's own `.cargo/config.toml` (CPU baseline: AVX2 on x64, macOS 11), which Ensayo's workspace cannot do for a git dependency.
- **The engine tag must match `Cargo.toml`.** The `@tag`, `engine-ref` and the `voice-engine-*` tags in `src-tauri/Cargo.toml` and `src-tauri/llm/Cargo.toml` move together, otherwise the helper and the app speak different protocol versions and the app shows "could not start".
- The Windows and Mac jobs download `helpers-<triple>` into `src-tauri/binaries`, check each file against `SHA256SUMS`, and (Mac) `chmod +x` it: artifacts lose the executable bit. `SHA256SUMS` and `build-info.txt` (engine commit, rustc, llama.cpp and whisper.cpp versions) sit next to the sidecars; Tauri only bundles what `externalBin` lists. The workflow always builds three targets; the Windows ARM64 helper is not used (no ARM64 Windows installer yet), a known cost.
- The release jobs pass `--config` so `beforeBuildCommand` is just `npm run build`. Without that, `scripts/build-llm-helper.*` would run and overwrite the engine-built helpers with a local build. Dev, `ci.yml` and the **Release** workflow's `test-build` do use those scripts and build the helper from Ensayo's own workspace.
- In CI-built helpers the environment variables start with `VOICE_ENGINE_` (for example `VOICE_ENGINE_LLM_…`), not `ENSAYO_`: the engine's workflow builds its own helper `main`, not Ensayo's (engine issue #21). Nothing in the app relies on the prefix; just remember it when reading a log from a release build or setting a variable for a test.
- The helpers ship unsigned from the engine. On the Mac, Tauri signs every sidecar in the `.app` with the app's identity at bundling, and `scripts/check-mac-signature.sh` (`codesign --verify --deep --strict`) covers them. On Windows nothing is signed (see Code signing).
- Still run the `Test-GgmlBaseline` check in the Windows job (`scripts/cpu-baseline.ps1`): it covers the app's own whisper.cpp, which is built in the Ensayo workspace. The engine's workflow checks the helpers' llama.cpp itself.

### The graphics-card helper (Windows)

`ensayo-llm-vulkan.exe` is only listed as an `externalBin` in the release build. Tauri requires every listed sidecar to exist, and a developer without the Vulkan SDK does not have one, so the default `tauri.conf.json` and `tauri.windows.conf.json` list only `ensayo-llm`. The Windows release job passes `--config` with the full list, after checking that the Vulkan file was downloaded, so a release that lacks it fails instead of silently shipping without it. The app looks for `ensayo-llm-vulkan.exe` next to its own exe and uses the processor helper when it is missing; the installer (`windows/hooks.nsh`) closes both helpers before an update or uninstall.

Locally, `scripts/build-llm-helper.ps1` also builds the Vulkan helper (into `target\vulkan-helper`, so the two builds don't keep recompiling llama.cpp) when `VULKAN_SDK` is set, and skips with a message when it is not. `tauri dev` then finds both next to the debug exe. To bundle the Vulkan helper in a local Windows build, pass the same `--config` the release job uses.

## The automatic updater

Installed copies of Ensayo look for a newer version 20 seconds after they start and every 6 hours after that (an hour after a failed check). When one is found, a banner at the top of the app says "Ensayo 0.2.0 is ready". **Update now** downloads it, checks its signature against the public key in `tauri.conf.json`, installs it and restarts. **Later** hides the banner until the next start. Settings, About shows the version and has **Check for updates**. The banner never appears in a practice session, and an update is refused while an answer is being recorded.

How it fits together:

- The app asks `https://github.com/mmnzns/ensayo/releases/latest/download/latest.json` (`plugins.updater.endpoints` in `src-tauri/tauri.conf.json`, the only place it is set). The Ensayo repo is public, so the installers, `.sig` files and `latest.json` are published on its own Releases page: GitHub serves `latest/download` without a login only for a public repo, and only for a published release. That address is built into every installed copy, so do not move it once testers have installed. Releases used to live in a separate repo, `mmnzns/ensayo-releases`; it was merged into this one before the first release (2026-10-22) and can be archived.
- `scripts/latest-json.mjs` builds `latest.json` from every `.sig` on the release. Test it with `node --test scripts/latest-json.check.mjs`.
- Debug builds (`npm run tauri dev`) never check.
- Local release builds need the signing key too, because `bundle.createUpdaterArtifacts` is on: `TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/ensayo.key)" npm run tauri build`.

### One-time setup

1. The repo must stay public. If it is ever made private, the updater stops working for installed copies.
2. No release token is needed: the workflow publishes with GitHub's own token (the jobs that upload have `contents: write`). Under Settings, Actions, General, Workflow permissions, leave the default; the jobs ask for what they need.
3. Add the secrets `TAURI_SIGNING_PRIVATE_KEY` (the contents of `~/.tauri/ensayo.key`) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (the key was made with an empty password, and GitHub won't store an empty secret: skip this one, the workflow then passes it unset, which Tauri reads as an empty password; confirm with a dry run).
4. Keep `~/.tauri/ensayo.key` safe and backed up somewhere private. It is never committed. If it is lost, installed copies can't be updated: they would reject anything signed with a new key, and testers would have to install the next version by hand. The public half is in `tauri.conf.json`.

The first release with the updater (0.2.0 or later, whatever carries this change) is still installed by hand. From then on, testers on that version get the next one by themselves.

## Code signing: free and self-signed only

Ensayo pays for no certificates, like Talaan and Parlato, until an app earns the money for them (decided 2026-10-22).
What that means, and what INSTALL.md tells testers:

- **Mac:** signed with "Parlato Code Signing", the free self-signed certificate Parlato and Talaan already use (decided
  2026-10-22). The Mac jobs import it from the secrets `APPLE_CERTIFICATE` (base64 of the exported `.p12`),
  `APPLE_CERTIFICATE_PASSWORD` and `APPLE_SIGNING_IDENTITY` (`Parlato Code Signing`). Because every build carries the same
  signature, macOS keeps the microphone permission across updates. It is not an Apple certificate and the app is not
  notarized, so the first open is still right-click, Open. Signed builds use the hardened runtime, so
  `src-tauri/Entitlements.plist` must keep `com.apple.security.device.audio-input` or the microphone is blocked.
  If the three secrets are missing, the Mac job builds ad-hoc signed, and macOS asks for the microphone again after each update.
- **Windows:** unsigned. SmartScreen shows "Windows protected your PC" once; More info, Run anyway. A paid code-signing
  certificate would remove it.

Local signed Mac build (the certificate must be in the login keychain):
`APPLE_SIGNING_IDENTITY="Parlato Code Signing" TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/ensayo.key)" npm run tauri build`.

The updater's own signature (the minisign key above) is separate from both and is always on: it is what stops a tampered
download from installing.

## What a tester build must not contain

No personal data and no stories (the app starts empty), no API keys, and a general question set plus role packs only. The question bank is bundled in the app's code, so it can be read by anyone who unpacks the app: do not put anything in `questions/` that must stay private from testers.
