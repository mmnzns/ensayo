# Cutting a tester release

1. Update `version` in `src-tauri/tauri.conf.json` (and `package.json`, `src-tauri/Cargo.toml`) to the same number.
2. `git tag v0.1.0 && git push origin v0.1.0`. The **Release** workflow makes a draft release, then builds the Windows installer and the Mac disk image and uploads them.
3. Open the draft, install both files on a clean user account, run through `INSTALL.md`, then publish.
4. A dry run without a tag: Actions, **Release**, **Run workflow** (builds both installers and keeps them as artifacts).

## Not in v0: the automatic updater

Testers install each new version by downloading the next installer. To add automatic updates later:

1. Make Ensayo's own key pair: `npx tauri signer generate -w ~/.tauri/ensayo.key` (keep the password).
2. Add repository secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
3. Add `tauri-plugin-updater`, put the public key and the `latest.json` endpoint in `tauri.conf.json`, and set `bundle.createUpdaterArtifacts` to `true`, as Talaan does.

## Mac signing

Without a certificate the app is ad-hoc signed and macOS asks for the microphone again after every update. To keep the permission, set the secrets `APPLE_CERTIFICATE` (base64 of a `.p12`), `APPLE_CERTIFICATE_PASSWORD` and `APPLE_SIGNING_IDENTITY`; the Mac job passes them to the build.

## What a tester build must not contain

No personal data and no stories (the app starts empty), no API keys, and a general question set plus role packs only. The question bank is bundled in the app's code, so it can be read by anyone who unpacks the app: do not put anything in `questions/` that must stay private from testers.
